---
name: wibo-artifact
description: Build a tool for the Wibo Intelligence Workspace by writing one React module and publishing it through the Wibo MCP server, without a developer. Use when someone on the team wants a dashboard, a form, a report or any small screen in the Workspace, possibly reading a connected system (HubSpot, Notion, a custom MCP server) through the tenant's connections, or wants a claude.ai artifact brought into the Workspace.
---

# Build and publish a Wibo artifact from a chat

A Wibo artifact published from a chat is **one module** (`artifact.tsx`, default export a React component) plus a **manifest**, optionally with data files. The Wibo MCP server publishes it as a **draft** the author opens under Tools at once; a tenant admin releases it to everyone. No build tool, no repository, no backend: the Workspace serves the module with a shared runtime (React, Wibo UI, the bridge SDK, Lucide, Recharts) and the tenant's connections answer the data.

## Connect first

The tools below come from the **Wibo MCP server**, `https://api.wibo.app/mcp`. If they are not available in this chat, stop and tell the person how to connect, then continue once they have:

- **Claude Code**: in their Wibo Workspace, Settings, Account, Security, "Personal access tokens", create a token with the scopes offered (the publishing scope is offered to workspace admins only) and run the `claude mcp add` command the page shows once.
- **claude.ai or Claude Desktop**: Settings, Connectors, add a custom connector with the URL `https://api.wibo.app/mcp` and approve it in the Workspace page that opens.

Publishing (`artifact_publish_draft`) needs the publishing scope; releasing (`artifact_release`) needs a workspace admin.

## Before writing

