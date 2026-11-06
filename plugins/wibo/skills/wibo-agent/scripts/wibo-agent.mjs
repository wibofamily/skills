#!/usr/bin/env node
// wibo-agent: check, save, try and publish Wibo agents kept as folders, through the Wibo MCP server.
// Node 18 or later, no dependencies. Source: https://github.com/wibofamily/skills
// (plugins/wibo/skills/wibo-agent/scripts/wibo-agent.mjs). Copy it into a project as .wibo/wibo-agent.mjs.
//
// An agent folder holds agent.json ({ "slug"?, "name", "description", "definition": {...} }),
// instructions.md (the system prompt, which becomes definition.instructions) and optionally
// evals.jsonl (the test cases, one JSON object per line). The slug is the folder's name unless
// agent.json sets one.
//
// Environment: WIBO_TOKEN, a personal access token of a workspace admin with the scope
// "Create agents from Claude" (agents.manage); WIBO_MCP_URL, default https://api.wibo.app/mcp.
// --token-env NAME reads the token from another variable (one per workspace in CI).

import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { setDefaultAutoSelectFamily } from "node:net";
import { basename, join, resolve } from "node:path";

// Node's dual-stack connect (happy eyeballs) times out on networks with a broken IPv6 route to
// the API's host while one address at a time connects at once: try the addresses in order.
setDefaultAutoSelectFamily(false);

const VERSION = "0.3.0";
const MAX_REPEATS = 3;
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

const USAGE = `wibo-agent ${VERSION}: Wibo agents as folders (agent.json + instructions.md + evals.jsonl)

  wibo-agent list                          the workspace's agents
  wibo-agent check <dir>...                check definitions and test cases, save nothing
  wibo-agent push <dir>... [--publish]     save each as a draft (unchanged ones add nothing) with
                                           its test cases, then publish it with --publish
  wibo-agent eval <dir|slug>               save the folder's test cases and run them on the latest
                                           draft (or --version N) in a dry run; exits 1 when fewer
                                           pass than --min-pass (default 1, every case)
  wibo-agent try <dir|slug> "<message>"    one turn of the latest draft in a dry run
                                           (stopped after --timeout seconds, default 45)
  wibo-agent try <dir|slug> --schedule N   the draft's schedule N (0 is the first) fired now, dry run
  wibo-agent publish <slug> [--version N]  publish the latest draft (or version N)
  wibo-agent pull <slug> [--into <dir>]    write an existing agent as a folder, test cases included
  wibo-agent catalog                       what an agent of this workspace may use
  wibo-agent guide                         the authoring guide

A <dir> is an agent folder, or a folder of agent folders (push agents --publish).

Options: --message "<text>" (change message of push), --version N, --into <dir>, --timeout S, --json,
         --repeats N (eval: runs per case, 1 to 3), --min-pass R (eval: 0 to 1),
         --token-env NAME (default WIBO_TOKEN)
Environment: WIBO_TOKEN (scope agents.manage), WIBO_MCP_URL (default https://api.wibo.app/mcp)`;

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--publish" || arg === "--json" || arg === "--help" || arg === "-h") flags[arg.replace(/^-+/, "")] = true;
    else if (arg === "--message" || arg === "--version" || arg === "--into" || arg === "--token-env" || arg === "--timeout" || arg === "--repeats" || arg === "--min-pass" || arg === "--schedule") {
      const value = argv[++i];
      if (value === undefined) usageError(`${arg} needs a value`);
      flags[arg.slice(2)] = value;
    } else if (arg.startsWith("--")) usageError(`unknown option ${arg}`);
    else positional.push(arg);
  }
  return { command: positional[0], rest: positional.slice(1), flags };
}

function usageError(message) {
  console.error(`wibo-agent: ${message}\n\n${USAGE}`);
  process.exit(2);
}

function versionFlag(flags) {
  if (flags.version === undefined) return undefined;
  const n = Number(flags.version);
  if (!Number.isInteger(n) || n < 1) usageError("--version is a positive integer");
  return n;
}

// ---------------------------------------------------------------- MCP client

