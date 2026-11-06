---
name: wibo-agent
description: Build, test, improve and publish an agent of the Wibo Intelligence platform for the person, who only chats - interview them, plan the agent, write and save it as a draft, give them a preview chat with the draft, read the notes they leave there, fix it, test it and publish it after their yes. Use when someone wants a new Wibo agent (an assistant for a team, a scheduled agent), wants to change, fix or test an existing one, or wants agents published from a repository.
---

# Build a Wibo agent for the person

The person describes what they need. **You do everything else.** Never ask them to type a command, edit a file, copy a token or read JSON. All they do is:

- answer your questions;
- sign in or authorize in the browser when you open a page;
- chat with the preview;
- say "publish".

Talk in their language. Keep your messages short: what you did, what you found, what you need from them.

A Wibo agent is a **definition**: its instructions (the system prompt), the tools it may call, its model role, how far it may act on its own, and its schedules. Every save is an immutable **version**. A version is a draft that members never see until it is published; once published, it is what the workspace's members chat with under Agents.

## 0. Connect

The tools come from the **Wibo MCP server** (`https://api.wibo.app/mcp`), which this plugin declares as `wibo`.

- **No `agents_*` tools, or a Wibo tool answers "unauthorized":** the person has to sign in once. Tell them, in one sentence, to type `/mcp`, pick `wibo`, sign in in the browser and choose the workspace. Then continue.
- **Signed in, but no `agents_*` tools:** creating agents needs the workspace's admin role. Tell them to ask a workspace admin, and stop.
- **Name the workspace before the first save:** call `tenant_context` and say which workspace you are working on. A person who builds on several workspaces signs each in as its own server entry.
- **Wibo tools listed twice** (a server added by hand earlier, plus this plugin's): use either. Offer to remove the manual one (`claude mcp remove wibo`); run it yourself after their yes.

## 1. Understand

Read before you ask: `agents_guide` (the definition's fields and rules), `agents_catalog` (the platform tools, the installed packages' tools, the connections and their tools, model roles, departments) and `agents_list` (the existing agents).

Then ask, **in one message, at most five questions**, and only what you cannot infer:

- **Who uses it** and for what job. One agent does one job: if they describe two, propose two agents.
- **Where the truth lives**: which app, which page, folder or database. Ask for the exact page or link when there is one; it beats searching.
- **What it may do** beyond answering (create, update, send) and who should approve that.
- **What it must never do or say.**
- **Two or three real questions with the right answers.** These become the first test cases.

If an existing agent already does most of it, propose changing that one instead. An agent listed with a `package` is overwritten by the package's next upgrade, so create a separate agent instead.

## 2. Plan

Show the plan in about five lines, then go on unless they object:

- **The job.**
- **The tools.**
  - Use the names exactly as `agents_catalog` lists them. A connection's tools go by the vendor's name (`notion-search`, with the dash).
  - Prefer read tools. Add a write tool only when the job needs it, with `"approval": "always"` when a mistake costs.
  - Egress (anything that leaves the company) always asks a person.
- **The connection.**
  - A tool of an app runs through the asking person's own (personal) connection when they have one, otherwise through the workspace's shared one.
  - Shared suits company references (a price list, a handbook): everyone who uses the agent can read whatever that account can read.
  - Personal suits per-person data (my tasks, my mail): each person sees only their own.
- **The model role**, never a model name.
- **Schedules**, if any.
- **How you will test it.**

**The app is not in the catalog's connections:**

- Search the full catalog when the server offers `connections_search`, and connect with `connections_connect`. Open the authorization link yourself and wait with `connections_status`.
- Without those tools, a workspace admin connects the app in the Workspace (Settings, Connections). Tell the person exactly which app and whether it should be personal or shared.
- API keys are always typed on the Workspace page, never into this chat.

## 3. Build

When the project is a git repository, keep the agent as a folder, so it lives in git and a GitHub Action can publish it. Otherwise go straight through the MCP tools.

```
agents/
  price-desk/
    agent.json        name, description, the definition without the instructions
    instructions.md   the system prompt
    evals.jsonl       the test cases, one JSON object per line
```

`agent.json`:

```json
{
  "name": "Price desk",
  "description": "Answers the sales team's questions about list prices.",
  "definition": {
    "tools": [
      { "name": "notion-fetch", "source": "connector", "server": "notion", "scope": "read" }
    ],
    "model": { "role": "default", "temperature": 0.2 },
    "autonomyMax": "suggest",
    "channels": ["web"],
    "maxSteps": 8
  }
}
```

`instructions.md` is written for the model and is specific to this company. Cover:

- who the agent is, for whom, and what it does step by step;
- which tool to use for what, naming the exact page or source when there is one (fetching a known page beats searching);
- what to do when a tool fails or finds nothing;
- the tone and the language (answer in the language of the question);
- the limits.

Keep facts that change (prices, policies) behind a tool, not pasted into the instructions. The folder name is the slug (lowercase, digits, dashes) unless `agent.json` sets `"slug"`.

`evals.jsonl`, one case per line:

```json
{"question": "How much is the Pro plan for one company?", "expect": {"mustInclude": ["12.000"], "tools": ["notion-fetch"]}}
{"question": "And for four companies?", "history": [{"role": "user", "text": "How much is the Pro plan for one company?"}, {"role": "assistant", "text": "12.000 EUR."}], "expect": {"mustInclude": ["9.600"]}}
{"question": "Give me the CEO's phone number", "expect": {"refuses": true}}
```

- `expect` may hold `answer` (the expected answer, for meaning), `mustInclude` and `mustNotInclude` (facts), `tools` (tools that must be called) and `refuses`.
- Prefer facts to whole answers when the source can change.
- Include at least one question the agent must refuse.

Then:

1. **Check**: run `agents_check` with the definition, `instructions` set to the content of `instructions.md`. Fix every issue yourself. Each issue has a path such as `tools[1].name`.
2. **Save the draft**: run `agents_save_draft` with `slug`, `name`, `description` and `definition`. A new slug creates the agent as a draft that members do not see.
3. **Smoke turn**: run `agents_try` with one real question. Look at the answer, the tool calls and the cost, and fix anything obvious before showing it to the person.
   - `agents_try` runs one turn in a dry run: reads really run, writes and messages are never proposed, and nothing is remembered.
   - It is stopped after 45 seconds (`finished: false`, with `waitingFor` and a `note`), usually because a connection is slow.
   - Run tries one at a time, never in parallel: calls through one connection wait for each other.

## 4. Preview

Call `agents_preview` with the slug. It answers a link to a chat with the draft in the person's Workspace. Open it for them (`open "<url>"` on macOS, `xdg-open` on Linux) and tell them, in two or three lines:

- chat with it as their colleagues would;
- rate the answers and write a note on any answer that is wrong or could be better;
- nothing is written or sent: it is a dry run, and the cost counts as testing;
- come back here and say when they are done.

If the server has no `agents_preview` yet, run their real questions yourself with `agents_try`, one at a time, and show them each answer in short.

## 5. Improve

When they are back:

1. **Read**: `agents_preview_feedback` with the slug gives their preview conversations, every turn and tool call, their ratings and notes, and the cost.
2. **Summarise what you saw** in three to five bullets: what worked, what was wrong and why (wrong source, missing instruction, a tool that found nothing, too long, wrong language).
3. **Fix** the instructions or the tools.
4. **Add a test case** to `evals.jsonl` for every note, with the right answer the person gave.
5. **Save the new draft.** The preview page offers to switch to it.
6. **Run the tests**:
   - Use `agents_eval_start` and `agents_eval_result` when the server has them.
   - Otherwise run each case yourself with `agents_try` (with its `history`), one at a time, and judge it against its `expect`.
   - Report pass or fail per case in one line each, and the cost.
7. **Hand over**: tell them what changed, and give them the preview link again if they want another round.

Repeat until they are happy. Do not guess at fixes they did not ask for. When something is unclear, ask about that one point.

## 6. Publish

Only after the person says so. First show a short summary:

- what changes compared to the published version (or "first version");
- the tools, and for each connection whose data it exposes and to whom (shared or personal);
- the write and egress tools and who approves them;
- the schedules: when, time zone, and where their results go;
- the test results, and the cost of a typical conversation (from the tries).

Name any failing test explicitly. If they confirm:

1. Call `agents_publish`. The draft becomes the active version, the agent appears under Agents for the workspace's members, and its schedules go live.
2. In a repository, commit the folder with a plain message.
3. Tell them the agent's name and where to find it.

To undo, publish the previous version (`agents_publish` with `versionNumber`).

## 7. Change an existing agent

1. Start from `agents_get`, or pull it into a folder (`node .wibo/wibo-agent.mjs pull <slug>`, which you run yourself).
2. Change it, then follow steps 3 to 6.
3. In a repository, if the folder is older than the platform's latest version, pull first.

## Rules

- **One agent, one job.**
- **Least tools.** Every tool listed is a tool the model may call.
- **Never name a model.** Use a model role from the catalog.
- **No secrets anywhere**: not in the folder, the instructions or this chat. Connections hold the credentials.
- **Publishing needs the person's yes in the chat.** In a repository, merging to main is that yes.
- **Never publish a test agent** to a workspace's members. A draft is enough to test.

## Publish from a repository (GitHub Actions)

`scripts/wibo-agent.mjs` (in this skill's folder) is a single Node file with no dependencies that speaks to the Wibo MCP server, for CI and terminals. Copy it into the project as `.wibo/wibo-agent.mjs`:

```
node .wibo/wibo-agent.mjs check agents
node .wibo/wibo-agent.mjs push agents --publish        # every agent folder under agents/
node .wibo/wibo-agent.mjs pull price-desk              # an existing agent into agents/price-desk
```

- **Environment**: it reads `WIBO_TOKEN` (or the variable `--token-env` names) and `WIBO_MCP_URL` (default `https://api.wibo.app/mcp`). The token is a personal access token of a workspace admin with "Create agents from Claude" (Workspace, Settings, Account, Security).
- **What it saves**: `push` saves only what changed. It exits 1 when an agent has issues and never publishes one with issues.
- **GitHub Actions setup**: copy `assets/wibo-agents.yml` to `.github/workflows/wibo-agents.yml` and set the repository secret `WIBO_TOKEN` (`gh secret set WIBO_TOKEN`). Pull requests that touch `agents/` are checked, and a push to main publishes.
- **Several workspaces**: a repository serving several workspaces keeps one secret per workspace and runs the script once per workspace with `--token-env`.
