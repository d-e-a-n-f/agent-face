---
title: Recommended next steps
---

# Recommended next steps

Applications know their own workflows: after validation passes, requesting
approval is the obvious next move. Declare that on the action and the UI gets
live, one-tap next-step buttons:

```tsx
useAgentAction({
  id: "request-approval",
  description: "Send a validated share class to a named approver",
  recommend: {
    when: () => shareClasses.some((sc) => sc.validation === "passed" && sc.approval === "draft"),
    reason: "A validated share class is awaiting sign-off",
    instruction: () => `Send ${nextUnapproved().name} to Sarah for approval`,
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
nothing; once the agent fills it validly, **Submit onboarding** appears; the
Products page walks create → validate → approve → publish one button at a
time.