class ToolError extends Error {}

function client(flags) {
  const tokenEnv = flags["token-env"] ?? "WIBO_TOKEN";
  const token = (process.env[tokenEnv] ?? "").trim();
  if (!token) {
    console.error(`wibo-agent: set ${tokenEnv} to a personal access token with the scope agents.manage (Workspace, Settings, Account, Security, Personal access tokens)`);
    process.exit(2);
  }
  const url = process.env.WIBO_MCP_URL || "https://api.wibo.app/mcp";
  let id = 0;
  let protocolVersion = null;

  async function rpc(method, params) {
    const headers = { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}` };
    if (protocolVersion) headers["mcp-protocol-version"] = protocolVersion;
    let res;
    try {
      res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
    } catch (err) {
      throw new Error(`cannot reach ${url}: ${err.cause?.message ?? err.message}`);
    }
    if (res.status === 401) throw new Error(`${url} refused the token in ${tokenEnv}: unknown, revoked, expired, or without the scope agents.manage`);
    const body = await res.text();
    if (!res.ok) throw new Error(`${url} answered ${res.status}: ${body.slice(0, 300)}`);
    let message;
    if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
      const data = body.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).filter(Boolean);
      message = data.map((d) => JSON.parse(d)).find((m) => m.id === id);
    } else message = JSON.parse(body);
    if (!message) throw new Error(`${url} sent no answer to ${method}`);
    if (message.error) throw new Error(`${method}: ${message.error.message ?? JSON.stringify(message.error)}`);
    return message.result;
  }

  return {
    async call(name, args = {}) {
      if (!protocolVersion) {
        const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "wibo-agent", version: VERSION } });
        protocolVersion = init?.protocolVersion ?? "2025-06-18";
      }
      const result = await rpc("tools/call", { name, arguments: args });
      const text = (result?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
      if (result?.isError) {
        if (/^MCP error -32602: Tool .* not found|Tool .* not found/i.test(text)) throw new ToolError(`the token cannot use ${name}: give it the scope agents.manage (workspace admins only)`);
        throw new ToolError(text);
      }
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    },
  };
}

// ---------------------------------------------------------------- agent folders

async function isDir(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** The agent folders a path means: itself when it holds agent.json, else its subfolders that do. */
async function agentDirs(paths) {
  const out = [];
  for (const p of paths) {
    const dir = resolve(p);
    if (!(await isDir(dir))) throw new Error(`${p} is not a folder`);
    if (await exists(join(dir, "agent.json"))) {
      out.push(dir);
      continue;
    }
    const children = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => join(dir, d.name)).sort();
    const found = [];
    for (const child of children) if (await exists(join(child, "agent.json"))) found.push(child);
    if (found.length === 0) throw new Error(`${p} holds no agent.json, nor any folder with one`);
    out.push(...found);
  }
  return out;
}

/** Reads one agent folder into { slug, name, description, definition }. */
async function readAgent(dir) {
  const file = join(dir, "agent.json");
  let spec;
  try {
    spec = JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    throw new Error(`${file}: ${err.message}`);
  }
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new Error(`${file}: expected an object`);
  const slug = spec.slug ?? basename(dir);
  if (!SLUG.test(slug)) throw new Error(`${file}: the slug "${slug}" must be lowercase letters, digits and dashes (rename the folder or set "slug")`);
  if (typeof spec.name !== "string" || !spec.name.trim()) throw new Error(`${file}: "name" is required`);
  const definition = spec.definition ?? {};
  if (typeof definition !== "object" || Array.isArray(definition)) throw new Error(`${file}: "definition" must be an object`);
  const instructionsFile = join(dir, "instructions.md");
  const hasFile = await exists(instructionsFile);
  if (hasFile && definition.instructions !== undefined) throw new Error(`${dir}: instructions are both in instructions.md and in definition.instructions; keep one`);
  const instructions = hasFile ? (await readFile(instructionsFile, "utf8")).trim() : definition.instructions;
  if (typeof instructions !== "string" || !instructions.trim()) throw new Error(`${dir}: write the agent's instructions in instructions.md`);
  const cases = await readCases(join(dir, "evals.jsonl"));
  return { dir, slug, name: spec.name.trim(), description: typeof spec.description === "string" ? spec.description.trim() : undefined, definition: { ...definition, instructions }, cases };
}

const EXPECT_KEYS = ["answer", "mustInclude", "mustNotInclude", "tools", "refuses"];

/** The test cases of evals.jsonl (null without the file), each checked for the shape the server takes. */
async function readCases(file) {
  if (!(await exists(file))) return null;
  const cases = [];
  const lines = (await readFile(file, "utf8")).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let c;
    try {
      c = JSON.parse(line);
    } catch (err) {
      throw new Error(`${file}:${i + 1}: not JSON (${err.message})`);
    }
    if (!c || typeof c !== "object" || Array.isArray(c)) throw new Error(`${file}:${i + 1}: a case is an object`);
    if (typeof c.question !== "string" || !c.question.trim()) throw new Error(`${file}:${i + 1}: "question" is required`);
    if (!c.expect || typeof c.expect !== "object" || !EXPECT_KEYS.some((k) => c.expect[k] !== undefined)) throw new Error(`${file}:${i + 1}: "expect" needs at least one of ${EXPECT_KEYS.join(", ")}`);
    cases.push(c);
  }
  if (cases.length === 0) throw new Error(`${file}: no test case; delete the file or add one`);
  return cases;
}

