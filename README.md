# Wibo skills

Skills that teach Claude to build on the **Wibo Intelligence platform**: tools in the Workspace, workflows and agents. Anyone with a Wibo Workspace account can use them; the work is published to their own workspace as a draft and released by a workspace admin (agents are authored by workspace admins).

| Skill | What it does |
|---|---|
| [wibo-artifact](plugins/wibo/skills/wibo-artifact/SKILL.md) | A Workspace tool (dashboard, form, list, report, calculator) written as one React module and published through the Wibo MCP server, reading the workspace's connections (HubSpot, Notion, a custom MCP server), keeping records, starting workflows |
| [wibo-agent](plugins/wibo/skills/wibo-agent/SKILL.md) | An agent of the workspace (an assistant for a team, a scheduled agent) built by talking to Claude: it asks a few questions, connects the apps it needs, writes and saves a draft, opens a preview chat with the draft, fixes it from your notes, keeps its test cases and runs them, publishes it after your yes, and later reads how it is used and improves it; optionally kept as a folder in a repository and published from GitHub Actions with the bundled script |

## 1. Install

**Claude Code** (CLI or the desktop app's Code tab), from any chat:

```
/plugin install wibo --marketplace wibofamily/skills
```

On a Claude Code older than 2.1.275: `/plugin marketplace add wibofamily/skills`, then `/plugin install wibo@wibo-skills`. `/plugin marketplace update wibo-skills` picks up new versions.

The plugin brings the skills and the **Wibo MCP server** (`https://api.wibo.app/mcp`). Sign in once: type `/mcp`, pick `wibo`, sign in in the browser and choose your workspace. No token to copy. Publishing tools and workflows, and creating agents, needs the workspace's admin role. If you added the server by hand before (`claude mcp add`), remove that entry (`claude mcp remove wibo`) so the tools are not listed twice.

Check: ask Claude to "call tenant_context". It answers your workspace, your name and role.

## 2. Other clients and CI

- **claude.ai or Claude Desktop**: Settings, Connectors, "Add custom connector", URL `https://api.wibo.app/mcp`; approve it on the Workspace page that opens. For the skills, download [wibo-artifact.zip](https://github.com/wibofamily/skills/releases/latest/download/wibo-artifact.zip) or [wibo-agent.zip](https://github.com/wibofamily/skills/releases/latest/download/wibo-agent.zip) and upload it under Settings, Capabilities, Skills.
- **Scripts and GitHub Actions**: a personal access token (Workspace, Settings, Account, Security, "Personal access tokens") in the environment variable `WIBO_TOKEN`. The agent skill's script and GitHub Actions template need Claude Code or a terminal.

## 3. Build

Describe what you need in plain words: who uses it, what they see, where the data comes from, what they do with it. For example: *"Build a Wibo tool for the sales team: open deals by stage and owner from HubSpot, and the monthly total against a goal of 1.2 M EUR, in Italian."* Claude reads your workspace, writes the tool and publishes a draft you open under **Tools**; iterate in the chat, then ask a workspace admin (or Claude, if you are one) to release it.

An agent: *"Create a Wibo agent for the HR team that answers questions about people and teams and drafts emails, in Italian."* Claude asks a few questions, writes the agent, saves it as a draft and opens a **preview**: a chat with the draft in your Workspace, where nothing is written or sent. Chat with it, rate the answers, leave notes, then tell Claude you are done: it reads your notes, turns them into test cases, fixes the agent, runs the tests and publishes it when you say so. The agent appears under **Agents**. An app the agent needs (Asana, HubSpot, any MCP server) is connected from the same chat: Claude opens the sign-in page, and keys are typed only on the Workspace page. A week later, ask Claude how the agent is doing: it reads the usage, failures, ratings and cost, and proposes fixes. To publish from a repository, copy the skill's `scripts/wibo-agent.mjs` to `.wibo/` and `assets/wibo-agents.yml` to `.github/workflows/`, and set the secret `WIBO_TOKEN`.

## Maintaining this repository

- One folder per skill under `plugins/wibo/skills/`, each with its `SKILL.md` and `references/`, `scripts/` or `assets/`. This repository is the only copy: edit here.
- Bump `version` in `plugins/wibo/.claude-plugin/plugin.json` on every change, then check and release:

```bash
claude plugin validate .
claude plugin validate plugins/wibo
V=$(jq -r .version plugins/wibo/.claude-plugin/plugin.json)
(cd plugins/wibo/skills && for s in wibo-artifact wibo-agent; do zip -r -q "../../../$s.zip" "$s"; done)
gh release create "v$V" wibo-artifact.zip wibo-agent.zip --title "v$V" --notes "<what changed>"
rm wibo-artifact.zip wibo-agent.zip
```

- Public repository: no client names, real data, internal addresses or credentials in any file.
