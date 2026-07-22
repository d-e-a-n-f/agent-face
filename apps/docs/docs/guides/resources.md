---
title: Resources
---

# Resources

Resources expose feature state agents may read. Two forms:

```tsx
// Value form — pass the current value each render:
useAgentResource({
  id: "current-value",
  description: "The counter's current value",
  value: count,
  revision: count,
});

// Getter form — register stable getters that read current state:
useAgentResource({
  id: "summary",
  description: "The current invoice totals and status",
  getValue: () => ({ status: invoice.status, total: invoiceTotal(invoice) }),
  getRevision: () => revision,
});
```

Either way the runtime stores a **live getter** — reads always reflect current
state, with one registration per mount.

## Serialisation contract

Resource values cross the agent boundary as JSON. Either return JSON-safe
values or provide `serialize: (value) => JsonValue`. The SDK types
serialisable positions as `JsonValue` (not `unknown`) so the compiler keeps
you honest.

## Sensitivity

Classify resources (`public` | `internal` | `confidential` | `restricted`)
and let policy enforce ceilings — a `restricted` resource can be unreadable to
agents while remaining visible to the human UI. `<AgentBoundary>` provides an
inherited default sensitivity to everything registered beneath it.

## Revisions

Revisions power staleness: bump the surface revision after mutations
(`useAgentSurface().bumpRevision()`) so previously prepared actions are
rejected with `STALE_STATE` instead of executing against state the user never
saw. Resource-level `getRevision` gives finer granularity when one surface
hosts several independent pieces of state.