/** Saves an agent's test cases; a line for the person. */
async function saveCases(api, slug, cases) {
  const r = await api.call("agents_evals_save", { slug, cases });
  const changed = [r.added && `${r.added} added`, r.updated && `${r.updated} updated`, r.removed && `${r.removed} removed`].filter(Boolean);
  return `${r.cases} test case(s)${changed.length ? `: ${changed.join(", ")}` : ", unchanged"}`;
}

function changeMessage(flags) {
  if (flags.message) return flags.message;
  const sha = process.env.GITHUB_SHA;
  if (sha) return `Pushed from ${process.env.GITHUB_REPOSITORY ?? "git"}@${sha.slice(0, 7)}`;
  return "Pushed with wibo-agent";
}

// ---------------------------------------------------------------- output

function printIssues(issues) {
  for (const issue of issues ?? []) console.log(`    ${issue.path}: ${issue.message}`);
}

/** The issues a refusal carries after its first line (`code: message\n{ "issues": [...] }`). */
function refusal(err) {
  const [line, ...rest] = String(err.message).split("\n");
  let issues = [];
  try {
    issues = JSON.parse(rest.join("\n")).issues ?? [];
  } catch {
    // No issues.
  }
  return { line, issues };
}

// ---------------------------------------------------------------- commands

async function cmdList(api, flags) {
  const { agents } = await api.call("agents_list");
  if (flags.json) return console.log(JSON.stringify(agents, null, 2));
  if (agents.length === 0) return console.log("No agents yet.");
  for (const a of agents) {
    const versions = a.activeVersion ? `v${a.activeVersion} active` : "not published";
    const latest = a.latestStatus === "draft" && a.latestVersion !== a.activeVersion ? `, draft v${a.latestVersion}` : "";
    console.log(`${a.slug.padEnd(28)} ${a.name}  (${versions}${latest}${a.package ? `, from package ${a.package}` : ""})`);
  }
}

async function cmdCheck(api, paths, flags) {
  if (paths.length === 0) usageError("check needs an agent folder");
  let failed = 0;
  const results = [];
  for (const dir of await agentDirs(paths)) {
    let agent;
    try {
      agent = await readAgent(dir);
    } catch (err) {
      failed++;
      console.log(`x ${basename(dir)}: ${err.message}`);
      continue;
    }
    const result = await api.call("agents_check", { definition: agent.definition });
    results.push({ slug: agent.slug, ...result });
    if (flags.json) continue;
    if (result.ok) console.log(`ok ${agent.slug}`);
    else {
      failed++;
      console.log(`x ${agent.slug}: ${result.issues.length} issue(s)`);
      printIssues(result.issues);
    }
  }
  if (flags.json) console.log(JSON.stringify(results, null, 2));
  return failed === 0 && results.every((r) => r.ok) ? 0 : 1;
}

