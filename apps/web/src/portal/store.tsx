"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useRef, useState } from "react";

/**
 * The Portal's shared domain: one in-memory store spanning every portal
 * page. It lives in the portal layout, so client-side navigation keeps it —
 * which is exactly what lets the assistant work across pages (read a client
 * here, invoice them there).
 */

export interface Client {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly status: "prospect" | "active" | "churned";
  readonly annualValue: number;
  readonly renewalQuarter: string;
}

export interface InvoiceLineItem {
  readonly id: string;
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

export interface Invoice {
  readonly id: string;
  readonly clientId: string;
  readonly number: string;
  readonly status: "draft" | "sent";
  readonly lineItems: readonly InvoiceLineItem[];
  readonly discountPercent: number;
  readonly savedAt: string | null;
}

export interface OnboardingValues {
  readonly company: {
    readonly name: string;
    readonly registrationNumber: string;
    readonly country: string;
  };
  readonly address: {
    readonly street: string;
    readonly city: string;
    readonly postcode: string;
  };
  readonly contact: { readonly name: string; readonly email: string };
}

export interface OnboardingRecord {
  readonly values: OnboardingValues;
  readonly savedAt: string | null;
  readonly submittedAt: string | null;
}

export interface PortalStore {
  readonly clients: readonly Client[];
  readonly invoices: readonly Invoice[];
  readonly onboarding: Readonly<Record<string, OnboardingRecord>>;
  readonly nextInvoiceNumber: number;
  readonly nextLineNumber: number;
}

export function seedPortalStore(): PortalStore {
  return {
    clients: [
      {
        id: "northshore",
        name: "Northshore Limited",
        email: "ops@northshore.example",
        status: "prospect",
        annualValue: 82_000,
        renewalQuarter: "2026-Q3",
      },
      {
        id: "apollo",
        name: "Apollo Partners",
        email: "finance@apollo.example",
        status: "active",
        annualValue: 45_000,
        renewalQuarter: "2026-Q4",
      },
      {
        id: "wilshire",
        name: "Wilshire Group",
        email: "billing@wilshire.example",
        status: "active",
        annualValue: 120_000,
        renewalQuarter: "2026-Q3",
      },
      {
        id: "meridian",
        name: "Meridian Foods",
        email: "accounts@meridian.example",
        status: "churned",
        annualValue: 18_000,
        renewalQuarter: "2026-Q1",
      },
      {
        id: "harbourline",
        name: "Harbourline Ltd",
        email: "pay@harbourline.example",
        status: "active",
        annualValue: 56_000,
        renewalQuarter: "2027-Q1",
      },
    ],
    invoices: [
      {
        id: "inv-1001",
        clientId: "wilshire",
        number: "INV-1001",
        status: "draft",
        lineItems: [
          {
            id: "line-1",
            description: "Platform subscription (annual)",
            quantity: 1,
            unitPrice: 4800,
          },
        ],
        discountPercent: 0,
        savedAt: null,
      },
    ],
    onboarding: {},
    nextInvoiceNumber: 1002,
    nextLineNumber: 2,
  };
}

export function getClient(store: PortalStore, clientId: string): Client {
  const client = store.clients.find((candidate) => candidate.id === clientId);
  if (client === undefined) {
    throw new Error(`No client "${clientId}"`);
  }
  return client;
}

export function getInvoice(store: PortalStore, invoiceId: string): Invoice {
  const invoice = store.invoices.find(
    (candidate) => candidate.id === invoiceId,
  );
  if (invoice === undefined) {
    throw new Error(`No invoice "${invoiceId}"`);
  }
  return invoice;
}

export function invoicesForClient(
  store: PortalStore,
  clientId: string,
): readonly Invoice[] {
  return store.invoices.filter((invoice) => invoice.clientId === clientId);
}

export function invoiceSubtotal(invoice: Invoice): number {
  return invoice.lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
}

export function invoiceTotal(invoice: Invoice): number {
  return (
    Math.round(
      invoiceSubtotal(invoice) * (1 - invoice.discountPercent / 100) * 100,
    ) / 100
  );
}

function replaceInvoice(store: PortalStore, next: Invoice): PortalStore {
  return {
    ...store,
    invoices: store.invoices.map((candidate) =>
      candidate.id === next.id ? next : candidate,
    ),
  };
}

/** Creates an empty draft invoice for a client. */
export function createInvoice(
  store: PortalStore,
  clientId: string,
): { readonly store: PortalStore; readonly invoice: Invoice } {
  getClient(store, clientId);
  const invoice: Invoice = {
    id: `inv-${store.nextInvoiceNumber}`,
    clientId,
    number: `INV-${store.nextInvoiceNumber}`,
    status: "draft",
    lineItems: [],
    discountPercent: 0,
    savedAt: null,
  };
  return {
    store: {
      ...store,
      invoices: [...store.invoices, invoice],
      nextInvoiceNumber: store.nextInvoiceNumber + 1,
    },
    invoice,
  };
}

export function addLineItem(
  store: PortalStore,
  input: {
    readonly invoiceId: string;
    readonly description: string;
    readonly quantity: number;
    readonly unitPrice: number;
  },
): { readonly store: PortalStore; readonly lineItemId: string } {
  const invoice = getInvoice(store, input.invoiceId);
  if (invoice.status !== "draft") {
    throw new Error("The invoice has already been sent");
  }
  const lineItemId = `line-${store.nextLineNumber}`;
  return {
    store: {
      ...replaceInvoice(store, {
        ...invoice,
        lineItems: [
          ...invoice.lineItems,
          {
            id: lineItemId,
            description: input.description,
            quantity: input.quantity,
            unitPrice: input.unitPrice,
          },
        ],
        savedAt: null,
      }),
      nextLineNumber: store.nextLineNumber + 1,
    },
    lineItemId,
  };
}

export function applyDiscount(
  store: PortalStore,
  input: { readonly invoiceId: string; readonly percent: number },
): PortalStore {
  const invoice = getInvoice(store, input.invoiceId);
  if (invoice.status !== "draft") {
    throw new Error("The invoice has already been sent");
  }
  return replaceInvoice(store, {
    ...invoice,
    discountPercent: input.percent,
    savedAt: null,
  });
}

export function saveInvoiceDraft(
  store: PortalStore,
  invoiceId: string,
  savedAt: string,
): PortalStore {
  const invoice = getInvoice(store, invoiceId);
  return replaceInvoice(store, { ...invoice, savedAt });
}

export function sendInvoice(
  store: PortalStore,
  invoiceId: string,
): PortalStore {
  const invoice = getInvoice(store, invoiceId);
  if (invoice.status !== "draft") {
    throw new Error("The invoice has already been sent");
  }
  if (invoice.lineItems.length === 0) {
    throw new Error("The invoice must have at least one line item");
  }
  return replaceInvoice(store, { ...invoice, status: "sent" });
}

export function saveOnboarding(
  store: PortalStore,
  clientId: string,
  values: OnboardingValues,
  savedAt: string,
): PortalStore {
  getClient(store, clientId);
  const existing = store.onboarding[clientId];
  return {
    ...store,
    onboarding: {
      ...store.onboarding,
      [clientId]: {
        values,
        savedAt,
        submittedAt: existing?.submittedAt ?? null,
      },
    },
  };
}

/** Submitting onboarding activates the client. */
export function submitOnboarding(
  store: PortalStore,
  clientId: string,
  values: OnboardingValues,
  submittedAt: string,
): PortalStore {
  getClient(store, clientId);
  return {
    ...store,
    clients: store.clients.map((client) =>
      client.id === clientId ? { ...client, status: "active" } : client,
    ),
    onboarding: {
      ...store.onboarding,
      [clientId]: {
        values,
        savedAt: store.onboarding[clientId]?.savedAt ?? null,
        submittedAt,
      },
    },
  };
}

export interface PortalStoreApi {
  /** Render-time snapshot. */
  readonly store: PortalStore;
  /** Live state for agent closures — always current, never a stale render. */
  getStore(): PortalStore;
  /** Applies a pure change; domain errors throw synchronously to the caller. */
  mutate(change: (store: PortalStore) => PortalStore): void;
}

const PortalStoreContext = createContext<PortalStoreApi | null>(null);

export function PortalStoreProvider({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  const [store, setStore] = useState<PortalStore>(seedPortalStore);
  const storeRef = useRef(store);
  const api: PortalStoreApi = {
    store,
    getStore: () => storeRef.current,
    mutate: (change) => {
      const next = change(storeRef.current);
      storeRef.current = next;
      setStore(next);
    },
  };
  return (
    <PortalStoreContext.Provider value={api}>
      {children}
    </PortalStoreContext.Provider>
  );
}

export function usePortalStore(): PortalStoreApi {
  const api = useContext(PortalStoreContext);
  if (api === null) {
    throw new Error("usePortalStore must be used within <PortalStoreProvider>");
  }
  return api;
}
