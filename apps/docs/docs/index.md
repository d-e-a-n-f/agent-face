---
sidebar_position: 1
slug: /
title: What is AgentFace?
---

# What is AgentFace?

**AgentFace is the agent interface layer for software.** It gives every page,
feature, and workflow in your app a typed, secure interface that AI agents can
understand and operate — while the human confirms anything consequential.

Your application already has a human-facing interface: buttons, forms, tables.
AgentFace adds the machine-facing counterpart:

- what the feature **represents** and which **entity** is active
- which **resources** an agent may read (live state, not snapshots)
- which **actions** it may invoke, with **typed inputs** and **preconditions**
- what requires the user's **confirmation**, with an exact **preview**
- whether execution **succeeded**, in a structured, auditable **trace**

## Why not DOM automation or backend APIs?

DOM automation is brittle: labels, markup, and layout are not contracts, and
"did it work?" is guesswork. Backend APIs are reliable but blind to context —
`PATCH /products/{id}` doesn't know which product the user has open, what's
selected, or what the interface would make a human confirm. Bespoke per-feature
AI integrations rebuild the same scaffolding every time.

AgentFace standardises that layer: actions express **business intent**
(`invoice.send`, `product.publish`) — never `clickButton` — and every
invocation flows through one policy-mediated lifecycle your application
controls.

## The safety model, in one paragraph

Agents can only act through the runtime. Every action is validated against its
schema, checked against preconditions and your policy engine, previewed, and —
when required — paused on a confirmation card bound to the **exact** prepared
operation (input, preview, state revision, expiry). If the state changes
underneath a prepared action, it goes stale instead of executing. Every step
lands in a structured trace. Application code remains authoritative
throughout.

## What you get out of the box

| Piece | What it does |
| --- | --- |
| `<AgentFaceApp>` | One component wiring the whole stack into a Next.js app |
| `<AgentSurface>` + hooks | Expose features: resources, actions, live closures |
| `useAgentForm` | Agent-enable any react-hook-form form in one call |
| Assistant widget | Floating chat with confirmation cards and next-step buttons |
| `AgentFaceKnowledge` | Ground the assistant's answers in your own help content |
| `AgentFaceNavigation` | Journeys + agent navigation across screens |
| DevTools panel | Inspect and operate every capability without a model |
| Policy engine | allow / deny / confirm rules; sensitivity ceilings |
| Testing package | Deterministic runtime — no LLM in your tests, ever |

Start with the [quick start](./quick-start.md), then see it all working in
[the Portal demo](./playground.md).
