# wibo plugin

Skills for building on the Wibo Intelligence platform from Claude.

| Skill | What it does |
|---|---|
| [wibo-artifact](skills/wibo-artifact/SKILL.md) | Builds a tool for the Wibo Workspace (dashboard, form, list, report) as one React module and publishes it as a draft through the Wibo MCP server; also covers the tenant's connections, records and workflows |
| [wibo-agent](skills/wibo-agent/SKILL.md) | Creates or changes an agent kept as a folder (`agent.json` and `instructions.md`): checks it against the workspace, tries the draft in a dry run, publishes it; `scripts/wibo-agent.mjs` and `assets/wibo-agents.yml` publish from the command line or GitHub Actions |

Install in Claude Code with `/plugin install wibo --marketplace wibofamily/skills`. The skills need the Wibo MCP server (`https://api.wibo.app/mcp`) connected in Claude: see the repository [README](../../README.md).
