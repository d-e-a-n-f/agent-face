---
sidebar_position: 7
title: Roadmap
---

# Roadmap

Where this goes next, in rough order of intent. Nothing here is scheduled.

**MCP bridge** — expose a running app's surfaces as an MCP server, so any MCP
client (Claude Desktop, Claude Code, agent browsers) can operate the live
page through typed, policy-gated actions. The contracts were kept
serialisable from day one for exactly this.

**Agent evals** — record scenarios (instruction → expected action sequence →
expected confirmations) and replay them against real models as scored eval
suites. CI stays deterministic; evals measure the probabilistic layer.

**Plans & undo** — prepare several actions as one reviewable changeset with a
single approval; optional compensating closures make agent mistakes
reversible, justifying more autonomy for low-risk operations.

**Approval routing & audit export** — route approvals to a named approver's
inbox (bound to *their* identity), and stream the trace — action + preview +
confirmation evidence — to OTLP/webhooks.

**Also on the list** — domain events as proactive triggers; streaming
assistant responses; server-side web tools for the model endpoint; more
`useAgentForm`-style wrappers (tables, queries); Vue/Svelte bindings;
NestJS/Express endpoint wrappers; Standard Schema inputs (drop `fromZod`);
markdown-sourced and semantically-searched knowledge.
