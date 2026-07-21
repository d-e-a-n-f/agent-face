"use client";

import { defineAgentFace } from "@agentface/core";
import { fromZod } from "@agentface/core/zod";
import {
  AgentSurface,
  useAgentAction,
  useAgentResource,
  useAgentSurface,
} from "@agentface/react";
import { useState } from "react";
import { z } from "zod";

interface LineItem {
  readonly id: string;
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

interface Invoice {
  readonly number: string;
  readonly customerEmail: string;
  readonly status: "draft" | "sent";
  readonly lineItems: readonly LineItem[];
  readonly discountPercent: number;
  readonly savedAt: string | null;
}

const INITIAL_INVOICE: Invoice = {
  number: "INV-9821",
  customerEmail: "billing@northshore.example",
  status: "draft",
  lineItems: [
    {
      id: "line_1",
      description: "Platform subscription (annual)",
      quantity: 1,
      unitPrice: 4800,
    },
  ],
  discountPercent: 0,
  savedAt: null,
};

function subtotalOf(invoice: Invoice): number {
  return invoice.lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
}

function totalOf(invoice: Invoice): number {
  const subtotal = subtotalOf(invoice);
  return Math.round(subtotal * (1 - invoice.discountPercent / 100) * 100) / 100;
}

function validationIssues(invoice: Invoice): readonly string[] {
  const issues: string[] = [];
  if (invoice.lineItems.length === 0) {
    issues.push("The invoice must have at least one line item.");
  }
  if (invoice.status !== "draft") {
    issues.push("The invoice has already been sent.");
  }
  return issues;
}

const invoiceFace = defineAgentFace({
  id: "billing.invoice",
  name: "Invoice",
  description: "View, edit and send a customer invoice",
  version: "0.1.0",
  tags: ["example", "billing"],
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

function InvoiceFeature(): React.JSX.Element {
  const [invoice, setInvoice] = useState<Invoice>(INITIAL_INVOICE);
  const [nextLineId, setNextLineId] = useState(2);
  const surface = useAgentSurface();

  const mutate = (change: (current: Invoice) => Invoice): void => {
    setInvoice(change);
    // Every mutation bumps the surface revision so previously prepared
    // actions become stale (STALE_STATE) instead of executing against
    // state the user never saw.
    surface?.bumpRevision();
  };

  useAgentResource({
    id: "summary",
    name: "Invoice summary",
    description: "The current invoice totals and status",
    getValue: () => ({
      invoiceNumber: invoice.number,
      customerEmail: invoice.customerEmail,
      status: invoice.status,
      lineItems: invoice.lineItems,
      discountPercent: invoice.discountPercent,
      subtotal: subtotalOf(invoice),
      total: totalOf(invoice),
    }),
  });

  useAgentResource({
    id: "validation",
    name: "Invoice validation",
    description: "Problems that would prevent sending the invoice",
    getValue: () => ({
      valid: validationIssues(invoice).length === 0,
      issues: validationIssues(invoice),
    }),
  });

  useAgentAction({
    id: "add-line-item",
    name: "Add line item",
    description: "Add a line item to the draft invoice",
    input: addLineItemInput,
    preconditions: [
      {
        id: "invoice-is-draft",
        description: "The invoice must still be a draft",
        check: () => invoice.status === "draft",
      },
    ],
    execute: (input) => {
      const id = `line_${nextLineId}`;
      setNextLineId((current) => current + 1);
      mutate((current) => ({
        ...current,
        lineItems: [...current.lineItems, { id, ...input }],
        savedAt: null,
      }));
      return { lineItemId: id, lineTotal: input.quantity * input.unitPrice };
    },
  });

  useAgentAction({
    id: "apply-discount",
    name: "Apply discount",
    description: "Apply a percentage discount to the whole invoice",
    input: applyDiscountInput,
    confirmation: {
      type: "conditional",
      reason: "Discounts above 20% need explicit approval",
      evaluate: (input) => input.percent > 20,
    },
    preconditions: [
      {
        id: "invoice-is-draft",
        description: "The invoice must still be a draft",
        check: () => invoice.status === "draft",
      },
    ],
    preview: (input) => ({
      summary: `Change discount from ${invoice.discountPercent}% to ${input.percent}%`,
      changes: [
        {
          path: "discountPercent",
          from: invoice.discountPercent,
          to: input.percent,
        },
      ],
    }),
    execute: (input) => {
      mutate((current) => ({
        ...current,
        discountPercent: input.percent,
        savedAt: null,
      }));
      return { discountPercent: input.percent };
    },
  });

  useAgentAction({
    id: "save-draft",
    name: "Save draft",
    description: "Save the current draft",
    input: emptyInput,
    confirmation: "never",
    execute: () => {
      const savedAt = new Date().toISOString();
      mutate((current) => ({ ...current, savedAt }));
      return { savedAt };
    },
  });

  useAgentAction({
    id: "send",
    name: "Send invoice",
    description: "Send the completed invoice to the customer",
    input: sendInput,
    sensitivity: "confidential",
    confirmation: "always",
    recommend: {
      when: () =>
        invoice.status === "draft" && validationIssues(invoice).length === 0,
      reason: "The draft is valid and ready to send",
      instruction: "Send the invoice to the customer",
    },
    preconditions: [
      {
        id: "invoice-is-valid-draft",
        description: "The invoice must be a valid draft",
        check: () => validationIssues(invoice).length === 0,
      },
    ],
    preview: (input) => ({
      summary: `Send ${invoice.number} (£${totalOf(invoice).toLocaleString()}) to ${invoice.customerEmail}${input.message !== undefined ? ` with message: ${input.message}` : ""}`,
      changes: [{ path: "status", from: "draft", to: "sent" }],
    }),
    execute: () => {
      mutate((current) => ({ ...current, status: "sent" }));
      return { sent: true, sentAt: new Date().toISOString() };
    },
  });

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-800">
        <div>
          <p className="font-semibold">{invoice.number}</p>
          <p className="text-sm text-neutral-500">{invoice.customerEmail}</p>
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
            £{subtotalOf(invoice).toLocaleString()}
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
            £{totalOf(invoice).toLocaleString()}
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
            const id = `line_${nextLineId}`;
            setNextLineId((current) => current + 1);
            mutate((current) => ({
              ...current,
              lineItems: [
                ...current.lineItems,
                {
                  id,
                  description: "Consulting (day)",
                  quantity: 1,
                  unitPrice: 1200,
                },
              ],
              savedAt: null,
            }));
          }}
        >
          Add consulting day
        </button>
      </div>
    </div>
  );
}

/**
 * Route 3 — the first complete vertical slice: typed inputs, preconditions,
 * previews, always-confirm send, revision bumps on every mutation, and
 * stale-state rejection of outdated preparations.
 */
export function InvoiceExample(): React.JSX.Element {
  return (
    <AgentSurface
      face={invoiceFace}
      entity={{
        type: "invoice",
        id: "inv_9821",
        displayName: "Invoice INV-9821",
      }}
    >
      <InvoiceFeature />
    </AgentSurface>
  );
}