1. Call the MCP tool `tenant_context`: the tenant slug (the manifest id starts with it), the person's role (an admin can release), the language, the runtime's modules and the conventions.
2. Call `connections_list` when the screen needs external data: each connection has a `connector` id (the manifest slot's `connector`), its tools with their scope, and `connection_tool_schemas` gives a tool's exact input. HubSpot's `query_crm_data` takes `{ sql, verbosityLevel }` and answers a table; see [references/connections.md](references/connections.md).
3. Call `design_system_components` to see the `@wibo/ui` components and patterns; ask for one by name to read its props.

## Write the module

- `artifact.tsx` imports only from the runtime: `react`, `react-dom`, `@wibo/ui` (or `@wibo/ui/components/<name>`), `@wibofamily/artifact-sdk`, `lucide-react`, `recharts`, and `./data.js` when data files are published alongside (`import { files } from "./data.js"`, a map from file name to its text). Nothing else: no CDN, no npm package, no `fetch` (the frame has no network).
- The platform is reached through `window.wibo` (the page creates one client; `createClient()` from the SDK returns another one that works too): `wibo.init()` gives the person, the tenant, the language and time zone, the theme and `init.connections` (one entry per manifest slot: the bound connection or null); `wibo.connections.call(slot, tool, args)` runs a read tool and answers `{ kind: "table", columns, rows } | { kind: "json", data } | { kind: "text", text }`; `wibo.approvals.request({ slot, tool, args })` proposes a write, which the person approves in their inbox; `wibo.records` keeps tier 2 records; `wibo.agent.run` makes one model call; `wibo.workflows` lists, starts, reads and cancels the tenant's workflows the manifest names; `wibo.ui.notify` toasts. The full contract is in [references/bridge.md](references/bridge.md).
- Design with Wibo UI components and tokens only: `Card`, `Button`, `Badge`, `StatCard`, `DataTable`, the charts (`@wibo/ui` exports Recharts wrappers with the Wibo palette), Tailwind utilities with the Wibo theme (no raw colours such as `bg-blue-500`: they do not exist). Write the words in the tenant's language (`init.locale`), format dates with `init.timeZone`.
- Show the three states of a connection read: loading, the error (`not_connected` means no connection exists or the person may not use it; `needs_reauth` means an admin must authorize it again), and the data. Keep the computation in the module (sums, targets, quarters) and the queries small.

## Write the manifest

```json
{
  "id": "<tenant slug>/revenue-2026",
  "version": "0.1.0",
  "title": "Revenue 2026 vs goal",
  "description": "Closed-won revenue per month against the yearly goal, from HubSpot.",
  "kind": "tool",
  "icon": "chart-line",
  "persistence": "tier1",
  "capabilities": {
    "connections": [{ "slot": "crm", "connector": "hubspot", "tools": ["query_crm_data"] }]
  }
}
```

`persistence: "tier2"` with `capabilities.storage: "shared"` or `"personal"` when the screen keeps records; `capabilities.approvals: true` when it proposes writes; `capabilities.agentCalls: true` for `agent.run`; `capabilities.workflows: ["<slug>"]` (or `["*"]`) when the screen starts one of the tenant's workflows or follows its runs with `wibo.workflows` (see [references/workflows.md](references/workflows.md)); `roles` and `departments` for the audience once released. Bump `version` on every publish of changed content. The shape is in [references/manifest.md](references/manifest.md).

### Records need a schema and a guide

An artifact that keeps records (`storage` personal or shared) declares every collection it saves to in `capabilities.collections`, with the JSON Schema (draft 2020-12) of one record's `data`, and a `guide` in markdown for assistants. The platform refuses a tier 2 manifest without collections. Why: the host validates every save against the schema (from the screen and from a chat alike), and the Wibo MCP server offers each collection as tools (`<artifact>_<collection>_list`, `_get`, `_save`, `_delete`, `_share` when shared) to any Claude a team member connects, with the guide as the tool's instructions, so the records are usable from a chat the moment the tool is released. `write` is `"execute"` (a save from a chat runs at once) or `"propose"` (it waits for the person's approval).

```json
{
  "persistence": "tier2",
  "capabilities": {
    "storage": "shared",
    "collections": [
      {
        "name": "visits",
        "title": "Visit",
        "description": "One client visit: who, when, what was agreed.",
        "write": "execute",
        "schema": {
          "type": "object",
          "additionalProperties": false,
          "required": ["client", "date"],
          "properties": {
            "client": { "type": "string", "description": "The client company's name." },
            "date": { "type": "string", "format": "date", "description": "The day of the visit, YYYY-MM-DD." },
            "notes": { "type": "string", "description": "What was agreed, in the tenant's language." }
          }
        }
      }
    ]
  },
  "guide": "# Visits\n\nOne record per visit. Always get before save and send the whole data back with expectedVersion..."
}
```

Describe every property (what it means, the allowed values, the format): the descriptions are what the assistant reads. Put the conventions in the guide: what a record is, how to create one, how to update it (get, change only what was asked, save the whole `data` with `expectedVersion`), the language, what never to invent. The schema and the guide must accept exactly what the module saves. The safest way is one zod model of the record: the module validates with it before saving, and the JSON Schema in the manifest is generated from it with `z.toJSONSchema(model, { target: "draft-2020-12" })`, so the two never drift. A small record can also have its JSON Schema written by hand.

## Publish

Call `artifact_publish_draft` with `manifest` and `files` (`{ "artifact.tsx": "...", "contracts.csv": "..." }`). The answer is the draft's URL under Tools, or a report: a compile error with its line, an import outside the runtime, a network call, a manifest problem. Fix the module and publish again (same version while the draft is yours and unreleased only if the content is identical; otherwise bump). When the person is satisfied, an admin calls `artifact_release` with the install id (or the draft is released from the Admin Panel's Installs).

## Bringing a claude.ai artifact in

A page written against `window.claude` publishes with `compat: "claude"` and `claudeServers: { "HubSpot": "crm" }`: the runtime's shim maps `claude.use("mcp")` to the slot's connection (`callTool`, `watchTool`, `server(name)`), `user`, `sample` (one model call), `downloads` and `permissions`; `db`, `artifact`, `room`, `assets`, `comments` and `files` resolve null, as an unavailable capability does on claude.ai. The page must still be one module exporting its component and import only from the runtime; a Dashboard-type claude.ai artifact (datasets, formulas, blocks) is rewritten as a module instead, with its SQL queries unchanged in `connections.call`.

## Checks before handing over

- `tenant_context` says who you are; the manifest id starts with that slug.
- Every import is a runtime module; no `fetch`; no `window.claude` without `compat`.
- Every connection slot the module calls is in the manifest with its tool names.
- The draft opens under Tools and shows its three states; then the admin releases it.
