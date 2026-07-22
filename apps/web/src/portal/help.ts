import type { AgentHelpArticle } from "@agentface/react";

/** The Portal's help content — what the assistant grounds its answers in. */
export const PORTAL_HELP: readonly AgentHelpArticle[] = [
  {
    id: "onboarding-clients",
    title: "Onboarding a client",
    body: "Prospect clients must complete onboarding before they can be invoiced at scale. Open the client's page and choose Onboarding. Every section — company (with the 8-digit registration number), registered address, and primary contact — must pass validation. Submitting onboarding activates the client. You can save a draft at any point; drafts do not change the client's status. The assistant can fill the form for you from details you provide; you stay in charge of submission.",
    tags: ["onboarding", "clients", "activate"],
  },
  {
    id: "invoice-discounts",
    title: "Invoice discounts",
    body: "Discounts apply to the whole invoice as a percentage. Discounts of 20% or below apply immediately. Discounts ABOVE 20% require explicit approval — the assistant will show a confirmation card before applying one. Discounts can only be changed while the invoice is a draft.",
    tags: ["invoices", "discounts", "approval"],
  },
  {
    id: "sending-invoices",
    title: "Sending invoices",
    body: "An invoice can be sent once it is a draft with at least one line item. Sending always requires explicit confirmation, and shows a preview of the amount and recipient first. Once sent, an invoice can no longer be edited. If the invoice changes after a send was prepared, the preparation goes stale and must be redone — this protects you from sending something you didn't review.",
    tags: ["invoices", "send", "confirmation"],
  },
  {
    id: "what-can-the-assistant-do",
    title: "What the assistant can do",
    body: "The assistant sees the capabilities of the screen you are on (and can move between screens). It can read state, fill forms, and run business actions — but anything consequential (sending invoices, large discounts) pauses on a confirmation card that you must approve. It also suggests recommended next steps as buttons, which update as your data changes.",
    tags: ["assistant", "help", "confirmation"],
  },
];
