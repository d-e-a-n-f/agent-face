---
name: agentface
description: Instrument a React/Next.js application with AgentFace — typed, policy-checked agent interfaces (surfaces, resources, actions) that AI assistants can operate safely. Use when adding agent capabilities to app features, wiring the AgentFace assistant, or reviewing AgentFace integration quality.
---

# Instrumenting an application with AgentFace

AgentFace lets application features expose **typed capabilities** that
agents operate through an enforced lifecycle (validate → policy → preview →
confirm → execute) instead of DOM automation. Your job when this skill is
active: add high-quality Agent Surfaces to the app you are working on.

## Non-negotiable rules

1. **Actions are business intent, never UI mechanics.** `invoice.send`,
   `client.archive` — never `clickButton`, `setInput`, `openModal`. If you
   find yourself naming an action after a widget, you are wrapping the
   wrong layer; find the domain operation underneath.
2. **The application stays authoritative.** Validation, authorization, and
   state transitions live in app code. Never bypass existing domain
   functions to mutate state directly inside `execute`.
3. **Results must be JSON-serialisable** (`TResult extends JsonValue` is
   enforced at compile AND runtime). Serialise domain objects inside
   `execute`; never return class instances, Dates, or functions.
4. **No model calls in tests, ever.** Use `@agentface/testing` and (for
   e2e) a deterministic mock adapter behind an env flag.
5. **Never weaken safety to make an agent flow work**: don't remove
   confirmations, don't lower sensitivity, don't widen policy. If a flow
   fails, fix the flow.

## The instrumentation checklist (per feature)

Work feature by feature. For each:

1. **Surface**: wrap the feature in `<AgentSurface id="domain.feature"
   description="…" entity={{ type, id, displayName }}>`. The entity is the
   business object on screen; identity changes remount the surface and
   invalidate outstanding preparations — pass the real entity, never a
   synthetic constant.
2. **Resources** (`useAgentResource`): expose what an agent must read
   before acting — current state, totals, statuses. Live getters
   (`getValue`), never copied state. Write descriptions for a reader who
   cannot see the screen.
3. **Actions** (`useAgentAction`): one per domain operation.
   - `input`: a Zod schema via `fromZod(z.object({...}))` with
     `.describe()` on non-obvious fields. Omit for zero-input actions.
   - `sensitivity`: `"internal"` default; `"confidential"` for
     consequential operations (sending, money, publishing);
     `"restricted"` for operations agents should never run.
   - `confirmation`: `"always"` for consequential actions; conditional
     (`{ type: "conditional", evaluate }`) when only some inputs are
     consequential (e.g. discounts above 20%).
   - `preview`: REQUIRED for anything confirmed — the user approves
     exactly what the preview says (`summary` + `changes`).
   - `preconditions`: business rules checked at preparation
     ("invoice must be a draft"), each with an id and description.
   - After mutations, call `surface.bumpRevision()` (from
     `useAgentSurface()`) so stale preparations are rejected.
   - `recommend`: add `{ when, reason, instruction }` when the action is
     an obvious next step the UI should suggest.
4. **Forms**: if the feature has a react-hook-form form, ONE call —
   `useAgentForm({ form, name, description })` — makes it agent-fillable.
   The human submits; the agent fills. Do not build a parallel
   "set-field" action set.
5. **Manifest**: add the route to `agentface.config.ts`
   (`defineAgentApplication`) with its face ids and entity types.
6. **Tests**: deterministic tests via `@agentface/testing`'s
   `createTestRuntime` — register, prepare, confirm, execute, assert state
   and trace. Test the failure paths too (unavailable, precondition,
   stale revision, denied).

## App-level wiring (once)

- `<AgentFaceApp manifest={applicationManifest} user={...}
  policy={standardUserPolicy()}>` in the root layout's client wrapper.
- Model endpoint at `app/api/agentface/route.ts` via
  `createAgentFaceRouteHandler` — ALWAYS with `authorize`; use
  `@agentface/ai-sdk`'s `createAISDKAdapter` unless told otherwise.
- Help articles via the `help` prop ground the assistant's how-does-X-work
  answers; write them from the user's perspective.

## Verify your work

- `agentface doctor` must pass (unauthenticated endpoint and manifest
  drift are failures).
- Run the app, open **DevTools** (bottom toggle): your surface appears in
  the tree, resources read correctly, and the action runner walks
  prepare → preview → confirm → execute. The **Agent readiness** report
  should not regress.
- Confirm the assistant can actually complete the feature's core flow —
  and that declining a confirmation stops it.

## Common mistakes to avoid

- Registering resources with copied values instead of live getters.
- Actions that succeed but return nothing useful — return what changed
  (ids, new totals, new status) so the agent can report accurately.
- Sensitivity on the surface boundary only — set it per action.
- Forgetting `"use client"` on components using the hooks.
- Re-creating the face object each render (define at module scope, or use
  the inline `<AgentSurface id description>` form).
- Interfaces (not `type` aliases) for result shapes — interfaces don't
  satisfy `JsonValue`'s index signature.
