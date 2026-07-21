# 0008 — Confirmation binds to the prepared operation

## Status

Accepted

## Context

A confirmation dialog that asks "allow this agent to proceed?" grants far more than the user can see: the agent could substitute different inputs, or the state could have changed since the user looked. Confirmation is only meaningful if what is confirmed is exactly what executes.

## Decision

Confirmation applies to a specific `PreparedAgentAction`, never to an agent or an action in general. A preparation binds:

- the surface **instance** (not just the face),
- the **action**,
- the **validated input** (post-schema, the exact values that will execute),
- the generated **preview** shown to the user,
- the **revision** of the state it was prepared against,
- an **expiry** (default 5 minutes).

`confirmAction` and `executeAction` both re-verify freshness: expired preparations are rejected (`CONFIRMATION_REQUIRED` with `expired: true`), revision drift is rejected (`STALE_STATE`), and a consumed or invalidated preparation cannot be replayed — execution is single-use.

## Consequences

- What the user saw in the preview is what runs, or nothing runs.
- Agents cannot pre-collect confirmations and spend them later, and cannot execute against changed state.
- Slightly chattier flow (prepare → confirm → execute), which DevTools and the assistant wrap into a simple UI.

## Alternatives considered

- **Session-level agent authorisation**: one grant covers everything; precisely the anti-pattern this product exists to avoid.
- **Confirmation binding to action + input only (no revision/expiry)**: still executes against drifted state; rejected.
- **Re-preparing at execute time**: would execute something the user never saw; rejected.
