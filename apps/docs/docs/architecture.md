---
sidebar_position: 6
title: Architecture
---

# Architecture

## Principles

1. **Domain actions, not DOM actions** — contracts name business intent;
   there is no `clickButton` and never will be.
2. **Application code stays authoritative** — agents select capabilities;
   your validation, authorisation, and state transitions decide.
3. **One path to side effects** — everything flows through the runtime's
   enforced lifecycle; that's what makes confirmation and audit meaningful.
4. **Confirmation binds to the prepared operation** — input + preview +
   revision + expiry, single-use.
5. **Local first, transportable by design** — the runtime is browser-local
   and in-memory; every contract is JSON-serialisable so future transports
   (HTTP, WebSocket, MCP) need no redesign. Execution closures never leave
   the app.
6. **No LLM required below the assistant layer** — DevTools proves the whole
   stack deterministically; CI never calls a model.

## The runtime model

```
Face definition (reusable)
    ↓ mount
Surface instance (session-unique id, entity, revision, parent/child)
    ↓ register
Live resources (getters) + live actions (closures)
    ↓ operate (policy-mediated)
discover → read → prepare → confirm → execute → trace
```

## Package graph (acyclic)

```
core → policy → runtime → { react, testing, devtools, assistant } → next
```

Full dependency rules, the reasoning behind each decision, and the
alternatives considered live in the repo as
[architecture decision records](https://github.com/d-e-a-n-f/agent-face/tree/main/docs/decisions)
(ADR 0001–0009).
