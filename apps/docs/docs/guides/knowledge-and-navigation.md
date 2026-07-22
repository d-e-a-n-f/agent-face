---
title: Knowledge & navigation
---

# Knowledge & navigation

## App knowledge — grounded answers

Register your product's help content once and the assistant can answer
"how does X work?" from **your** documentation — and knows your app's rules
before acting:

```tsx
import { AgentFaceKnowledge } from "@agentface/react";

<AgentFaceKnowledge
  articles={[
    {
      id: "invoice-discounts",
      title: "Invoice discounts",
      body: "Discounts up to 20% apply immediately. Above 20% requires explicit approval…",
      tags: ["invoices", "discounts"],
    },
  ]}
/>
```

This mounts a knowledge surface with `search-help` and `read-help-article`
actions plus a `help-topics` resource. The assistant's default prompt says
*search the app's help first for how/why questions, ground the answer, then
offer to do the thing* — support content that can also do the work.

(With `<AgentFaceApp>`, pass `help={articles}`.)

## Navigation — journeys and moving between screens

```tsx
import { AgentFaceNavigation } from "@agentface/next/navigation";

<AgentFaceNavigation
  routes={[
    { path: "/clients", description: "Client list" },
    { path: "/clients/:clientId", description: "One client" },
  ]}
/>
```

Three capabilities (Next.js App Router; `:params` supported):

- **`current-location`** — the screen the user is on.
- **`journey`** — where they came from: recent screens *and* actions taken,
  sourced from the runtime's own trace. Agents read this when a request
  depends on what happened earlier.
- **`navigate`** — move to a declared route. Navigation is constrained to
  your templates and validated at prepare time.

Because the assistant lives in your layout, its conversation survives
client-side navigation — so it can read data on one screen, navigate, and use
what it learned to fill things in on another. The Portal's cross-page invoice
flow is exactly this.

(With `<AgentFaceApp>`, pass `routes={...}`.)
