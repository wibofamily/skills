---
name: wibo-agent
description: Build, test, improve, publish and look after an agent of the Wibo Intelligence platform for the person, who only chats - interview them, plan the agent, connect the apps it needs, write and save it as a draft, give them a preview chat with the draft, read the notes they leave there, fix it, keep its test cases and run them, publish it after their yes, then read how it does and improve it. Use when someone wants a new Wibo agent (an assistant for a team, a scheduled agent), wants to change, fix, test, archive or check on an existing one, or wants agents published from a repository.
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
- **Signed in, but no `agents_*` tools:** the sign-in did not grant agent building. Tell them to sign in again (`/mcp`, `wibo`, re-authenticate) and keep "Build agents of your own" (or, for admins, "Create agents") ticked on the consent page.
- **Name the workspace and the role before the first save:** call `tenant_context`, say which workspace you are working on, and note the person's role.
  - An **admin** builds agents for the workspace and publishes them.
  - A **member** builds agents of their own: private (only they see them) until an admin approves publishing them to the workspace. Say this once, before you start.
  - A person who builds on several workspaces signs each in as its own server entry.
- **Wibo tools listed twice** (a server added by hand earlier, plus this plugin's): use either. Offer to remove the manual one (`claude mcp remove wibo`); run it yourself after their yes.

## 1. Understand

Read before you ask: `agents_guide` (the definition's fields and rules), `agents_catalog` (the platform tools, the installed packages' tools, the connections and their tools, model roles, departments) and `agents_list` (the existing agents).

Then ask, **in one message, at most five questions**, and only what you cannot infer:

- **Who uses it** and for what job. One agent does one job: if they describe two, propose two agents.
- **Where the truth lives**: which app, which page, folder or database. Ask for the exact page or link when there is one; it beats searching.
- **What it may do** beyond answering (create, update, send) and who should approve that.
- **What it must never do or say.**
- **Two or three real questions with the right answers.** These become the first test cases.

If an existing agent already does most of it, propose changing that one instead. An agent listed with a `package` is overwritten by the package's next upgrade, so create a separate agent instead. A member can change only the agents `agents_list` marks `mine`; for another one, propose a new agent of their own.

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
- **Schedules**, if any. A member's private agent runs its schedules as them.
- **Who it is for**: every member, or an audience (roles, departments by name, people). Admins set it; a member asks for it in the publish request.
- **How you will test it.**

**The app is not in the catalog's connections:** connect it now, before you build.

1. **Find it**: `connections_search` with the app's name or what it does. For one app there may be several routes: take the result marked preferred (the vendor's own MCP server before Composio) unless the person has a reason. A match listed under `hidden` is not allowed for this workspace (its data residency policy): say so and stop on that app.
2. **Connect**: `connections_connect` with the id and the scope you planned (`shared` for a company account, `personal` for each person's own).
   - `open_url`: open it for the person (`open "<url>"` on macOS, `xdg-open` on Linux) and tell them to sign in and approve. The link works for 10 minutes.
   - `enter_key`: the app connects with a key. Open the Workspace page it gives and tell them to paste the key there. **Never ask for a key, token or password in this chat.**
   - `done`: it is already connected; go on.
3. **Wait**: `connections_status` every few seconds, for a few minutes at most, telling them what you wait for. `active` lists the tools by the vendor's name: use those names in the definition, with `"source": "connector", "server": "<connector id>"`. `start_again` or `reconnect`: run `connections_connect` again.
4. Without those tools, a workspace admin connects the app in the Workspace (Settings, Connections). Tell the person exactly which app and whether it should be personal or shared.

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
{"id": "pro-one", "question": "How much is the Pro plan for one company?", "expect": {"mustInclude": ["12.000"], "tools": ["notion-fetch"]}}
{"id": "pro-four", "question": "And for four companies?", "history": [{"role": "user", "text": "How much is the Pro plan for one company?"}, {"role": "assistant", "text": "12.000 EUR."}], "expect": {"mustInclude": ["9.600"]}}
{"id": "no-phone", "question": "Give me the CEO's phone number", "expect": {"refuses": true}, "note": "Personal data stays out"}
```

- `expect` may hold `answer` (the expected answer, for meaning), `mustInclude` and `mustNotInclude` (facts), `tools` (tools that must be called) and `refuses`. At least one.
- Give every case a short `id`: editing a case with an id updates it instead of replacing it. `note` says why the case exists.
- Prefer facts to whole answers when the source can change.
- Include at least one question the agent must refuse.

Then:

1. **Check**: run `agents_check` with the definition, `instructions` set to the content of `instructions.md`. Fix every issue yourself. Each issue has a path such as `tools[1].name`.
2. **Save the draft**: run `agents_save_draft` with `slug`, `name`, `description`, `definition` and `baseVersionNumber` (0 for a new agent; otherwise the newest version number you read with `agents_get` or got from your last save). A new slug creates the agent as a draft that members do not see.
   - Refused with `conflict`: someone else saved a version since you read it. Read it with `agents_get`, tell the person what changed, merge, and save again with the new number.
3. **Save the test cases**: `agents_evals_save` with the slug and every case of `evals.jsonl`. It makes the stored cases exactly these.
4. **Smoke turn**: run `agents_try` with one real question. Look at the answer, the tool calls and the cost, and fix anything obvious before showing it to the person.
   - `agents_try` runs one turn in a dry run: reads run, writes and messages are never proposed, and nothing is remembered.
   - It is stopped after 45 seconds (`finished: false`, with `waitingFor` and a `note`), usually because a connection is slow.
   - A scheduled agent: `agents_try` with `schedule` (the schedule's index, 0 for the first) and no message runs what that schedule sends, as it would run at its time.

## 4. Preview

Call `agents_preview` with the slug. It answers a link to a chat with the draft in the person's Workspace.

An admin whose agent serves people unlike them (another department, a member without their access) can preview as one of those people: `agents_preview` or `agents_try` with `previewAs` (an email or identity id). Their role, departments and audience apply; a real person's own connections and private data are never used (those tools say they would be called, and are not). Suggest it when the answers depend on who asks. Open it for them (`open "<url>"` on macOS, `xdg-open` on Linux) and tell them, in two or three lines:

- chat with it as their colleagues would;
- rate the answers and write a note on any answer that is wrong or could be better;
- nothing is written or sent: it is a dry run, and the cost counts as testing;
- come back here and say when they are done.

If the server has no `agents_preview` yet, run their real questions yourself with `agents_try` and show them each answer in short.

## 5. Improve

When they are back:

1. **Read**: `agents_preview_feedback` with the slug gives their preview conversations, every turn and tool call, their ratings and notes, and the cost.
2. **Summarise what you saw** in three to five bullets: what worked, what was wrong and why (wrong source, missing instruction, a tool that found nothing, too long, wrong language).
3. **Fix** the instructions or the tools.
4. **Add a test case** to `evals.jsonl` for every note, with the right answer the person gave.
5. **Save the new draft.** The preview page offers to switch to it.
6. **Run the tests**:
   - Save the cases (`agents_evals_save`), then `agents_eval_start` with the slug. It answers at once with the number of runs and a cost estimate; say the estimate.
   - Use `repeats: 2` or `3` when an answer depends on live data or the model varies: a case passes when most of its runs pass.
   - Poll `agents_eval_result` every 20 to 30 seconds. Meanwhile, say what is running.
   - When done: one line per case (pass or fail, and why it failed), the pass rate and the cost. Say which cases now fail that passed on the published version (`comparison.regressed`).
   - A failure is not always the agent's fault: a wrong expectation or a source that changed means fixing the case. Ask the person when you cannot tell.
   - Without `agents_eval_start` on the server, run each case yourself with `agents_try` (with its `history`) and judge it against its `expect`.
7. **Hand over**: tell them what changed, and give them the preview link again if they want another round.

Repeat until they are happy. Do not guess at fixes they did not ask for. When something is unclear, ask about that one point.

## 6. Publish

Only after the person says so. First call `agents_publish_preview` with the slug and show a short summary from it:

- what changes compared to the published version (or "first version");
- the tools, and for each connection whose data it exposes and to whom (shared or personal);
- the write and egress tools and who approves them;
- the schedules: when, time zone, and where their results go;
- the test results of this version and of the published one, and the cost of a typical turn;
- every point of its `attention` list, in your words.

Name any failing test explicitly. If the preview says the preflight blocks publishing, fix that first. If they confirm:

**An admin:**

1. Call `agents_publish` (with `audience` when it is for some people only). The draft becomes the active version, the agent appears under Agents for its audience, and its schedules go live.
2. In a repository, commit the folder with a plain message.
3. Tell them the agent's name and where to find it.

To undo, publish the previous version (`agents_publish` with `versionNumber`). To change who it is for later: `agents_set_audience`.

**A member:**

1. `agents_publish` publishes it **for them alone**: they find it under Agents and use it; nobody else sees it. Offer this first, so they can use it for real before asking.
2. When they want it for colleagues: `agents_request_publish`, with the audience they want and a one-line note for the admin. The admin reads the same summary in the Workspace Inbox and approves or declines.
3. Tell them the request is with the workspace's admins. Later, `agents_list` shows its status and the admin's note; after an approval the agent is the workspace's, and only an admin publishes its next versions (the member keeps building drafts and asks again).

## 7. After publishing

When the person asks how the agent is doing, and when you come back to an agent a week or more after publishing:

1. **Read**: `agents_insights` with the slug (`days`, default 7). It gives runs, people, cost per conversation and per turn, slow turns, failures by cause, approvals, thumbs up and down with their comments, and the last daily health check.
2. **Tell them** in four or five lines: how much it is used, what fails and why, what people disliked, what it costs.
3. **Improve**: every thumbs-down candidate it lists becomes a test case (ask the person for the right answer when you cannot tell). Fix the definition, run the tests, publish again after their yes (steps 3 to 6).
4. **Health check**: every morning the platform checks published agents (connections that need a new sign-in, tools no longer offered, budget caps) and emails the people who built them, once per problem a day. A connection that needs a new sign-in: `connections_connect` again. A tool gone: change the definition.

**Archive** (admins): `agents_archive` takes an agent out of Agents (members lose it, its schedules stop); its versions are kept, and `agents_restore` puts it back as it was. Archive only when the person asks, after saying who loses it. An agent that came with a package cannot be archived.

## 8. Change an existing agent

1. Start from `agents_get` and `agents_evals_get`, or pull it into a folder (`node .wibo/wibo-agent.mjs pull <slug>`, which you run yourself; it writes `evals.jsonl` too).
2. Change it, then follow steps 3 to 6, saving with `baseVersionNumber` set to the version you read.
3. In a repository, if the folder is older than the platform's latest version, pull first.

## 9. Move an agent to another workspace

For example from a demo workspace to the client's:

1. `agents_export` on the source workspace gives a bundle: the definition, the test cases and what the agent needs (connections, packages, model role, approvers).
2. Connect to the target workspace (its own server entry) and `agents_check` the definition there. Fix what it lacks first: connect the apps (section 2), ask for the packages, map the approvers to that workspace's people.
3. `agents_save_draft` with `baseVersionNumber` 0, then `agents_evals_save` with the cases, then preview, test and publish there as usual. Never move a demo's invented facts into a client's instructions.

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
node .wibo/wibo-agent.mjs eval agents/price-desk       # save its test cases and run them
node .wibo/wibo-agent.mjs try agents/price-desk --schedule 0
node .wibo/wibo-agent.mjs pull price-desk              # an existing agent into agents/price-desk
```

- **Environment**: it reads `WIBO_TOKEN` (or the variable `--token-env` names) and `WIBO_MCP_URL` (default `https://api.wibo.app/mcp`). The token is a personal access token of a workspace admin with "Create agents from Claude" (Workspace, Settings, Account, Security).
- **What it saves**: `push` saves only what changed, and the folder's `evals.jsonl` as the agent's test cases. It exits 1 when an agent has issues and never publishes one with issues.
- **Tests in CI**: `eval` exits 1 when fewer cases pass than `--min-pass` (default 1, every case). Each run costs model time, counted as evaluation: add it to the pull request job only when the person wants that.
- **GitHub Actions setup**: copy `assets/wibo-agents.yml` to `.github/workflows/wibo-agents.yml` and set the repository secret `WIBO_TOKEN` (`gh secret set WIBO_TOKEN`). Pull requests that touch `agents/` are checked, and a push to main publishes.
- **Several workspaces**: a repository serving several workspaces keeps one secret per workspace and runs the script once per workspace with `--token-env`.
