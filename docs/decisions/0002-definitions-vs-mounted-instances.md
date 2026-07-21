# 0002 — Definitions versus mounted instances

## Status

Accepted

## Context

A face like `billing.invoice` describes a feature's agent interface, but at any moment the application may have that feature mounted zero, one, or several times — including multiple views of the same entity (a table row and a detail pane, say). Agents need to address the specific mounted feature the user is looking at.

## Decision

The runtime separates three things:

1. **Face definition** (`AgentFaceDefinition`) — static, reusable, validated by `defineAgentFace`.
2. **Mounted surface instance** (`AgentSurfaceInstance`) — one live occurrence with a session-unique `instanceId` of the form `faceId:entityId:counter`, parent/child links, a mount timestamp, and a monotonically increasing revision.
3. **Live capability registrations** — resources and actions registered against an instance with getter closures, so reads always reflect current state.

Instance IDs are never just face ID + entity ID, because the same entity can be mounted in multiple views simultaneously.

## Consequences

- Agents operate on precisely the mounted feature in context; two views of the same invoice are distinct operable targets.
- Preparations, confirmations, and revisions bind to an instance, giving staleness detection a well-defined scope.
- React bindings map cleanly: mount registers an instance, unmount removes it, nesting builds the graph.
- Discovery results and traces must carry instance IDs, which are meaningless across sessions — acceptable for a browser-local runtime, revisited when a protocol layer exists.

## Alternatives considered

- **Face ID + entity ID as identity**: collides when the same entity appears twice; rejected.
- **Definitions only (no instances)**: cannot express "the invoice currently open", which is the product's core context advantage.
