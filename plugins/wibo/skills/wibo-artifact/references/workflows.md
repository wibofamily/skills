# Starting a workflow from a screen and following its run

A **workflow** is a process the tenant deployed as data (steps such as an agent turn, a model call, a tool, an approval, a wait, an email), run durably by the engine and visible under Workflow and Runs in the Workspace. A screen starts one as the person using it and shows how the run goes; it never runs the steps itself.

## Manifest

```json
"capabilities": { "workflows": ["pmp-reminders"] }
```

`workflows` lists the slugs the screen works with (the Workflow page shows them), or `["*"]` for every workflow the person may see. Without it the four calls are refused; `workflows.start` is also refused for a slug outside the list.

## Calls (SDK 0.12.0)

| Call | Answers |
|---|---|
| `wibo.workflows.list()` | `[{ slug, name, description, inputSchema, canStart }]`: the published workflows the manifest names and the person sees (`member` visibility to everyone, `admin` to the tenant's admins). `inputSchema` is the JSON Schema (type object) of the run's input, the form to draw; null when the workflow takes none. `canStart` is true when the person may start it (their role or department is addressed by the workflow's manual trigger). |
| `wibo.workflows.start(slug, input)` | `{ runId }` at once; the run goes on in the engine under the workflow's own policy (approvals in the inbox, budget, retries). |
| `wibo.workflows.run(runId)` | `{ runId, workflow: { slug, name }, status, trigger, startedAt, finishedAt, input, output, error, steps: [{ id, kind, path, status, attempt, startedAt, finishedAt, waitingOn, output, error }] }`. `status` is `pending`, `running`, `suspended`, `succeeded`, `failed` or `canceled`. A suspended step says what it waits for in `waitingOn`: `{ kind: "approval", approvalId }` (someone decides in the inbox), `{ kind: "event", type, timeoutAt }`, `{ kind: "time", wakeAt }`, `{ kind: "input", email, title, expiresAt }` (a person fills a form). `input`, `output` and the steps' outputs are null for a reader who does not see the run's content (someone else's run read by an admin without access to every run's content). |
| `wibo.workflows.cancel(runId, reason?)` | `{ status: "canceled" | "already_finished" }`; the person who started the run, or an admin. |

Errors are `WiboError` with `reason`: `forbidden` (the manifest, the role or the manual trigger refuses), `not_found` (no published workflow of that slug the person may see; no run the person may read), `invalid` (the input against `inputSchema`; the message lists `path: message` lines), `budget` (the company's AI budget cap is reached), `failed`.

Nothing is pushed to the frame: read the run again while it is `pending`, `running` or `suspended` (every few seconds while the screen is open; stop once it ends).

## Example

```tsx
import { useEffect, useState } from "react";
import { Badge, Button, Card } from "@wibo/ui";
import type { WorkflowRunView, WorkflowSummary } from "@wibofamily/artifact-sdk";

const SLUG = "pmp-reminders";
const OPEN = new Set(["pending", "running", "suspended"]);

export default function Reminders() {
  const [workflow, setWorkflow] = useState<WorkflowSummary | null>(null);
  const [run, setRun] = useState<WorkflowRunView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.wibo.workflows.list().then((all) => setWorkflow(all.find((w) => w.slug === SLUG) ?? null)).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!run || !OPEN.has(run.status)) return;
    const timer = setInterval(() => window.wibo.workflows.run(run.runId).then(setRun).catch((err) => setError(err.message)), 3000);
    return () => clearInterval(timer);
  }, [run]);

  const start = async () => {
    setError(null);
    try {
      const { runId } = await window.wibo.workflows.start(SLUG, { campaignId: "current" });
      setRun(await window.wibo.workflows.run(runId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!workflow) return <Card>{error ?? "Il workflow non è disponibile."}</Card>;
  return (
    <Card>
      <h2>{workflow.name}</h2>
      <Button onClick={start} disabled={!workflow.canStart || (run !== null && OPEN.has(run.status))}>Avvia promemoria</Button>
      {error && <p>{error}</p>}
      {run && (
        <ul>
          {run.steps.map((step) => (
            <li key={step.path}>
              {step.id} <Badge>{step.status}</Badge>
              {step.waitingOn?.kind === "approval" && " in attesa di approvazione"}
              {step.waitingOn?.kind === "input" && ` in attesa di ${step.waitingOn.email}`}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- Draw the start form from `inputSchema` (titles and descriptions of its properties) instead of hard-coding the input when the workflow takes more than one field.
- Hide the start button when `canStart` is false; say why in the tenant's language ("solo gli amministratori possono avviarlo").
- A run that ends `failed` carries the engine's message in `error`; a canceled one says who canceled it.
- An approval the run waits for is decided in the Workspace inbox, not in the screen: link the person there (`wibo.ui.open` with the Workspace's `/inbox` URL from `init`) rather than rebuilding the decision.
