# 0006 — No LLM required for runtime tests

## Status

Accepted

## Context

The runtime's correctness properties — lifecycle order, policy enforcement, confirmation binding, staleness rejection — must be provable deterministically. Model calls are slow, non-deterministic, and unavailable in CI; testing through a model would make every safety guarantee flaky.

## Decision

The runtime and everything beneath it is fully operable and testable without any language model:

- `createAgentRuntime` accepts injectable `now` and `generateId`, so timestamps, instance IDs, preparation IDs, expiry, and trace ordering are deterministic in tests.
- DevTools (not an assistant) is the first runtime client and the Phase-4 acceptance vehicle.
- The assistant layer, when it arrives, gets a deterministic mock model adapter first; CI never makes real model calls.
- Tests assert on structured trace events and typed errors, not rendered output.

## Consequences

- The full action lifecycle, all failure paths, and expiry behaviour run in milliseconds in CI.
- The eventual model integration is a thin translation layer over an already-proven runtime, so model-related bugs are isolated to that layer.
- Discipline required: features must not be designed so that only a model can exercise them.

## Alternatives considered

- **Model-in-the-loop integration tests**: rejected for CI (non-deterministic, slow, costly); belongs in manual/e2e evaluation later.
- **Recorded model fixtures**: still couples tests to a provider's response shapes before the runtime contracts are stable; may be useful later for the assistant package itself.
