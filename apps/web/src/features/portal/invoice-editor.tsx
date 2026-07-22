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
import { usePortalStore } from "@/portal/store";
import type { Invoice } from "@/portal/store";
import {
  addLineItem,
  applyDiscount,
  getClient,
  getInvoice,
  invoiceSubtotal,
  invoiceTotal,
  saveInvoiceDraft,
  sendInvoice,
} from "@/portal/store";

const invoiceFace = defineAgentFace({
  id: "portal.invoice",
  name: "Invoice",
  description: "View, edit and send one client invoice",
  version: "0.1.0",
  tags: ["portal", "billing"],
});

const addLineItemInput = fromZod(
  z.object({
    description: z.string().min(1).describe("What the line item is for"),
    quantity: z.number().int().positive(),
    unitPrice: z.number().positive().describe("Price per unit in GBP"),
  }),
);

const applyDiscountInput = fromZod(
  z.object({
    percent: z.number().min(0).max(100).describe("Discount percentage, 0–100"),
  }),
);

const sendInput = fromZod(
  z.object({
    message: z.string().optional().describe("Optional message to the customer"),
  }),
);

const emptyInput = fromZod(z.object({}));

function InvoiceEditorFeature({
  invoiceId,
}: {
  readonly invoiceId: string;
}): React.JSX.Element {
  const { store, getStore, mutate } = usePortalStore();
  const surface = useAgentSurface();
  const invoice = store.invoices.find(
    (candidate) => candidate.id === invoiceId,
  );
  const client =
    invoice !== undefined
      ? store.clients.find((candidate) => candidate.id === invoice.clientId)
      : undefined;

  const liveInvoice = (): Invoice => getInvoice(getStore(), invoiceId);
  const touch = () => surface?.bumpRevision();

  useAgentResource({
    id: "summary",
    name: "Invoice summary",
    description: "The current invoice: line items, totals, status, client",
    getValue: () => {
      const current = liveInvoice();
      return {
        invoiceId: current.id,
        number: current.number,
        client: getClient(getStore(), current.clientId).name,
        status: current.status,
        lineItems: current.lineItems,
        discountPercent: current.discountPercent,
        subtotal: invoiceSubtotal(current),
        total: invoiceTotal(current),
      };
    },
  });

  useAgentAction({
    id: "add-line-item",
    name: "Add line item",
    description: "Add a line item to the draft invoice",
    input: addLineItemInput,
    isAvailable: () => liveInvoice().status === "draft",
    execute: (input) => {
      let lineItemId = "";
      mutate((current) => {
        const result = addLineItem(current, { invoiceId, ...input });
        lineItemId = result.lineItemId;
        return result.store;
      });
      touch();
      return { lineItemId, lineTotal: input.quantity * input.unitPrice };
    },
  });

  useAgentAction({
    id: "apply-discount",
    name: "Apply discount",
    description:
      "Apply a percentage discount to the whole invoice. Discounts above 20% require the user's approval.",
    input: applyDiscountInput,
    confirmation: {
      type: "conditional",
      reason: "Discounts above 20% need explicit approval",
      evaluate: (input) => input.percent > 20,
    },
    isAvailable: () => liveInvoice().status === "draft",
    preview: (input) => ({
      summary: `Change discount from ${liveInvoice().discountPercent}% to ${input.percent}%`,
      changes: [
        {
          path: "discountPercent",
          from: liveInvoice().discountPercent,
          to: input.percent,
        },
      ],
    }),
    execute: (input) => {
      mutate((current) =>
        applyDiscount(current, { invoiceId, percent: input.percent }),
      );
      touch();
      return { discountPercent: input.percent };
    },
  });

  useAgentAction({
    id: "save-draft",
    name: "Save draft",
    description: "Save the current draft",
    input: emptyInput,
    confirmation: "never",
    isAvailable: () => liveInvoice().status === "draft",
    execute: () => {
      const savedAt = new Date().toISOString();
      mutate((current) => saveInvoiceDraft(current, invoiceId, savedAt));
      touch();
      return { savedAt };
    },
  });

  useAgentAction({
    id: "send",
    name: "Send invoice",
    description: "Send the completed invoice to the client",
    input: sendInput,
    sensitivity: "confidential",
    confirmation: "always",
    recommend: {
      when: () => {
        const current = liveInvoice();
        return current.status === "draft" && current.lineItems.length > 0;
      },
      reason: "The draft has line items and is ready to send",
      instruction: () => `Send invoice ${liveInvoice().number} to the client`,
    },
    preconditions: [
      {
        id: "invoice-is-sendable",
        description: "The invoice must be a draft with at least one line item",
        check: () => {
          const current = liveInvoice();
          return current.status === "draft" && current.lineItems.length > 0;
        },
      },
    ],
    preview: () => {
      const current = liveInvoice();
      const owner = getClient(getStore(), current.clientId);
      return {
        summary: `Send ${current.number} (£${invoiceTotal(current).toLocaleString()}) to ${owner.email}`,
        changes: [{ path: "status", from: "draft", to: "sent" }],
      };
    },
    execute: () => {
      mutate((current) => sendInvoice(current, invoiceId));
      touch();
      return { sent: true, sentAt: new Date().toISOString() };
    },
  });

  useAgentAction({
    id: "write-off",
    name: "Write off invoice",
    description:
      "Write the invoice off entirely, removing it from the client's account",
    input: emptyInput,
    sensitivity: "restricted",
    // Restricted, so the playground policy denies execution outright —
    // but the definition still declares its own gates honestly: even
    // under a permissive policy this would preview and confirm.
    confirmation: "always",
    preview: () => ({
      summary: `Write off ${liveInvoice().number} (£${invoiceTotal(liveInvoice()).toLocaleString()}) — removes it entirely`,
    }),
    execute: () => {
      mutate((current) => ({
        ...current,
        invoices: current.invoices.filter(
          (candidate) => candidate.id !== invoiceId,
        ),
      }));
      touch();
      return { writtenOff: true };
    },
  });

  if (invoice === undefined || client === undefined) {
    return <p className="text-sm text-neutral-500">Unknown invoice.</p>;
  }

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-800">
        <div>
          <p className="font-semibold">{invoice.number}</p>
          <p className="text-sm text-neutral-500">
            <Link
              href={`/portal/clients/${client.id}`}
              className="hover:underline"
            >
              {client.name}
            </Link>{" "}
            · {client.email}
          </p>
        </div>
        <span
          data-testid="invoice-status"
          className={`rounded px-2 py-0.5 text-sm font-medium ${
            invoice.status === "draft"
              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
              : "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
          }`}
        >
          {invoice.status}
        </span>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {invoice.lineItems.map((item) => (
            <tr
              key={item.id}
              className="border-b border-neutral-100 dark:border-neutral-900"
            >
              <td className="p-3">{item.description}</td>
              <td className="p-3 tabular-nums">{item.quantity}</td>
              <td className="p-3 tabular-nums">
                £{item.unitPrice.toLocaleString()}
              </td>
              <td className="p-3 text-right tabular-nums">
                £{(item.quantity * item.unitPrice).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="space-y-1 border-t border-neutral-200 p-4 text-sm dark:border-neutral-800">
        <p className="flex justify-between">
          <span>Subtotal</span>
          <span className="tabular-nums">
            £{invoiceSubtotal(invoice).toLocaleString()}
          </span>
        </p>
        <p className="flex justify-between">
          <span>Discount</span>
          <span className="tabular-nums" data-testid="invoice-discount">
            {invoice.discountPercent}%
          </span>
        </p>
        <p className="flex justify-between font-semibold">
          <span>Total</span>
          <span className="tabular-nums" data-testid="invoice-total">
            £{invoiceTotal(invoice).toLocaleString()}
          </span>
        </p>
      </div>
      <div className="border-t border-neutral-200 p-4 dark:border-neutral-800">
        <button
          type="button"
          data-testid="add-consulting-line"
          className="rounded border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700"
          disabled={invoice.status !== "draft"}
          onClick={() => {
            mutate((current) =>
              addLineItem(current, {
                invoiceId,
                description: "Consulting (day)",
                quantity: 1,
                unitPrice: 1200,
              }).store,
            );
            touch();
          }}
        >
          Add consulting day
        </button>
      </div>
    </div>
  );
}

export function InvoiceEditor({
  invoiceId,
}: {
  readonly invoiceId: string;
}): React.JSX.Element {
  const { store } = usePortalStore();
  const invoice = store.invoices.find(
    (candidate) => candidate.id === invoiceId,
  );
  return (
    <AgentSurface
      face={invoiceFace}
      entity={{
        type: "invoice",
        id: invoiceId,
        ...(invoice !== undefined ? { displayName: invoice.number } : {}),
      }}
    >
      <InvoiceEditorFeature invoiceId={invoiceId} />
    </AgentSurface>
  );
}
