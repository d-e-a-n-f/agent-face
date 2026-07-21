# 0004 — Runtime execution is always policy-mediated

## Status

Accepted

## Context

Agent access must not silently inherit all user capabilities. If callers could reach action closures directly, every safety property — validation, preconditions, confirmation, sensitivity limits, staleness checks — would be advisory.

## Decision

Every operation flows through the runtime, and the runtime enforces a fixed lifecycle that cannot be reordered or skipped:

```
locate surface → locate action → inspect policy → validate input
→ availability → preconditions → revision check → execute policy
→ preview → confirmation requirement → (confirm) → execute → trace
```

- The policy engine (`@agentface/policy`) is consulted for discovery, reads, inspection, and execution; `deny` produces `POLICY_DENIED`, `confirm` escalates to a confirmation requirement that composes (OR) with the action definition's own confirmation rule.
- Execution closures are private to the runtime's stored registrations; no public API returns them.
- `executeAction` refuses unconfirmed-but-required preparations (`CONFIRMATION_REQUIRED`) and re-checks revision before executing.
- Every step emits structured trace events, so the enforcement itself is observable.

## Consequences

- There is exactly one path to side effects, which is what makes confirmation and audit meaningful.
- Application code stays authoritative: policies and preconditions run against live application state via closures.
- Each operation pays for policy evaluation — negligible in-memory, and the policy interface is async-ready for when it isn't.

## Alternatives considered

- **Policy checks in the React layer**: bypassable by any non-React caller (DevTools, assistant, tests); rejected.
- **Advisory policy (warnings only)**: incompatible with the security posture the product sells.
