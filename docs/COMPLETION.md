# Completion report — AgentFace MVP

Date: 2026-07-22. Written per MISSION §29's working approach.

## What was built

**Packages** (all strict TS: `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`; no `any`; acyclic graph):

- `@agentface/core` — contracts, `defineAgentFace/Resource/Action/Event` with
  DX defaults (humanised names, optional version/input), `AgentInputSchema`
  + Zod adapter (`/zod`), `JsonValue` typing for serialisable positions,
  typed errors, trace events, recommendations.
- `@agentface/policy` — composable engine (first-deny, confirm-escalation,
  configurable default) + built-in rules incl. sensitivity ceilings.
- `@agentface/runtime` — surface/resource/action registry, the enforced
  lifecycle, preparation binding (input/preview/revision/expiry, single-use),
  discovery, snapshots, recommendations, trace buffer, injectable clock/ids.
- `@agentface/react` — provider, `AgentSurface` (inline or explicit face),
  live-closure hooks, boundaries, `AgentFaceKnowledge`,
  `useAgentRecommendations`, `useAgentForm` (`/hook-form`).
- `@agentface/assistant` — neutral adapter contract, assistant loop
  (confirmation is never a model tool), mock adapter, Bedrock adapter
  (`/bedrock`), HTTP transport + framework-neutral endpoint, widget + headless
  hook (`/react`).
- `@agentface/next` — route handler, `AgentFaceNavigation` (journeys,
  `:param` templates) (`/navigation`), `AgentFaceApp` umbrella (`/app`).
- `@agentface/devtools` — surface tree, inspectors, action runner, traces.
- `@agentface/testing` — deterministic runtime, principals, one-call
  execution, RTL helpers (`/react`).

**Demo**: the Portal (`apps/web`) — multi-page mini-app (clients, per-client
onboarding via a real react-hook-form, per-client invoices, product
publication), localStorage persistence with reset, help articles, e2e mock
adapter; plus the counter learning example.

**Docs**: Docusaurus site (`apps/docs`) with quick start, concepts, 8 guides,
demo walkthrough, architecture, roadmap; GitHub Pages workflow; root README;
ADRs 0001–0009; MVP checklist with per-claim evidence.

## Verification

- 134 unit tests across 8 packages + the app's domain tests — deterministic,
  zero model calls (ADR 0006).
- 11 Playwright specs: DevTools lifecycle + staleness, counter, cross-page
  invoice flow (+ decline), onboarding (+ recommendations re-evaluation),
  publication chain (+ declined approval), help Q&A, denied execution,
  persistence across hard reload.
- `pnpm build / test / check-types / lint` green at root (incl. docs build).
- `pnpm pack` verified for core and react: dist-only tarballs, exports intact.

## Known limitations

Browser-local runtime only (by design, ADR 0001); packages unpublished
(Changesets initialised, 0.1.0 baseline changeset recorded); one real model
adapter (Bedrock); approver-routing and timed cold-start DX run outstanding
(see MVP-CHECKLIST.md).

## Recommended next step

Publish 0.1.0, then the roadmap's first bet: the MCP bridge — followed by
agent evals. See `.plans/10-future-roadmap.md` (local) / docs roadmap page.
