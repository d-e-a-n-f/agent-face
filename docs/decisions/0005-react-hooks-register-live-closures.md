# 0005 — React hooks register live closures

## Status

Accepted

## Context

React components rerender constantly. If `useAgentResource`/`useAgentAction` re-registered on every render, the runtime would churn (invalidating preparations and spamming traces); if they registered once with mount-time closures, agents would read stale values and execute against dead state. React Strict Mode's deliberate mount/unmount/remount cycle additionally punishes any registration scheme that isn't idempotent per effect instance.

## Decision

Hooks register **once per mount** and route every live behaviour through a **latest-ref**:

- A `useRef` holds the most recent render's options, updated in a dependency-less effect.
- The registered closures (`getValue`, `serialize`, `execute`, `preview`, precondition `check`s, conditional confirmation `evaluate`, `isAvailable`, `getRevision`) all read `latest.current` when invoked — so an action executed after fifty rerenders sees the fiftieth render's state and callbacks.
- Identity and metadata (`id`, name, description, schema shape, tags, sensitivity, the *kind* of confirmation rule, precondition metadata) are fixed at mount; only behaviour stays live.
- Registration lives in a `useEffect` keyed on `(runtime, instanceId, capabilityId)` with cleanup unregistering — Strict Mode's extra cycle produces register/unregister/register, never duplicates or leaks.
- `AgentSurface` registers in an effect and publishes its handle via state, so children observe `null` until the registration commits and register their capabilities in a following effect pass. Entity changes call `setEntity` on the existing instance rather than remounting.

## Consequences

- One stable registration per capability per mount; runtime traces stay meaningful.
- Latest-ref updates commit in effects, so a closure invoked between a render and its commit sees the previous committed options — indistinguishable in practice from event-handler timing.
- Capability identity cannot change without remounting (changing `id` mid-life re-registers) — documented and intended.

## Alternatives considered

- **Re-register on every render**: correct values, unacceptable churn; invalidates prepared actions on unrelated renders.
- **Runtime `update()` called each render**: workable (the runtime supports it) but does per-render work for what a ref read gives for free; kept as the escape hatch for non-React clients.
- **Registering during render**: breaks under concurrent rendering and Strict Mode double-invocation; rejected.