async function cmdPush(api, paths, flags) {
  if (paths.length === 0) usageError("push needs an agent folder");
  let failed = 0;
  const results = [];
  for (const dir of await agentDirs(paths)) {
    let agent;
    try {
      agent = await readAgent(dir);
    } catch (err) {
      failed++;
      console.log(`x ${basename(dir)}: ${err.message}`);
      continue;
    }
    let saved;
    try {
      saved = await api.call("agents_save_draft", { slug: agent.slug, name: agent.name, ...(agent.description !== undefined ? { description: agent.description } : {}), definition: agent.definition, changeMessage: changeMessage(flags), skipIfUnchanged: true });
    } catch (err) {
      if (!(err instanceof ToolError)) throw err;
      failed++;
      const { line, issues } = refusal(err);
      console.log(`x ${agent.slug}: ${line}`);
      printIssues(issues);
      results.push({ slug: agent.slug, error: line, issues });
      continue;
    }
    const result = { ...saved, cases: null, published: null };
    const what = saved.unchanged ? `unchanged, version ${saved.versionNumber} (${saved.status})` : `saved version ${saved.versionNumber} as a draft${saved.created ? " of a new agent" : ""}`;
    if (!flags.json) console.log(`${saved.publishable ? "ok" : "x"} ${agent.slug}: ${what}`);
    // The test cases are saved apart from the version: a refusal is reported and does not stop the publish.
    if (agent.cases) {
      try {
        result.cases = await saveCases(api, agent.slug, agent.cases);
        if (!flags.json) console.log(`    ${result.cases}`);
      } catch (err) {
        if (!(err instanceof ToolError)) throw err;
        failed++;
        const { line, issues } = refusal(err);
        result.cases = { error: line, issues };
        if (!flags.json) {
          console.log(`    test cases not saved: ${line}`);
          printIssues(issues);
        }
      }
    }
    if (!saved.publishable) {
      failed++;
      if (!flags.json) {
        console.log("    not publishable yet:");
        printIssues(saved.issues);
      }
      results.push(result);
      continue;
    }
    if (flags.publish) {
      try {
        const published = await api.call("agents_publish", { slug: agent.slug, versionNumber: saved.versionNumber });
        result.published = published;
        if (!flags.json) console.log(published.alreadyActive ? `    version ${published.versionNumber} is already the active one` : `    published version ${published.versionNumber}`);
      } catch (err) {
        if (!(err instanceof ToolError)) throw err;
        failed++;
        const { line, issues } = refusal(err);
        result.published = { error: line, issues };
        if (!flags.json) {
          console.log(`    not published: ${line}`);
          printIssues(issues);
        }
      }
    }
    results.push(result);
  }
  if (flags.json) console.log(JSON.stringify(results, null, 2));
  return failed === 0 ? 0 : 1;
}

