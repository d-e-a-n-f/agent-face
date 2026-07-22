---
sidebar_position: 5
title: The Portal demo
---

# The Portal demo

The repo ships one deep, multi-page demo app — **the Portal** — where the
assistant behaves like a colleague: it knows the app's documentation, works
across screens, fills real forms, suggests next steps, and pauses on
confirmation cards for anything consequential.

```bash
git clone https://github.com/d-e-a-n-f/agent-face && cd agent-face
pnpm install && pnpm build
AWS_REGION=us-east-1 pnpm dev     # AWS creds for Claude via Bedrock
# open http://localhost:3000/portal
```

Without AWS credentials everything still works except the live model — the
DevTools panel operates every capability by hand, and the e2e suite drives
the assistant with a deterministic mock.

## Things to ask the assistant

| Ask | What it demonstrates |
| --- | --- |
| *"How do discounts work on invoices?"* | Answers grounded in the app's own help articles |
| *"Onboard Northshore Limited — company number 09876543, UK, 1 Harbour Street, London EC2A 4BX, contact Maya Chen (maya@northshore.example). Save a draft but do not submit."* | Navigates to the right screen, fills a real react-hook-form through form state, saves, and honours "do not submit"; the **Submit** recommendation appears once the form is valid |
| *"Create an invoice for Wilshire Group for a £1,200 consulting day and send it."* | Cross-page flow: client page → create → open invoice → add line → confirmation card with the exact amount and recipient |

Also try: edit the invoice after the assistant prepares a send (staleness
rejection), decline a confirmation (the chain stops and says so), run
`write-off` on an invoice from DevTools (policy denies restricted
executions), and hard-refresh (the demo persists in localStorage; **Reset
demo data** on the dashboard reseeds).

## The two interaction patterns

- **Agent as helper** — Client onboarding: the human owns a real form; the
  agent fills it via `useAgentForm`; the human submits.
- **Agent as primary** — Invoicing: one instruction drives the whole chain
  (navigate → create → add line → send), pausing only on the confirmation
  gate.

The single lite example, `/examples/counter`, is a ~40-line file for learning
the API shape in thirty seconds.
