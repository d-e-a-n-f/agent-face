# MVP checklist (MISSION §21) — evidence

Verified 2026-07-22. Every claim cites a test, spec, or file.

## Developer experience

A React developer can, within one hour:

| # | Claim | Evidence |
| --- | --- | --- |
| 1 | Install the packages | pnpm workspace today (`README.md`); publish prep below |
| 2 | Add the provider | One component: `<AgentFaceApp>` (`packages/next/src/app.tsx`); playground's whole setup is `apps/web/src/components/playground-provider.tsx` |
| 3 | Wrap a feature in `AgentSurface` | Inline form, no ceremony: `apps/web/src/features/counter.tsx` (~40 lines total incl. UI) |
| 4 | Register one resource | ibid.; name optional, value form one-liner |
| 5 | Register one action | ibid.; zero-input actions need no schema |
| 6 | Inspect it in DevTools | e2e `invoice-lifecycle.spec.ts` drives discover→read→prepare→confirm→execute through the panel |
| 7 | Operate it through the assistant | e2e `portal-invoice.spec.ts`, `portal-onboarding.spec.ts` |

Time estimate honestly stated: steps 2–5 are ~15 lines of AgentFace code; a
form is one `useAgentForm` call. A timed cold-start run by a developer who
hasn't seen the repo remains to be done post-publish — flagged, not claimed.

## Runtime safety

| Property | Evidence (all deterministic, no model) |
| --- | --- |
| Typed input validation | `create-runtime.test.ts` "invalid input throws INVALID_INPUT"; `zod.test.ts` |
| Read policies | "a deny policy blocks resource reads with POLICY_DENIED" |
| Execute policies | "a deny policy blocks preparation…"; e2e `portal-denied.spec.ts` (restricted → POLICY_DENIED, visible) |
| Preconditions | "a failing precondition identifies itself"; publication domain tests |
| Confirmation | "full lifecycle…" (execute-before-confirm refused); widget lock tests |
| State revisions | "revision drift between prepare and execute throws STALE_STATE"; e2e staleness spec |
| Structured errors | `errors.test.ts`; assistant test "policy denials reach the model as structured errors" |
| Structured traces | trace-sequence assertion in the full-lifecycle runtime test |

## Product demonstration (the Portal)

| Demonstration | Where |
| --- | --- |
| Read-only explanation | Help Q&A grounded in app docs — e2e `portal-help.spec.ts` |
| Navigation / filtering | Clients list `apply-filter`; agent `navigate` with `:param` routes |
| Drafting a proposed change | Onboarding draft saved, NOT submitted — e2e `portal-onboarding.spec.ts` |
| Confirmed execution | Invoice send; approval + publication gates — `portal-invoice/products.spec.ts` |
| Denied execution | `decommission-product` (restricted) → POLICY_DENIED — e2e `portal-denied.spec.ts` |
| Stale-state rejection | Edit invoice after preparing send — `invoice-lifecycle.spec.ts` |
| Nested surfaces | `product.catalog` hosts 4 child surfaces (`product-publication.tsx`) |
| Multi-action operation | 7-step share-class chain; cross-page invoice flow |

## Documentation

Docs site (`apps/docs`, Docusaurus, GitHub Pages workflow
`.github/workflows/docs.yml`): quick start, core concepts, guides (actions,
resources, policy & confirmation, forms, assistant, recommendations,
knowledge & navigation, testing), Portal walkthrough, architecture, roadmap.
Repo: README, ADRs 0001–0009, this checklist, `docs/COMPLETION.md`.

## Known gaps (tracked, not hidden)

- Timed one-hour cold-start run pending (needs a fresh developer + published packages).
- Packages unpublished; `pnpm pack` output verified for core/react (see COMPLETION.md).
- Approval-by-another-person is roadmap; today the current user confirms as the approver.
