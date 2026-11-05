---
name: wibo-agent
description: Create or change an agent of the Wibo Intelligence platform from Claude Code - write it as a folder (agent.json and instructions.md), check it, try it in a dry run and publish it through the Wibo MCP server, by hand or from GitHub Actions. Use when someone wants a new Wibo agent (an assistant for a team, a scheduled agent), wants to edit an existing one, or wants agents published from a repository.
---

# Build and publish a Wibo agent from Claude Code

A Wibo agent is a **definition**: the instructions (its system prompt), the tools it may call, its model role, how far it may act on its own, its schedules. Every save is an immutable **version**: a draft until it is published, then the active version that the workspace's members chat with under Agents. The Wibo MCP server checks a definition against what the workspace really has, tries a draft in a dry run and publishes it.

Keep each agent as a **folder** in the project, so it lives in git and a GitHub Action can publish it:

```
agents/
  hr-desk/
    agent.json        name, description, the definition without the instructions
    instructions.md   the system prompt
```

## Connect first

The tools below come from the **Wibo MCP server**, `https://api.wibo.app/mcp`. Authoring agents needs a **workspace admin** and a token with the scope **"Create agents from Claude"** (`agents.manage`). If the `agents_*` tools are not available in this chat, stop and tell the person how to connect, then continue once they have:

- In their Wibo Workspace: Settings, Account, Security, "Personal access tokens", create a token with "Create agents from Claude" (and any other scope they want) and run the `claude mcp add` command the page shows once.
- For the script and CI, the same token goes in the environment variable `WIBO_TOKEN`.

## The loop

1. **Read the guide and the catalog.** Call `agents_guide` (the definition's fields, tool sources, autonomy, approvals, schedules, an example) and `agents_catalog` (the platform tools, the backend tools of installed packages, the connections and their tools, the model roles, the departments). Name only what the catalog lists, spelled as it lists it: a connection's tools go by the vendor's name (`notion-search`, with the dash), and a connection often offers write tools too, so list only the read tools the job needs. `agents_list` shows the existing agents: to change one, `agents_get` it (or `node .wibo/wibo-agent.mjs pull <slug>`) and edit the folder.
2. **Write the folder.** `agent.json`:
   ```json
   {
     "name": "HR desk",
     "description": "Answers employees' questions about people and teams.",
     "definition": {
       "tools": [
         { "name": "people_search", "source": "platform" },
         { "name": "email_send", "source": "platform", "approval": "always" }
       ],
       "model": { "role": "default", "temperature": 0.3 },
       "autonomyMax": "act_with_approval",
       "channels": ["web"],
       "maxSteps": 12
     }
   }
   ```
   `instructions.md`: who the agent is, for whom, what it does step by step, which tool for what, the tone and the language, the limits, what to do when a tool finds nothing. Specific to the company, written for the model. The folder name is the slug (lowercase, digits, dashes) unless `agent.json` sets `"slug"`.
3. **Check.** `agents_check` with the definition (`instructions` set to the content of `instructions.md`), or `node .wibo/wibo-agent.mjs check agents/hr-desk`. Fix every issue: each has a path such as `tools[1].name`.
4. **Save a draft.** `agents_save_draft` with `slug`, `name`, `description`, `definition` (or `node .wibo/wibo-agent.mjs push agents/hr-desk`). A new slug creates the agent as a draft that members do not see yet.
5. **Try it.** `agents_try` with the questions real people will ask, one at a time, `history` for a follow-up (or `node .wibo/wibo-agent.mjs try agents/hr-desk "Who leads HR?"`). Reads really run; writes and outbound messages are never proposed, and their tool result says what the approval policy would have done. Nothing is remembered. Look at the answer and the tool calls, fix the instructions or the tools, save again, try again. Include one question the agent must refuse. A try is stopped after 45 seconds (`timeoutSeconds`, up to 120, only when your client waits longer than a minute): it then answers `finished: false` with a `note` and the tool calls still waiting (`waitingFor`), usually a connection that is slow or not answering. Try again one turn at a time; never run tries in parallel, since calls through one connection wait for each other.
6. **Publish** when the person is happy: `agents_publish` (or `push --publish`, or let GitHub Actions do it on merge). The draft becomes the active version, the agent appears under Agents for the workspace's members, its schedules go live. Tell the person the agent's name and that it is under Agents in their Workspace.

## Rules

- **One agent, one job.** A second job is a second agent.
- **Least tools.** Every tool listed is a tool the model may call. Prefer read tools; give write and egress tools only when the job needs them, with `"approval": "always"` when a mistake costs. Egress (anything that leaves the company, such as an email) always asks a person.
- **Never name a model.** Use a model role from the catalog (`default`, `drafting`...); the workspace's model map picks the model.
- **An agent from a package** (`agents_list` shows a `package`) is overwritten by the package's next upgrade: change the package instead, or create a separate agent.
- **No secrets in the folder.** Connections hold the credentials; an agent names a connector (`"source": "connector", "server": "hubspot"`), never a key.
- **Publishing needs the person's go-ahead** in a chat. In a repository, merging to main is that go-ahead.

## Publish from the command line or GitHub Actions

`scripts/wibo-agent.mjs` (in this skill's folder) is a single Node file with no dependencies that speaks to the Wibo MCP server. Copy it into the project as `.wibo/wibo-agent.mjs` the first time:

```
node .wibo/wibo-agent.mjs list
node .wibo/wibo-agent.mjs check agents
node .wibo/wibo-agent.mjs push agents --publish        # every agent folder under agents/
node .wibo/wibo-agent.mjs try agents/hr-desk "Who leads HR?"
node .wibo/wibo-agent.mjs pull hr-desk                  # an existing agent into agents/hr-desk
```

It reads `WIBO_TOKEN` (or the variable `--token-env` names) and `WIBO_MCP_URL` (default `https://api.wibo.app/mcp`). `push` saves only what changed (an identical definition adds no version), exits 1 when an agent has issues and never publishes one with issues.

For **GitHub Actions**, copy `assets/wibo-agents.yml` to `.github/workflows/wibo-agents.yml` and set the repository secret `WIBO_TOKEN` (`gh secret set WIBO_TOKEN`, the token of a workspace admin with "Create agents from Claude"). Pull requests that touch `agents/` are checked; a push to main publishes. A repository serving several workspaces keeps one folder of agents and one secret per workspace and runs the script once per workspace with `--token-env`.
