---
title: Actions
---

# Actions

Actions are business intent — `send`, `apply-discount`, `publish-share-class`
— never UI mechanics. Register them on the nearest surface with
`useAgentAction`:

```tsx
useAgentAction({
  id: "apply-discount",
  description: "Apply a percentage discount to the whole invoice",
  input: fromZod(z.object({ percent: z.number().min(0).max(100) })),
  confirmation: {
    type: "conditional",
    reason: "Discounts above 20% need explicit approval",
    evaluate: (input) => input.percent > 20,
  },
  preconditions: [
    {
      id: "invoice-is-draft",
      description: "The invoice must still be a draft",
      check: () => invoice.status === "draft",
    },
  ],
  preview: (input) => ({
    summary: `Change discount from ${invoice.discountPercent}% to ${input.percent}%`,
    changes: [{ path: "discountPercent", from: invoice.discountPercent, to: input.percent }],
  }),
  execute: (input) => applyDiscount(input.percent),
});
```

## Defaults that cut boilerplate

- `name` is derived from the id (`save-draft` → "Save draft").
- `input` is optional: zero-input actions get a strict empty-object schema —
  `{}` parses, anything else is `INVALID_INPUT`.
- `isAvailable` defaults to always-available; use it for state-dependent
  visibility (`() => invoice.status === "draft"`).

## Inputs

Inputs go through an `AgentInputSchema<T>` — `parse(unknown) → T` plus
optional JSON Schema for the model's tool definition. Use the Zod adapter
(`fromZod` from `@agentface/core/zod`) or implement the two methods yourself.
Validation failures surface as `INVALID_INPUT` with per-path details.

## Previews and confirmation

A preview is what the user sees on the confirmation card — make the summary
name the real things ("Send INV-1002 (£1,200) to billing@wilshire.example").
Confirmation rules are `"never"`, `"always"`, or conditional on the validated
input. Policy can *also* force confirmation (e.g. all `confidential`+
executions) — the requirements OR together.

## Live closures

In React, every closure — `execute`, `preview`, precondition checks,
availability, recommendation conditions — reads the **latest render's**
options. An action invoked after fifty rerenders sees current state, with one
stable registration per mount (Strict Mode safe).

Read state through refs (or a store's `getStore()`), not captured snapshots,
when actions run in sequence within one assistant turn — see how the Portal's
store does it.

## Recommendations

Add `recommend` to mark an action as the sensible next step while a condition
holds — see the [recommendations guide](./recommendations.md).
