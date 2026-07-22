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

(With `<AgentFaceApp>`, pass `routes={...}` — or better, a manifest.)

## The application manifest

Live surfaces tell the agent what is executable *right now*; the manifest
tells it what exists *anywhere*:

```ts
export const applicationManifest = defineAgentApplication({
  id: "acme-portal",
  routes: [
    {
      path: "/clients/:clientId",
      description: "One client: profile, onboarding, invoices",
      surfaces: ["crm.client"],
      entities: ["client"],
    },
  ],
});

<AgentFaceApp manifest={applicationManifest} …>
```

One declaration powers four things:

1. **Navigation routes** (no separate `routes` prop needed).
2. **The `application-map` resource** — agents plan across screens they
   have not visited, then navigate to make capabilities available.
3. **The assistant's system context** — it knows every screen from the
   first message.
4. **The DevTools "Agent readiness" report** — the manifest diffed against
   live mounts, plus quality checks (routes exposing no surfaces, mounted
   faces missing from the manifest, sensitive actions without previews or
   confirmation), scored out of 100.

The manifest never grants execution: it is a map, not a permission. What a
route *declares* and what actually *mounts* are reconciled by the coverage
report, not trusted blindly.
