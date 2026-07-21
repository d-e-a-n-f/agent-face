# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

AgentFace — the agent interface layer for software. It lets React features expose typed, secure, contextual interfaces (Agent Surfaces) that AI agents can discover, inspect, and operate — instead of DOM clicking. **`MISSION.md` at the repo root is the authoritative product mission, architecture spec, and build plan. Read it before doing any substantial implementation work.** Step-by-step build plans decomposing it into phases live in `.plans/` (start with `.plans/00-overview.md`); work them in order.

Current state: a fresh Turborepo scaffold (pnpm workspaces) with a Next.js app at `apps/web` and an empty `packages/` directory. The SDK packages described below are planned, not yet built. **`apps/web` IS the playground** — the integration and acceptance-test application for the SDK. MISSION.md calls it `apps/playground`, but the deliberate decision is to keep the `apps/web` name; do not rename it.

## Commands

Package manager is **pnpm** (v9). Run from the repo root:

```bash
pnpm install
pnpm build          # turbo run build
pnpm dev            # turbo run dev (Next.js dev server)
pnpm lint           # turbo run lint
pnpm check-types    # turbo run check-types
pnpm format         # prettier --write "**/*.{ts,tsx,md}"
```

There is no test setup yet. When adding it (Phase 0 of MISSION.md): Vitest for packages, React Testing Library for React bindings/DevTools, Playwright for playground end-to-end flows. Wire `test` as a turbo task. Tests must be deterministic and must never call a real LLM.

To scope a turbo command to one workspace: `pnpm turbo run build --filter=web` (or `--filter=@agentface/core` once packages exist). To run a single Vitest test once configured: `pnpm vitest run path/to/file.test.ts` from the owning package.

## Architecture

### Core concept

Every human-facing feature can expose an **Agent Surface**: identity, entity context, readable resources, invokable actions (with typed inputs), preconditions, confirmation policies, previews, and execution results. Actions express **business intent** (`invoice.send`, `product.publish`), never UI mechanics (`clickButton`, `setInputValue`). Application code remains authoritative for validation, authorization, and state transitions — agents can only invoke capabilities through the policy-mediated runtime.

### Package dependency graph (must stay acyclic)

```
@agentface/core          — contract types, defineAgentFace/Resource/Action, schema abstraction,
      │                    Zod adapter, error codes. No React, no browser APIs, no runtime.
      ├─► @agentface/policy   — allow/confirm/deny decisions; composable rules; imports only core
      └─► @agentface/runtime  — in-memory registry of mounted surfaces; discovery, resource reads,
              │                 action lifecycle, traces; imports core + policy
              ├─► @agentface/react     — Provider/AgentSurface/hooks; imports core + runtime
              ├─► @agentface/testing   — test runtime & helpers; imports core + policy + runtime
              └─► @agentface/devtools  — embeddable dev panel; imports core + runtime + react
```

Packages must never import from the playground app. `@agentface/assistant` (model adapters) comes only after the runtime is provably operable through DevTools without an LLM — build a deterministic mock adapter before any real provider.

### Key runtime invariants

- **Definition vs instance**: a face definition (`billing.invoice`) is reusable; a mounted surface instance has a unique per-session instance ID. Same entity can be mounted in multiple views.
- **Action lifecycle order is enforced**: locate → validate input → check availability → check preconditions → check revision → evaluate policy → preview → require confirmation → confirm → execute → trace. Sensitive operations cannot bypass `prepareAction`.
- **Confirmation binds to the exact prepared operation** (surface instance + action + validated input + preview + expected revision + expiry) — never a generic "allow anything" grant.
- **Resources register live getters**, not copied state; React hooks update closures on rerender without unregistering/re-registering. Strict Mode safety (no duplicate/leaked registrations) requires dedicated tests.
- **Revisions detect staleness**: a prepared action becomes stale (`STALE_STATE`) if state changes before execution.
- Everything is in-memory and browser-local for the first build — no DB, queues, cloud services, hosted control plane, browser extensions, or durable workflows (full non-goals list: MISSION.md §24).
- Schema validation goes through an `AgentInputSchema<T>` abstraction with a Zod adapter — don't couple contracts directly to Zod internals.
- Errors are typed objects with stable codes (`SURFACE_NOT_FOUND`, `INVALID_INPUT`, `PRECONDITION_FAILED`, `POLICY_DENIED`, `CONFIRMATION_REQUIRED`, `STALE_STATE`, `EXECUTION_FAILED`, …) — never generic string throws across package boundaries. No scattered `console.log`; emit runtime trace events instead.

### Implementation standards

- TypeScript strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; no `any` in public APIs; named exports only in library packages; explicit package exports; TSDoc on public APIs.
- AgentFace registration is client-side: components using the hooks need `"use client"`. Do not attempt React Server Component registration support.
- Record significant design choices as ADRs in `docs/decisions/` (see MISSION.md §22 for the initial set).
- Follow the exact implementation order in MISSION.md §26. The first vertical slice is the invoice example (`/examples/invoice`) operated end-to-end through DevTools — do not skip ahead to model/assistant integration.

## Next.js note

`apps/web/AGENTS.md` warns that the installed Next.js (16.x) has breaking changes vs. training data — read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code.
