---
title: Recommended next steps
---

# Recommended next steps

Applications know their own workflows: after validation passes, requesting
approval is the obvious next move. Declare that on the action and the UI gets
live, one-tap next-step buttons:

```tsx
useAgentAction({
  id: "send",
  description: "Send the completed invoice to the client",
  recommend: {
    when: () => invoice.status === "draft" && invoice.lineItems.length > 0,
    reason: "The draft has line items and is ready to send",
    instruction: () => `Send invoice ${invoice.number} to the client`,
    priority: 8,
  },
  // …
});
```

## How it flows

- The runtime's `getRecommendedActions()` evaluates every mounted action's
  condition against live state (availability-gated, priority-sorted; a
  throwing closure just means "not recommended").
- `useAgentRecommendations()` keeps the list live — re-evaluated on every
  runtime event **plus a light poll**, so silent changes (the human typing
  into a form) surface too.
- The widget renders them as `✦` buttons with the reason as tooltip. One tap
  sends the `instruction` through the assistant — so a recommended *publish*
  still pauses on its confirmation card. No side door around the gates.

## Why declarative, not model-guessed

Deterministic (testable in CI), instant (no model round-trip to render
buttons), and honest — the app's own definition of "sensible next step", not
a hallucination. Watch it in the Portal: an empty onboarding form recommends
nothing; once the agent fills it validly, **Submit onboarding** appears; on
an invoice, **Send invoice** appears the moment the draft has its first line
item.
