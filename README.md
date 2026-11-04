# Wibo skills

Skills that teach Claude to build on the **Wibo Intelligence platform**: tools in the Workspace, workflows, and later agents. Anyone with a Wibo Workspace account can use them; the work is published to their own workspace as a draft and released by a workspace admin.

| Skill | What it does |
|---|---|
| [wibo-artifact](plugins/wibo/skills/wibo-artifact/SKILL.md) | A Workspace tool (dashboard, form, list, report, calculator) written as one React module and published through the Wibo MCP server, reading the workspace's connections (HubSpot, Notion, a custom MCP server), keeping records, starting workflows |

## 1. Connect Claude to your workspace

The skills drive the **Wibo MCP server**, `https://api.wibo.app/mcp`. Connect it once:

- **Claude Code** (CLI or the desktop app's Code tab): in your Wibo Workspace open Settings, Account, Security, "Personal access tokens", create a token with the scopes offered and run the `claude mcp add` command the page shows (once: the token is not shown again). Publishing tools and workflows needs the workspace's admin role.
- **claude.ai or Claude Desktop**: Settings, Connectors, "Add custom connector", URL `https://api.wibo.app/mcp`; approve it on the Workspace page that opens.

Check: ask Claude to "call tenant_context". It answers your workspace, your name and role.

## 2. Install the skills

**Claude Code**, from any chat:

```
/plugin install wibo --marketplace wibofamily/skills
```

On a Claude Code older than 2.1.275: `/plugin marketplace add wibofamily/skills`, then `/plugin install wibo@wibo-skills`. `/plugin marketplace update wibo-skills` picks up new versions.

**claude.ai and Claude Desktop**: download [wibo-artifact.zip](https://github.com/wibofamily/skills/releases/latest/download/wibo-artifact.zip) and upload it under Settings, Capabilities, Skills.

## 3. Build

Describe what you need in plain words: who uses it, what they see, where the data comes from, what they do with it. For example: *"Build a Wibo tool for the sales team: open deals by stage and owner from HubSpot, and the monthly total against a goal of 1.2 M EUR, in Italian."* Claude reads your workspace, writes the tool and publishes a draft you open under **Tools**; iterate in the chat, then ask a workspace admin (or Claude, if you are one) to release it.

## Maintaining this repository

- One folder per skill under `plugins/wibo/skills/`, each with its `SKILL.md` and `references/`. This repository is the only copy: edit here.
- Bump `version` in `plugins/wibo/.claude-plugin/plugin.json` on every change, then check and release:

```bash
claude plugin validate .
claude plugin validate plugins/wibo
V=$(jq -r .version plugins/wibo/.claude-plugin/plugin.json)
(cd plugins/wibo/skills && zip -r -q ../../../wibo-artifact.zip wibo-artifact)
gh release create "v$V" wibo-artifact.zip --title "v$V" --notes "wibo-artifact skill"
rm wibo-artifact.zip
```

- Public repository: no client names, real data, internal addresses or credentials in any file.
