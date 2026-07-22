---
title: Policy & confirmation
---

# Policy & confirmation

## The policy engine

Every operation — discovery, resource reads, action inspection, execution —
is checked against your policy engine before it happens:

```ts
import { standardUserPolicy, developmentPolicy } from "@agentface/policy";

// Development: allow everything, but exercise the confirmation UX from
// day one (confidential+ still confirms):
const dev = developmentPolicy();

// Production baseline: authenticated user required, agents need a valid
// delegation, restricted denied outright, confidential+ confirmed:
const policy = standardUserPolicy({
  rules: [requireRole("finance-admin", { forActions: ["send"] })],
});
```

Presets are compositions of the same rule primitives you can use directly
(`createPolicyEngine([...])`): `requireUser`, `requireRole`,
`requireSameTenant`, `requireDelegation`, `enforceSensitivity`,
`enforceActionConfirmation`, `limitActionRate`, `limitMonetaryValue`,
`denyOutsideBusinessHours`, and `readOnlyPolicy()` for look-but-don't-touch
access. Rules with a data dependency take an extractor (e.g.
`limitMonetaryValue({ amountOf })`) — AgentFace never guesses which input
field is money or where roles live.

Semantics: rules run in order; `undefined` abstains; the **first deny wins**;
any `confirm` escalates an allow; the default effect is configurable
(`allow` for development, `deny` for production allow-listing). Every
evaluation is deterministic and produces a per-rule trace.

Custom rules are plain objects:

```ts
{
  id: "no-agent-sends-after-hours",
  evaluate: (request) =>
    request.operation === "execute-action" &&
    request.actionId === "send" &&
    isAfterHours()
      ? { effect: "deny", reason: "Sends are queued until morning" }
      : undefined,
}
```

## Confirmation binds to the prepared operation

When confirmation is required — by the action's own rule or by policy — the
runtime pauses on the **exact preparation**: surface instance + action +
validated input + preview + state revision + expiry. Not "allow this agent to
proceed": *this* operation, as previewed. Expired preparations are rejected;
revision drift rejects with `STALE_STATE`; execution is single-use, so a
confirmation can never be replayed.

In the assistant, confirmation is **never a model tool** — the card renders to
the human, and a declined action returns a structured "the user declined; do
not retry" result to the model.

## Sensitivity ceilings in practice

The Portal demo runs exactly the policy above: sending an invoice
(`confidential`) works but always asks; `write-off` (`restricted`) is denied
outright with `POLICY_DENIED` — try it from the DevTools runner on any
invoice page.
