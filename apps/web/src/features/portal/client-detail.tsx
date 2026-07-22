"use client";

import { defineAgentFace } from "@agentface/core";
import { fromZod } from "@agentface/core/zod";
import {
  AgentSurface,
  useAgentAction,
  useAgentResource,
  useAgentSurface,
} from "@agentface/react";
import Link from "next/link";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Invoice } from "@/portal/store";
import {
  createInvoice,
  invoiceTotal,
  invoicesForClient,
  usePortalStore,
} from "@/portal/store";

const clientFace = defineAgentFace({
  id: "portal.client",
  name: "Client",
  description:
    "One client: profile, onboarding status, and their invoices; create new invoices here",
  version: "0.1.0",
  tags: ["portal", "clients"],
});

const emptyInput = fromZod(z.object({}));

function ClientDetailFeature({
  clientId,
}: {
  readonly clientId: string;
}): React.JSX.Element {
  const { store, getStore, mutate } = usePortalStore();
  const surface = useAgentSurface();
  const client = store.clients.find((candidate) => candidate.id === clientId);
  const onboarding = store.onboarding[clientId];
  const invoices = invoicesForClient(store, clientId);

  useAgentResource({
    id: "profile",
    name: "Client profile",
    description: "This client's profile, onboarding status, and invoice list",
    getValue: () => {
      const current = getStore();
      const liveClient = current.clients.find(
        (candidate) => candidate.id === clientId,
      );
      return {
        client: liveClient ?? null,
        onboarding: current.onboarding[clientId] ?? null,
        invoices: invoicesForClient(current, clientId).map((invoice) => ({
          id: invoice.id,
          number: invoice.number,
          status: invoice.status,
          total: invoiceTotal(invoice),
        })),
      };
    },
  });

  useAgentAction({
    id: "create-invoice",
    name: "Create invoice",
    description:
      "Create a new empty draft invoice for this client. Returns the invoiceId — open it at /portal/invoices/:invoiceId to add line items and send.",
    input: emptyInput,
    recommend: {
      when: () => {
        const current = getStore();
        const liveClient = current.clients.find(
          (candidate) => candidate.id === clientId,
        );
        return (
          liveClient?.status === "active" &&
          invoicesForClient(current, clientId).length === 0
        );
      },
      reason: "This active client has no invoices yet",
      instruction: () =>
        `Create an invoice for ${getStore().clients.find((candidate) => candidate.id === clientId)?.name ?? "this client"} and open it`,
      priority: 6,
    },
    execute: () => {
      let created: Invoice | undefined;
      mutate((current) => {
        const result = createInvoice(current, clientId);
        created = result.invoice;
        return result.store;
      });
      surface?.bumpRevision();
      return { invoiceId: created?.id ?? "", number: created?.number ?? "" };
    },
  });

  if (client === undefined) {
    return <p className="text-sm text-neutral-500">Unknown client.</p>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {client.name}
            <Badge
              variant={
                client.status === "active"
                  ? "default"
                  : client.status === "prospect"
                    ? "secondary"
                    : "outline"
              }
              data-testid="client-status"
            >
              {client.status}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-neutral-600 dark:text-neutral-400">
          <p>{client.email}</p>
          <p>
            £{client.annualValue.toLocaleString()} / year · renews{" "}
            {client.renewalQuarter}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Onboarding</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between text-sm">
          <span data-testid="client-onboarding-status">
            {onboarding?.submittedAt !== null &&
            onboarding?.submittedAt !== undefined
              ? "Submitted"
              : onboarding?.savedAt !== null &&
                  onboarding?.savedAt !== undefined
                ? "Draft saved"
                : "Not started"}
          </span>
          <Link
            href={`/portal/clients/${client.id}/onboarding`}
            className="rounded border border-neutral-300 px-3 py-1 text-sm hover:border-neutral-500 dark:border-neutral-700"
          >
            Open onboarding
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-neutral-500" data-testid="no-invoices">
              No invoices yet.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {invoices.map((invoice) => (
                <li key={invoice.id} className="flex justify-between">
                  <Link
                    href={`/portal/invoices/${invoice.id}`}
                    className="hover:underline"
                  >
                    {invoice.number}
                  </Link>
                  <span>
                    £{invoiceTotal(invoice).toLocaleString()} · {invoice.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ClientDetail({
  clientId,
}: {
  readonly clientId: string;
}): React.JSX.Element {
  const { store } = usePortalStore();
  const client = store.clients.find((candidate) => candidate.id === clientId);
  return (
    <AgentSurface
      face={clientFace}
      entity={{
        type: "client",
        id: clientId,
        ...(client !== undefined ? { displayName: client.name } : {}),
      }}
    >
      <ClientDetailFeature clientId={clientId} />
    </AgentSurface>
  );
}
