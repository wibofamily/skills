# Reading a connected system

A **connection** is the tenant's credentialed link to a connector (HubSpot, Notion, Linear, a custom MCP server...), created by an admin in Settings, Connections (shared) or by a person for their own account (personal). A screen never holds a credential: it names a **slot** in the manifest and the Workspace calls the vendor server-side through the connection bound to the install (or the person's own, or the tenant's shared one).

```json
"capabilities": { "connections": [{ "slot": "crm", "connector": "hubspot", "tools": ["query_crm_data", "get_user_details"] }] }
```

```tsx
const [state, setState] = useState<{ status: "loading" } | { status: "error"; reason: string } | { status: "ready"; rows: Record<string, string>[] }>({ status: "loading" });
useEffect(() => {
  window.wibo.connections
    .call("crm", "query_crm_data", { sql: "SELECT DATE_TRUNC(closedate, 'DAY') AS day, COUNT(*) AS deals, SUM(amount_in_home_currency) AS amount FROM DEAL WHERE closedate >= '2026-01-01' AND closedate <= '2026-12-31' AND hs_is_closed_won = 'true' AND pipeline = 'default' GROUP BY 1 ORDER BY 1", verbosityLevel: "LOW" })
    .then((result) => setState({ status: "ready", rows: result.kind === "table" ? result.rows : [] }))
    .catch((err) => setState({ status: "error", reason: err.reason ?? "failed" }));
}, []);
```

- `init.connections.crm` is null when no connection resolves: say "No HubSpot connection yet: an admin adds one in Settings, Connections" instead of calling.
- `needs_reauth`: "The HubSpot connection must be authorized again by an admin".
- Ask `connection_tool_schemas` for the exact arguments of a tool before writing a call; HubSpot's SQL dialect works over objects such as `DEAL`, `CONTACT`, `COMPANY`, `TICKET` with their property names (`amount_in_home_currency`, `closedate`, `hs_is_closed_won`, `pipeline`, `dealstage`).
- A write (create a deal, update a contact) is `approvals.request` with the slot: the person approves it in the inbox; design the screen so the proposal is explicit.
