# AgentFace

**The agent interface layer for software.** AgentFace gives every page,
feature, and workflow in your app a typed, policy-checked interface that AI
assistants can understand and operate — with the human confirming anything
consequential.

Agents today operate software through brittle DOM automation or context-blind
backend APIs. AgentFace adds the missing layer: features expose **business
intent** (`invoice.send`, `product.publish` — never `clickButton`) with typed
inputs, preconditions, previews, and confirmation rules, and every invocation
flows through one enforced, auditable lifecycle your application controls.

📖 **Documentation:** [d-e-a-n-f.github.io/agent-face](https://d-e-a-n-f.github.io/agent-face/)
(source in [`apps/docs`](apps/docs); deployed by GitHub Pages).

## Sixty-second tour

```tsx
// 1. One component wires everything (runtime, assistant, navigation, DevTools):
<AgentFaceApp application={{ id: "acme", name: "Acme" }} routes={ROUTES}>
  {children}
</AgentFaceApp>

// 2. Features declare their agent interface inline:
<AgentSurface id="billing.invoice" description="View, edit and send an invoice">
  <InvoiceEditor />
</AgentSurface>

// 3. …and expose typed capabilities:
useAgentResource({ id: "summary", description: "Totals and status", getValue: () => summary });
useAgentAction({
  id: "send",
  description: "Send the invoice to the customer",
  confirmation: "always",
  preview: () => ({ summary: `Send ${invoice.number} to ${invoice.email}` }),
  execute: () => sendInvoice(invoice.id),
});

// A react-hook-form form becomes agent-fillable in one call:
useAgentForm({ form, name: "Onboarding", description: "the onboarding form" });
```

The shipped assistant widget then reads the screen, fills real forms, follows
your help docs, suggests next steps as live buttons, moves between screens —
and pauses on a confirmation card (exact input + preview + state revision)
before anything that matters. If state changes underneath a prepared action,
it goes stale instead of executing.

## Try the demo (the Portal)

```bash
pnpm install
pnpm build
AWS_REGION=us-east-1 pnpm dev   # AWS creds → Claude via Bedrock
# open http://localhost:3000/portal
```

A working multi-page mini-app — clients, onboarding, invoicing — with
suggested prompts on the dashboard. Without AWS credentials everything works
except the live model: the DevTools panel operates every capability by hand.
See the
[demo walkthrough](https://d-e-a-n-f.github.io/agent-face/docs/playground).

## Packages

| Package | What it is |
| --- | --- |
| `@agentface/core` | Contracts: faces, resources, actions, schemas (+ `/zod`), typed errors, trace events |
| `@agentface/policy` | Composable allow / confirm / deny engine with sensitivity ceilings |
| `@agentface/runtime` | In-memory registry + the enforced action lifecycle, revisions, traces |
| `@agentface/react` | Provider, `AgentSurface`, hooks, knowledge, recommendations (+ `/hook-form`) |
| `@agentface/assistant` | Provider-neutral model adapters + the assistant loop (+ `/react` widget, `/bedrock`) |
| `@agentface/next` | Route handler for the model endpoint (+ `/navigation`, `/app` umbrella) |
| `@agentface/devtools` | Embeddable panel: inspect and operate everything without a model |
| `@agentface/testing` | Deterministic test runtime (+ `/react` helpers) — no LLM in tests, ever |

Dependency graph is strictly acyclic: `core → policy → runtime → {react,
testing, devtools, assistant} → next`. Not yet published to npm — consumed as
a pnpm workspace today.

## Development

```bash
pnpm install
pnpm build          # all packages + apps
pnpm test           # unit tests (deterministic, no model calls)
pnpm check-types    # strict TS incl. noUncheckedIndexedAccess, exactOptionalPropertyTypes
pnpm lint
pnpm --filter web test:e2e   # Playwright browser specs incl. full agent flows
pnpm --filter docs dev       # docs site on :3100
```

## Current limitations

- Browser-local, in-memory runtime by design — no server-side or
  cross-application execution yet; contracts are serialisable to enable that
  later.
- One real model adapter (Claude via AWS Bedrock); the adapter contract is
  neutral and a mock ships for tests.
- Approvals are confirmed by the current user; routing to a distinct approver
  is roadmap.
- Packages are unpublished; APIs may still shift before 0.1.0.

## Roadmap

MCP bridge (expose a live app as an MCP server), agent evals, batch
plans + undo, approval routing + audit export, and more — see the
[roadmap](https://d-e-a-n-f.github.io/agent-face/docs/roadmap).
