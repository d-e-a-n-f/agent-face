# 0009 — DevTools before assistant

## Status

Accepted

## Context

The tempting first client for AgentFace is a chat assistant — it demos well. But a model-driven client cannot prove the runtime is correct: model behaviour is non-deterministic, failures are ambiguous (bad prompt? bad tool schema? bad runtime?), and every safety property would be exercised only probabilistically.

## Decision

`@agentface/devtools` is the first runtime client, built and shipped before any model integration:

- The panel exercises every runtime operation by hand: discovery (surface tree), resource reads, action inspection, and the complete prepare → preview → confirm → execute lifecycle, plus the trace stream.
- The action runner enforces the same rules an agent would face — execute stays disabled until the exact preparation is confirmed, staleness is surfaced, and typed errors are displayed rather than swallowed.
- The assistant package is gated on this panel proving the vertical slice works deterministically (see ADR 0006).

## Consequences

- Runtime bugs are found with reproducible clicks, not prompt roulette.
- Developers get an inspection/debugging tool that stays valuable after the assistant exists.
- When the assistant arrives, its failures are attributable: anything the DevTools panel can do that the assistant cannot is an assistant-layer bug by definition.
- DevTools is development-only: it warns in production builds and must be excluded from production bundles.

## Alternatives considered

- **Assistant-first**: fastest demo; conflates runtime and model failures during the period the runtime contracts are least stable. Rejected.
- **Browser-extension DevTools**: heavier distribution and permissions story; an embeddable panel ships with zero setup. Extension form factor can come later.
