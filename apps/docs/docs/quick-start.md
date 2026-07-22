---
sidebar_position: 2
title: Quick start
---

# Quick start

Goal: an existing React feature becomes agent-readable and agent-operable in
well under an hour. This walkthrough is Next.js (App Router); the runtime is
framework-independent.

:::note
Packages are not yet published to npm — today they live in this repo's
workspace (`pnpm install` at the repo root, then import as below). The
walkthrough is written the way it will work post-publish.
:::

## 1. Wire the app (one component)

```tsx title="app/providers.tsx"
"use client";

import { AgentFaceApp } from "@agentface/next/app";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AgentFaceApp
      application={{ id: "acme", name: "Acme" }}
      routes={[
        { path: "/", description: "Home" },
        { path: "/invoices/:invoiceId", description: "One invoice" },
      ]}
    >
      {children}
    </AgentFaceApp>
  );
}
```

Render `<Providers>` in your root layout. That single component creates the
runtime and mounts the assistant widget, agent navigation, and (outside
production) the DevTools panel.

## 2. Add the model endpoint

```ts title="app/api/agentface/route.ts"
import { createAgentFaceRouteHandler } from "@agentface/next";

export const { POST } = createAgentFaceRouteHandler({
  adapter: async () => {
    const { createBedrockAdapter } = await import("@agentface/assistant/bedrock");
    return createBedrockAdapter(); // Claude via AWS Bedrock; AWS_REGION + creds
  },
});
```

The assistant loop runs in the browser against the local runtime; only model
completions cross this endpoint, so provider credentials never reach the
client. Any provider works — the adapter contract is neutral.

## 3. Expose a feature

```tsx title="app/invoices/[invoiceId]/invoice.tsx"
"use client";

import { fromZod } from "@agentface/core/zod";
import { AgentSurface, useAgentAction, useAgentResource } from "@agentface/react";
import { z } from "zod";

function InvoiceEditor({ invoice }: { invoice: Invoice }) {
  useAgentResource({
    id: "summary",
    description: "The current invoice totals and status",
    getValue: () => ({ status: invoice.status, total: invoice.total }),
  });

  useAgentAction({
    id: "send",
    description: "Send the completed invoice to the customer",
    input: fromZod(z.object({ message: z.string().optional() })),
    confirmation: "always",
    preview: () => ({ summary: `Send ${invoice.number} to ${invoice.email}` }),
    execute: (input) => sendInvoice(invoice.id, input),
  });

  return <YourExistingInvoiceUi invoice={invoice} />;
}

export function InvoicePage({ invoice }: { invoice: Invoice }) {
  return (
    <AgentSurface
      id="billing.invoice"
      description="View, edit and send a customer invoice"
      entity={{ type: "invoice", id: invoice.id }}
    >
      <InvoiceEditor invoice={invoice} />
    </AgentSurface>
  );
}
```

That's the whole integration: the id doubles as the name, zero-input actions
need no schema, and the closures always see current component state.

## 4. Try it

- Open the **DevTools panel** (bottom of the page): your surface, resource,
  and action are discoverable and runnable — prepare, preview, confirm,
  execute — with no model involved.
- Open the **assistant** (bottom right) and say *"send this invoice"*: it
  finds the action, prepares it, and shows you a confirmation card with the
  preview before anything happens.

## 5. Got a form? One more line

```tsx
import { useAgentForm } from "@agentface/react/hook-form";

const form = useForm<Values>({ resolver: zodResolver(schema) });
useAgentForm({ form, name: "Onboarding", description: "the onboarding form" });
```

The agent can now fill any subset of the form through the same form state the
human is editing — validation stays with your resolver. See the
[forms guide](./guides/forms.md).
