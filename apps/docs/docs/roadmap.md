---
sidebar_position: 7
title: Roadmap
---

# Roadmap

Where this goes next, in rough order of intent. Nothing here is scheduled.

**Deterministic agent evals** — `defineAgentScenario` (instruction →
expected reads → expected preparations → expected confirmations → final
state), run in CI without a model against the deterministic runtime; the
same scenarios later replay against real models as scored eval suites.

**More `useAgentForm`-style wrappers** — `useAgentQuery`/`useAgentMutation`
(React Query) and `useAgentTable` (TanStack Table): one-line agent
capability over the libraries apps already use.

**Plans & undo** — prepare several actions as one reviewable changeset with
per-step previews and a single approval; optional compensating closures
make agent mistakes reversible, justifying more autonomy for low-risk
operations.

**Events** — domain events as proactive triggers: suggested next actions,
notifications, recommendation wake-ups. Events start evaluation; policy
still gates every action.

**OpenTelemetry export** — stream the trace (actions, previews, policy
decisions, confirmation evidence, model calls) to OTLP.

**Approval routing** — route approvals to a named approver's inbox (bound
to *their* identity): four-eyes flows, expiry, email/Slack approval links.
Requires the server session bridge, which also unlocks server-driven
agent frameworks operating live sessions.

**Also on the list** — streaming assistant responses; server-side web
tools for the model endpoint; Vue/Svelte bindings; NestJS/Express endpoint
wrappers; Standard Schema inputs (drop `fromZod`); markdown-sourced and
semantically-searched knowledge.
