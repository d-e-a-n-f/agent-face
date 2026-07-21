# 0003 — Domain actions, not DOM actions

## Status

Accepted

## Context

Agents interacting with web applications typically fall back to UI automation: find a button, click it, type into inputs, interpret validation messages. Implementation details of an interface are not reliable contracts — markup, labels, and layout change constantly, and success detection is guesswork.

## Decision

AgentFace contracts express business intent, never UI mechanics.

- Action identifiers name domain operations: `invoice.send`, `customer.issueCredit`, `product.publish`.
- There are no primitives like `clickButton`, `setInputValue`, or `openDialog`, and none will be added.
- Actions carry typed inputs, preconditions, confirmation policies, previews, and typed results — the things a business operation actually needs.
- The visible UI and the AgentFace are parallel projections of the same feature; an agent invokes the registered action directly rather than locating the Send button.

## Consequences

- Contracts survive redesigns of the visual interface.
- Success and failure are structured (`AgentActionResult`, stable error codes) instead of inferred from the DOM.
- Developers must describe features in domain terms, which is a small authoring cost and a large clarity gain.
- Legacy-app coverage via automatic DOM contract generation is deliberately out of scope for now (possible future adapter layer).

## Alternatives considered

- **DOM automation primitives**: universal coverage with zero authoring, but brittle, unauditable, and unable to express confirmation or preconditions.
- **Hybrid (domain actions + escape-hatch click primitives)**: the escape hatch would become the default path and undermine the contract; rejected.
