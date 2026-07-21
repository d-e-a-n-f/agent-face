# 0001 — Browser-local runtime first

## Status

Accepted

## Context

AgentFace's long-term vision includes remote agent bridges, hosted control planes, cross-application workflows, and framework-neutral protocols. Building any of that first would delay the core question: can a React developer make an existing feature agent-readable and agent-operable in under an hour?

Agents today interact with web apps via brittle DOM automation, context-poor backend APIs, or bespoke per-feature integrations. The differentiating layer is the in-app contract — not the transport.

## Decision

The first implementation is a browser-local AgentFace runtime inside a React application:

- In-memory registries (surfaces, resources, actions, traces) — no database, queues, or cloud services.
- Action execution closures stay in the browser process; they are never serialised.
- Core contracts remain serialisable (JSON-safe) so future transports (HTTP, WebSocket, JSON-RPC, model tool definitions) can be added without redesign.
- DevTools is the first runtime client, proving the runtime works deterministically without any LLM.

## Consequences

- Fast iteration on contract ergonomics with zero infrastructure.
- The runtime API must keep storage and transport replaceable (factory-injected clock/IDs, event subscription model).
- External agents cannot reach a session until `@agentface/protocol` exists — accepted for the MVP.

## Alternatives considered

- **Protocol/control-plane first**: maximum long-term leverage, but nothing demonstrable for months and high risk of designing contracts before real usage.
- **Browser extension bridge first**: demos external agents early, but couples the product to extension packaging before contracts stabilise.
- **Backend-API adapter first**: reuses reliable APIs but loses the UI context (active entity, selection, confirmation flows) that is the product thesis.