async function cmdTry(api, rest, flags) {
  const [target, message] = rest;
  let schedule;
  if (flags.schedule !== undefined) {
    schedule = Number(flags.schedule);
    if (!Number.isInteger(schedule) || schedule < 0) usageError("--schedule is the schedule's index in the definition, 0 for the first");
    if (message) usageError("try takes a message or --schedule, not both");
  }
  if (!target || (!message && schedule === undefined)) usageError('try needs an agent folder or slug and a message: wibo-agent try agents/hr-desk "Who leads HR?"');
  let slug = target;
  if (await isDir(target)) slug = (await readAgent(resolve(target))).slug;
  else if (!SLUG.test(target)) usageError(`${target} is neither an agent folder nor a slug`);
  let timeoutSeconds;
  if (flags.timeout !== undefined) {
    timeoutSeconds = Number(flags.timeout);
    if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 10 || timeoutSeconds > 120) usageError("--timeout is a whole number of seconds from 10 to 120");
  }
  const result = await api.call("agents_try", { slug, ...(schedule !== undefined ? { schedule } : { message }), ...(versionFlag(flags) ? { versionNumber: versionFlag(flags) } : {}), ...(timeoutSeconds ? { timeoutSeconds } : {}) });
  if (flags.json) return console.log(JSON.stringify(result, null, 2));
  console.log(`${slug} v${result.versionNumber} (${result.model}, dry run)\n`);
  if (result.schedule) console.log(`Schedule ${result.schedule.index} (${result.schedule.cron}, ${result.schedule.timezone}): ${result.schedule.message}\n`);
  console.log(result.answer || "(no answer)");
  if (result.toolCalls.length > 0) {
    console.log("\nTool calls:");
    for (const call of result.toolCalls) console.log(`  ${call.tool} ${JSON.stringify(call.args)}\n    -> ${JSON.stringify(call.result).slice(0, 400)}`);
  }
  if (result.finished === false) {
    for (const call of result.waitingFor ?? []) console.log(`\nStill waiting after ${Math.round(call.waitedMs / 1000)}s: ${call.tool} ${JSON.stringify(call.args)}`);
    console.log(`\nNot finished. ${result.note ?? ""}`);
  }
  console.log(`\n${result.usage.inputTokens} input and ${result.usage.outputTokens} output tokens, EUR ${result.costEur}, finish: ${result.finishReason ?? "?"}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cmdEval(api, rest, flags) {
  const [target] = rest;
  if (!target) usageError("eval needs an agent folder or slug: wibo-agent eval agents/hr-desk");
  let slug = target;
  if (await isDir(target)) {
    const agent = await readAgent(resolve(target));
    slug = agent.slug;
    if (agent.cases) {
      const saved = await saveCases(api, slug, agent.cases);
      if (!flags.json) console.log(`${slug}: ${saved}`);
    }
  } else if (!SLUG.test(target)) usageError(`${target} is neither an agent folder nor a slug`);
  const repeats = flags.repeats === undefined ? 1 : Number(flags.repeats);
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > MAX_REPEATS) usageError(`--repeats is a whole number from 1 to ${MAX_REPEATS}`);
  const minPass = flags["min-pass"] === undefined ? 1 : Number(flags["min-pass"]);
  if (!Number.isFinite(minPass) || minPass < 0 || minPass > 1) usageError("--min-pass is a number from 0 to 1");
  const started = await api.call("agents_eval_start", { slug, repeats, ...(versionFlag(flags) ? { versionNumber: versionFlag(flags) } : {}) });
  if (!flags.json) console.log(`${slug} v${started.versionNumber} (${started.versionStatus}): ${started.totalItems} case(s) x ${started.repeats} = ${started.totalRuns} run(s), about EUR ${started.estimate.totalEur}, scorers ${started.scorers.join(", ")}`);
  // An evaluation takes minutes: read its state every 20 seconds, for 30 minutes at most.
  let result;
  for (const deadline = Date.now() + 30 * 60_000; ; ) {
    await sleep(20_000);
    result = await api.call("agents_eval_result", { experimentId: started.experimentId });
    if (result.summary) break;
    if (Date.now() > deadline) throw new Error(`the evaluation ${started.experimentId} is still ${result.status} after 30 minutes`);
    if (!flags.json) console.log(`  ${result.progress.runsDone} of ${result.progress.runs} runs done`);
  }
  if (flags.json) console.log(JSON.stringify(result, null, 2));
  else {
    for (const c of result.cases ?? []) {
      console.log(`${c.passed ? "ok" : "x "} ${c.key}  ${c.question.slice(0, 100)}${repeats > 1 ? `  (${c.attempts.passed}/${c.attempts.ran})` : ""}`);
      for (const f of c.failures ?? []) console.log(`     ${f}`);
      if (c.error) console.log(`     error: ${c.error}`);
    }
    const s = result.summary;
    console.log(`\n${s.passed} of ${s.cases} passed (${Math.round(s.passRate * 100)}%), EUR ${s.costEur}${s.durationSeconds ? `, ${s.durationSeconds}s` : ""}`);
    const cmp = result.comparison;
    if (cmp?.baseline) {
      console.log(`Compared with v${cmp.baseline.versionNumber} (${Math.round(cmp.baseline.passRate * 100)}%): ${cmp.regressed.length} now failing, ${cmp.fixed.length} now passing, ${cmp.newCases} new`);
      for (const r of cmp.regressed) console.log(`  now failing: ${r.key}  ${r.question.slice(0, 100)}`);
    } else if (cmp?.note) console.log(cmp.note);
    if (result.note) console.log(result.note);
  }
  return result.status === "completed" && result.summary.passRate >= minPass ? 0 : 1;
}

async function cmdPublish(api, rest, flags) {
  const [slug] = rest;
  if (!slug || !SLUG.test(slug)) usageError("publish needs an agent slug");
  const result = await api.call("agents_publish", { slug, ...(versionFlag(flags) ? { versionNumber: versionFlag(flags) } : {}) });
  if (flags.json) return console.log(JSON.stringify(result, null, 2));
  console.log(result.alreadyActive ? `${slug}: version ${result.versionNumber} is already the active one` : `${slug}: published version ${result.versionNumber}`);
}

async function cmdPull(api, rest, flags) {
  const [slug] = rest;
  if (!slug || !SLUG.test(slug)) usageError("pull needs an agent slug");
  const found = await api.call("agents_get", { slug, ...(versionFlag(flags) ? { versionNumber: versionFlag(flags) } : {}) });
  if (!found.version) throw new Error(`${slug} has no version`);
  const dir = resolve(flags.into ?? join("agents", slug));
  if (await exists(join(dir, "agent.json"))) throw new Error(`${dir} already holds an agent.json; pull into another folder with --into`);
  const { instructions, ...definition } = found.version.definition ?? {};
  await mkdir(dir, { recursive: true });
  const spec = { ...(basename(dir) !== slug ? { slug } : {}), name: found.agent.name, description: found.agent.description ?? "", definition };
  await writeFile(join(dir, "agent.json"), `${JSON.stringify(spec, null, 2)}\n`);
  await writeFile(join(dir, "instructions.md"), `${String(instructions ?? "").trim()}\n`);
  let caseCount = 0;
  try {
    const { cases } = await api.call("agents_evals_get", { slug });
    if (cases?.length) {
      await writeFile(join(dir, "evals.jsonl"), cases.map((c) => JSON.stringify(c)).join("\n") + "\n");
      caseCount = cases.length;
    }
  } catch (err) {
    // A server without test cases yet: the folder is complete without them.
    if (!(err instanceof ToolError)) throw err;
  }
  console.log(`${slug}: version ${found.version.number} (${found.version.status})${caseCount ? ` and ${caseCount} test case(s)` : ""} written to ${dir}${found.agent.package ? `\n  note: this agent came with the package ${found.agent.package}; its next upgrade overwrites what you publish` : ""}`);
}

// ---------------------------------------------------------------- main

const { command, rest, flags } = parseArgs(process.argv.slice(2));
if (!command || flags.help || flags.h || command === "help") {
  console.log(USAGE);
  process.exit(command || flags.help || flags.h ? 0 : 2);
}

const commands = {
  list: (api) => cmdList(api, flags),
  check: (api) => cmdCheck(api, rest, flags),
  push: (api) => cmdPush(api, rest, flags),
  eval: (api) => cmdEval(api, rest, flags),
  try: (api) => cmdTry(api, rest, flags),
  publish: (api) => cmdPublish(api, rest, flags),
  pull: (api) => cmdPull(api, rest, flags),
  catalog: async (api) => console.log(JSON.stringify(await api.call("agents_catalog"), null, 2)),
  guide: async (api) => console.log(await api.call("agents_guide")),
};
if (!commands[command]) usageError(`unknown command ${command}`);

try {
  const code = await commands[command](client(flags));
  process.exit(typeof code === "number" ? code : 0);
} catch (err) {
  if (err instanceof ToolError) {
    const { line, issues } = refusal(err);
    console.error(`wibo-agent: ${line}`);
    printIssues(issues);
  } else console.error(`wibo-agent: ${err.message}`);
  process.exit(1);
}
