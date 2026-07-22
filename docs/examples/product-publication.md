# Product publication — the reference scenario

`/portal/products` implements MISSION §18's route 5: the
long-term product vision exercised end to end, showing what AgentFace does
that DOM automation and generic backend tools cannot.

## The instruction

> Create a Sterling institutional share class under Global Credit Fund II.
> Inherit the existing product configuration, change the minimum subscription
> to £5 million, apply the institutional fee schedule, attach the latest
> supplement, run compliance validation, send it to Sarah for approval, and
> publish it to the Apollo and Wilshire workspaces once approved.

Given to the assistant — from **any screen** — this runs as: navigate to the
publication screen (via the shipped `AgentFaceNavigation` surface) → create
the class (inheriting the product's minimum subscription and fee schedule) →
override the minimum to £5,000,000 → apply the institutional fee schedule →
attach the June 2026 supplement → run compliance validation → request Sarah's
approval → **pause on a confirmation card** ("Approve Sterling Institutional
as Sarah") → publish to Apollo and Wilshire → **pause on a second
confirmation card** naming exactly those targets → report the outcome:
Apollo published, **Wilshire failed** (it is degraded on purpose), with the
per-workspace error surfaced and the Apollo publication left standing.

## What it demonstrates

- **Nested surfaces**: `product.catalog` hosts `share-class.manager`,
  `compliance.validation`, `approval.workflow`, and `publication.manager` as
  child surfaces sharing one domain.
- **Inheritance with overrides**: a share class copies the product's
  configuration; overrides are tracked per field.
- **Cross-surface sign-off rules**: approval cannot be requested before
  validation passes; publication requires both; *any* mutation resets
  validation and approval, so stale sign-offs cannot be spent.
- **Confirmation-gated sensitive actions**: approve and publish are
  `confidential` + always-confirm; the user sees the exact preview
  (who/what/where) before anything executes.
- **Explicit partial failure**: publication returns a per-workspace result;
  failures are reported, successes stand, nothing pretends to roll back —
  and no `@agentface/workflow` machinery was needed.
- **Journeys and cross-page context**: the navigation surface exposes where
  the user is and has been; the assistant can move between screens and use
  what it read on one screen to act on another (see the customer-table →
  invoice demo in `e2e/portal-products.spec.ts`).

## Where the truth lives

- Domain rules: `apps/web/src/lib/product-publication-domain.ts` (pure,
  tested in `product-publication-domain.test.ts` — 9 tests).
- Surfaces/UI: `apps/web/src/features/product-publication.tsx`.
- Browser proof: `apps/web/e2e/portal-products.spec.ts` (reference
  scenario incl. navigation and both confirmation gates; declined approval
  stops the chain; cross-page context fill).

## Honest gaps vs the full MISSION §18 route 5

- Fee schedules and documents are resources on the catalog surface, not
  standalone `fee-schedule.manager` / `document.library` surfaces.
- `tenant.directory` is a resource (`workspaces`) on the publication surface.
- Single product; no `product.inheritance` surface for product-to-product
  derivation.
- Approval is a single approver decision, not a chain; rejection reasons are
  recorded but there is no re-request flow.
- All state is browser-local and per-visit, by design (ADR 0001).

These are deliberate: MISSION marks route 5 as the target reference
architecture, not a first-milestone deliverable. The demo covers every
*behavioral* claim (nesting, inheritance, cross-surface rules, confirmation,
partial failure) with the smallest honest domain.
