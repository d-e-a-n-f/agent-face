---
sidebar_position: 3
title: Core concepts
---

# Core concepts

## Faces, surfaces, instances

A **face** is a reusable description of a feature's agent interface —
`billing.invoice`, with a name and description. A **mounted surface instance**
is one live occurrence of that face on screen, with a session-unique instance
id, an optional **entity** ("this is invoice inv_9821"), and parent/child
links (surfaces nest). The same entity can be mounted in two views at once —
each is its own operable target.

## Resources

Live, readable state: a resource registers a **getter**, not a snapshot, so
agents always read current values. Resources carry sensitivity
classifications your policy can act on, and optional `serialize` for values
that aren't directly JSON-safe.

## Actions

Business operations with a stable id, a human description, a **typed input
schema**, optional **preconditions** ("the invoice must be a draft"), an
optional **preview** of what will change, a **confirmation rule**, an optional
**recommendation** rule ("suggest this next step while X holds"), and the
`execute` closure — which stays in your app and is never serialised.

## The action lifecycle (enforced, in order)

```
locate surface → locate action → inspect policy → validate input
→ availability → preconditions → revision check → execute policy
→ preview → confirmation requirement → (user confirms) → execute → trace
```

Nothing skips steps. A **prepared action** binds the validated input, the
preview shown to the user, the state **revision** it was prepared against, and
an expiry. Confirmation applies to that exact preparation — never "allow this
agent to do things". If state changes first, execution fails with
`STALE_STATE`. Preparations are single-use.

## Policy

A composable engine decides `allow`, `deny`, or `confirm` for every
operation — discovery, reads, inspection, execution. First deny wins; any
confirm escalates. Built-in rules cover agent authentication, delegation,
sensitivity ceilings, and confirmation thresholds. Your rules see the
principal, the surface, the entity, the sensitivity, and the validated input.

## Traces

Every step emits a structured, typed event (`action.prepared`,
`policy.decided`, `action.succeeded`, …) into an in-memory trace the DevTools
panel renders — and packages never `console.log`.

## Errors

Typed and stable: `SURFACE_NOT_FOUND`, `INVALID_INPUT`,
`PRECONDITION_FAILED`, `POLICY_DENIED`, `CONFIRMATION_REQUIRED`,
`STALE_STATE`, `EXECUTION_FAILED`, … Agents receive them as structured tool
results and can adjust rather than hallucinate.

## The package map

```
@agentface/core      contracts: faces, resources, actions, schemas, errors, events
  └─ @agentface/policy     allow / confirm / deny rule engine
       └─ @agentface/runtime    in-memory registry + the enforced lifecycle
            ├─ @agentface/react      provider, surfaces, hooks (+ /hook-form, knowledge)
            ├─ @agentface/testing    deterministic test runtime (+ /react helpers)
            ├─ @agentface/devtools   the embeddable inspection panel
            └─ @agentface/assistant  model adapters + assistant loop (+ /react widget, /bedrock)
                 └─ @agentface/next  route handler (+ /navigation, /app umbrella)
```

Everything below `react` is UI-framework-independent; everything is
LLM-independent except `assistant`, and even that ships a deterministic mock
adapter — CI never calls a real model.
