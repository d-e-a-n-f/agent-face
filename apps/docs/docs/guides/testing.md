---
title: Testing
---

# Testing

**No LLM in your tests, ever.** The runtime and everything beneath it is
fully operable deterministically — that's an architecture decision, not an
aspiration.

## Contract tests

```ts
import {
  createTestAgentRuntime,
  executeTestAction,
  registerTestSurface,
} from "@agentface/testing";

it("requires confirmation before sending", async () => {
  const runtime = createTestAgentRuntime();          // fixed clock, sequential ids
  const surface = registerTestSurface(runtime, { face: invoiceFace });
  runtime.registerAction(surface.instanceId, { definition: sendAction });

  const prepared = await runtime.prepareAction({
    instanceId: surface.instanceId,
    actionId: "send",
    input: { message: "…" },
  });
  expect(prepared.confirmationRequired).toBe(true);
});
```

`createTestAgentRuntime` takes `policy: "allow-all" | "deny-all" | engine`,
and `advanceTime(ms)` drives expiry deterministically.
`executeTestAction(runtime, request)` is the one-call happy path
(auto-confirms; pass `{ autoConfirm: false }` to assert on gating).

## React tests

```tsx
import { getMountedSurfaces, renderWithAgentFace } from "@agentface/testing/react";

const { runtime } = renderWithAgentFace(
  <AgentSurface id="billing.invoice" description="…"><InvoiceEditor /></AgentSurface>,
);
const surfaces = await getMountedSurfaces(runtime);
```

Strict Mode is on by default — it catches duplicate/leaked registrations.

## Testing the assistant

Script the model deterministically with `createMockModelAdapter` — steps may
be functions of the request, so they can resolve runtime-generated tool names
and ids. The script throws when exhausted: an unscripted model call is a
failing test, not an improvising one.

## End-to-end

Drive the real widget with Playwright against the mock adapter (the Portal
gates this behind an env var only its test server sets). The repo's e2e suite
is the worked example: full lifecycles, confirmation gates, declines,
staleness, cross-page flows.
