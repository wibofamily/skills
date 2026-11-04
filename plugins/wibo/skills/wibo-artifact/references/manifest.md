# The manifest of a tool published from a chat

| Field | Value |
|---|---|
| `id` | `<tenant slug>/<artifact>` (lowercase, dashes); the slug is in `tenant_context` |
| `version` | `x.y.z`, bumped on every publish of changed content |
| `title`, `description` | shown on the Tools card and in the browser tab |
| `kind` | `tool` (an agent package goes through the developer path) |
| `icon` | a Lucide name in kebab-case (`chart-line`, `table`, `file-pen-line`) |
| `persistence` | `tier1` (no records), `tier2` with `capabilities.storage` `shared` or `personal` |
| `capabilities.collections` | required with storage: `[{ name, title?, description?, schema, write }]`, one per record collection the module saves to; `schema` the JSON Schema (draft 2020-12) of a record's `data` with a description on every property, `write` `execute` or `propose` (a save from a chat runs at once or waits for approval) |
| `guide` | markdown for assistants (at most 16000 characters): what the tool is for, the fields, typical requests, conventions; served by the Wibo MCP server with the collection tools |
| `capabilities.connections` | `[{ slot, connector, tools: [...] }]`: one slot per connector, the closed list of tools the screen calls |
| `capabilities.approvals` | `true` when the screen proposes writes |
| `capabilities.agentCalls` | `true` for `agent.run` |
| `capabilities.workflows` | the slugs of the tenant workflows the screen lists, starts, reads and cancels the runs of with `wibo.workflows`, or `["*"]` for every one the person sees (SDK 0.12.0; [workflows.md](workflows.md)) |
| `capabilities.dataViews` | tier 1 reads (`people.search`, `me.roles`) |
| `capabilities.share` | public read-only links to one record (tier 2 shared) |
| `capabilities.downloads` | the screen hands the person a file it built |
| `roles`, `departments` | the audience once released (`admin`, `member`, `manager`; department names); empty means everyone |
| `designSystemVersion` | optional: the runtime's by default |

Refused: `backend`, `persistence: tier3`, an id outside the tenant's slug, `externalDomains` (the frame has no network).
