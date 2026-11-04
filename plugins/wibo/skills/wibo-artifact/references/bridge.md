# The bridge, as a published module sees it

`window.wibo` (SDK `@wibofamily/artifact-sdk`, `createClient()`), JSON-RPC over `postMessage` to the Workspace, every call checked against the manifest and audited.

| Call | What |
|---|---|
| `wibo.init()` | `{ mode, user: { id, name, email, roles, departments, manager, permissions } \| null, tenant: { id, slug, name, locale }, locale, timeZone, theme, route, artifact: { id, version, capabilities }, shared, connections: Record<slot, { connector, label, status } \| null> }`. Apply the theme with `applyHostTheme(init.theme)` (the page already does). |
| `wibo.connections.call(slot, tool, args?)` | A read tool of the slot's connection, server-side, through the connection an admin created: the reader needs no vendor account. Answers `{ kind: "table", columns: string[], rows: Record<string, string>[] } \| { kind: "json", data } \| { kind: "text", text }`. Reads are cached for 30 s per connection, tool and arguments. Errors: `WiboError` with `reason` `not_connected`, `needs_reauth`, `forbidden` (a write, or a tool outside the slot's list), `not_found`, `failed` (the vendor's message). |
| `wibo.approvals.request({ slot, tool, args, approver? })` | Proposes a write or egress tool of the slot's connection through the action record; answers `{ status: "approval_required", actionId, approvalId, payloadHash }` or `{ status: "succeeded", result }` when policy executes it at once. The person (or the role named) approves in the inbox and the engine runs it once. |
| `wibo.records.*` | Tier 2 records of the artifact (`capabilities.storage` shared or personal): `list(collection)`, `get(id)`, `save({ collection, id?, data, expectedVersion? })`, `delete(id)`, `share(id)`, `links(id)`, `revokeLink(linkId)`. |
| `wibo.data.query(operation, params)` | Tier 1 reads the manifest names in `capabilities.dataViews` (`people.search`, `me.roles`). |
| `wibo.agent.run({ instructions?, prompt \| messages, schema?, model? })` | One model call with the tenant's provider, metered and audited (`capabilities.agentCalls`). |
| `wibo.workflows.list()`, `wibo.workflows.start(slug, input)`, `wibo.workflows.run(runId)`, `wibo.workflows.cancel(runId)` | The tenant's workflows the manifest names (`capabilities.workflows`, SDK 0.12.0): the published ones the person sees with `inputSchema` and `canStart`; a run started as the person (`{ runId }`), read with its steps and what a suspended step waits for, canceled. Details in [workflows.md](workflows.md). |
| `wibo.ui.notify({ title, description?, variant? })`, `wibo.ui.navigate(path)`, `wibo.ui.open(url)` | A toast, the artifact's own route in the address bar, a link in a new tab (the Workspace's origin or mailto). |

A table answer from HubSpot's `query_crm_data` with `verbosityLevel: "LOW"` arrives as `{ kind: "table" }` when the server returns tab-separated text, else as `{ kind: "json" }` or `{ kind: "text" }`: handle the three.
