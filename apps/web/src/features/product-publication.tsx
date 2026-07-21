"use client";

import { defineAgentFace } from "@agentface/core";
import { fromZod } from "@agentface/core/zod";
import {
  AgentSurface,
  useAgentAction,
  useAgentResource,
  useAgentSurface,
} from "@agentface/react";
import { usePersistentDomain } from "@/lib/use-persistent-domain";
import { z } from "zod";
import type {
  PublicationDomainState,
  ShareClass,
} from "@/lib/product-publication-domain";
import {
  applyFeeSchedule,
  attachDocument,
  createShareClass,
  decideApproval,
  isPublishable,
  publishShareClass,
  requestApproval,
  runValidation,
  seedPublicationDomain,
  setMinimumSubscription,
} from "@/lib/product-publication-domain";

const catalogFace = defineAgentFace({
  id: "product.catalog",
  name: "Product catalog",
  description:
    "Global Credit Fund II: product configuration, fee schedules, and the document library",
  version: "0.1.0",
  tags: ["example", "products"],
});

const shareClassFace = defineAgentFace({
  id: "share-class.manager",
  name: "Share class manager",
  description:
    "Create share classes that inherit the product configuration, and override fields per class",
  version: "0.1.0",
});

const complianceFace = defineAgentFace({
  id: "compliance.validation",
  name: "Compliance validation",
  description: "Run compliance checks a share class must pass before approval",
  version: "0.1.0",
});

const approvalFace = defineAgentFace({
  id: "approval.workflow",
  name: "Approval workflow",
  description: "Request and record sign-off on a share class",
  version: "0.1.0",
});

const publicationFace = defineAgentFace({
  id: "publication.manager",
  name: "Publication manager",
  description:
    "Publish approved share classes to tenant workspaces; each target succeeds or fails independently",
  version: "0.1.0",
});

interface DomainProps {
  /** Render-time snapshot (for display only). */
  readonly domain: PublicationDomainState;
  /** Live state for agent closures — always current, never a stale render. */
  readonly getDomain: () => PublicationDomainState;
  readonly mutate: (
    change: (state: PublicationDomainState) => PublicationDomainState,
  ) => void;
}

const shareClassIdInput = z
  .string()
  .describe("The share class id, e.g. sc-1 (from create-share-class)");

function ShareClassManager({ getDomain, mutate }: DomainProps): null {
  const surface = useAgentSurface();
  const touch = () => surface?.bumpRevision();

  useAgentResource({
    id: "share-classes",
    name: "Share classes",
    description:
      "All share classes with their inherited/overridden fields, validation, approval, and publication state",
    getValue: () => getDomain().shareClasses,
  });

  useAgentAction({
    id: "create-share-class",
    name: "Create share class",
    description:
      "Create a share class under the product, inheriting its configuration (minimum subscription, fee schedule)",
    recommend: {
      when: () => getDomain().shareClasses.length === 0,
      reason: "No share classes exist yet",
      instruction:
        "Create a Sterling institutional share class under Global Credit Fund II with a £5,000,000 minimum subscription, institutional fees, and the latest supplement attached",
      priority: 10,
    },
    input: fromZod(
      z.object({
        name: z.string().min(1).describe('e.g. "Sterling Institutional"'),
        currency: z.string().length(3).describe("ISO currency, e.g. GBP"),
      }),
    ),
    execute: (input) => {
      let created: ShareClass | undefined;
      mutate((state) => {
        const result = createShareClass(state, input);
        created = result.shareClass;
        return result.state;
      });
      touch();
      return {
        shareClassId: created?.id ?? "",
        inherited: {
          minimumSubscription: created?.minimumSubscription ?? 0,
          feeScheduleId: created?.feeScheduleId ?? "",
        },
      };
    },
  });

  useAgentAction({
    id: "set-minimum-subscription",
    name: "Set minimum subscription",
    description:
      "Override the inherited minimum subscription for a share class. Resets validation and approval.",
    input: fromZod(
      z.object({
        shareClassId: shareClassIdInput,
        minimumSubscription: z.number().positive(),
      }),
    ),
    execute: (input) => {
      mutate((state) => setMinimumSubscription(state, input));
      touch();
      return { minimumSubscription: input.minimumSubscription };
    },
  });

  useAgentAction({
    id: "apply-fee-schedule",
    name: "Apply fee schedule",
    description:
      "Apply a fee schedule from the catalog to a share class. Resets validation and approval.",
    input: fromZod(
      z.object({
        shareClassId: shareClassIdInput,
        feeScheduleId: z
          .string()
          .describe("A fee schedule id from the catalog, e.g. fee-institutional"),
      }),
    ),
    execute: (input) => {
      mutate((state) => applyFeeSchedule(state, input));
      touch();
      return { feeScheduleId: input.feeScheduleId };
    },
  });

  useAgentAction({
    id: "attach-document",
    name: "Attach document",
    description:
      "Attach a document from the library to a share class (a current supplement is required for validation). Resets validation and approval.",
    input: fromZod(
      z.object({
        shareClassId: shareClassIdInput,
        documentId: z
          .string()
          .describe("A document id from the library, e.g. doc-supplement-2026-06"),
      }),
    ),
    execute: (input) => {
      mutate((state) => attachDocument(state, input));
      touch();
      return { documentId: input.documentId };
    },
  });

  return null;
}

function ComplianceValidation({ getDomain, mutate }: DomainProps): null {
  const surface = useAgentSurface();

  useAgentResource({
    id: "validation-status",
    name: "Validation status",
    description: "Per-share-class compliance validation outcomes",
    sensitivity: "internal",
    getValue: () =>
      getDomain().shareClasses.map((shareClass) => ({
        shareClassId: shareClass.id,
        ...shareClass.validation,
      })),
  });

  useAgentAction({
    id: "run-validation",
    name: "Run compliance validation",
    description:
      "Run the compliance checks for a share class. Must pass before approval can be requested.",
    input: fromZod(z.object({ shareClassId: shareClassIdInput })),
    sensitivity: "internal",
    recommend: {
      when: () =>
        getDomain().shareClasses.some(
          (shareClass) => shareClass.validation.status === "not-run",
        ),
      reason: "A share class has not been validated yet",
      instruction: () => {
        const target = getDomain().shareClasses.find(
          (shareClass) => shareClass.validation.status === "not-run",
        );
        return `Run compliance validation for ${target?.name ?? "the share class"}`;
      },
      priority: 9,
    },
    execute: (input) => {
      let outcome: unknown;
      mutate((state) => {
        const result = runValidation(state, input);
        outcome = result.validation;
        return result.state;
      });
      surface?.bumpRevision();
      return outcome;
    },
  });

  return null;
}

function ApprovalWorkflow({ getDomain, mutate }: DomainProps): null {
  const surface = useAgentSurface();
  const touch = () => surface?.bumpRevision();

  useAgentResource({
    id: "approvals",
    name: "Approvals",
    description: "Per-share-class approval state",
    getValue: () =>
      getDomain().shareClasses.map((shareClass) => ({
        shareClassId: shareClass.id,
        ...shareClass.approval,
      })),
  });

  useAgentAction({
    id: "request-approval",
    name: "Request approval",
    description:
      "Send a validated share class to a named approver. Validation must have passed.",
    input: fromZod(
      z.object({
        shareClassId: shareClassIdInput,
        approver: z.string().min(1).describe('e.g. "Sarah"'),
      }),
    ),
    recommend: {
      when: () =>
        getDomain().shareClasses.some(
          (shareClass) =>
            shareClass.validation.status === "passed" &&
            shareClass.approval.status === "draft",
        ),
      reason: "A validated share class is awaiting sign-off",
      instruction: () => {
        const target = getDomain().shareClasses.find(
          (shareClass) =>
            shareClass.validation.status === "passed" &&
            shareClass.approval.status === "draft",
        );
        return `Send ${target?.name ?? "the share class"} to Sarah for approval`;
      },
      priority: 8,
    },
    preconditions: [
      {
        id: "validation-passed",
        description:
          "At least one share class must have passed compliance validation",
        check: () =>
          getDomain().shareClasses.some(
            (shareClass) => shareClass.validation.status === "passed",
          ),
      },
    ],
    execute: (input) => {
      mutate((state) => requestApproval(state, input));
      touch();
      return { status: "pending", approver: input.approver };
    },
  });

  useAgentAction({
    id: "approve-share-class",
    name: "Approve share class",
    description:
      "Record the approver's sign-off on a pending share class. Requires the user's explicit confirmation.",
    input: fromZod(z.object({ shareClassId: shareClassIdInput })),
    sensitivity: "confidential",
    confirmation: "always",
    recommend: {
      when: () =>
        getDomain().shareClasses.some(
          (shareClass) => shareClass.approval.status === "pending",
        ),
      reason: "An approval request is pending",
      instruction: () => {
        const target = getDomain().shareClasses.find(
          (shareClass) => shareClass.approval.status === "pending",
        );
        return `Approve ${target?.name ?? "the share class"}`;
      },
      priority: 7,
    },
    preview: (input) => {
      const shareClass = getDomain().shareClasses.find(
        (candidate) => candidate.id === input.shareClassId,
      );
      const approver =
        shareClass?.approval.status === "pending"
          ? shareClass.approval.approver
          : "the approver";
      return {
        summary: `Approve ${shareClass?.name ?? input.shareClassId} as ${approver}`,
        changes: [
          { path: "approval.status", from: "pending", to: "approved" },
        ],
      };
    },
    execute: (input) => {
      mutate((state) =>
        decideApproval(state, {
          shareClassId: input.shareClassId,
          decision: "approved",
        }),
      );
      touch();
      return { status: "approved" };
    },
  });

  useAgentAction({
    id: "reject-share-class",
    name: "Reject share class",
    description: "Reject a pending share class with a reason.",
    input: fromZod(
      z.object({
        shareClassId: shareClassIdInput,
        reason: z.string().min(1),
      }),
    ),
    sensitivity: "confidential",
    confirmation: "always",
    execute: (input) => {
      mutate((state) =>
        decideApproval(state, {
          shareClassId: input.shareClassId,
          decision: "rejected",
          reason: input.reason,
        }),
      );
      touch();
      return { status: "rejected" };
    },
  });

  return null;
}

function PublicationManager({ getDomain, mutate }: DomainProps): null {
  const surface = useAgentSurface();

  useAgentResource({
    id: "workspaces",
    name: "Tenant workspaces",
    description: "The workspaces a share class can be published to",
    getValue: () => getDomain().workspaces,
  });

  useAgentResource({
    id: "publications",
    name: "Publications",
    description: "Per-share-class, per-workspace publication results",
    getValue: () =>
      getDomain().shareClasses.map((shareClass) => ({
        shareClassId: shareClass.id,
        publications: shareClass.publications,
      })),
  });

  useAgentAction({
    id: "publish-share-class",
    name: "Publish share class",
    description:
      "Publish an approved share class to one or more workspaces. Each target succeeds or fails independently — partial failure is reported, not rolled back. Requires the user's explicit confirmation.",
    input: fromZod(
      z.object({
        shareClassId: shareClassIdInput,
        workspaceIds: z
          .array(z.string())
          .min(1)
          .describe("Workspace ids from the tenant directory, e.g. apollo"),
      }),
    ),
    sensitivity: "confidential",
    confirmation: "always",
    recommend: {
      when: () =>
        getDomain().shareClasses.some(
          (shareClass) =>
            isPublishable(shareClass) && shareClass.publications.length === 0,
        ),
      reason: "An approved share class is ready to publish",
      instruction: () => {
        const target = getDomain().shareClasses.find(
          (shareClass) =>
            isPublishable(shareClass) && shareClass.publications.length === 0,
        );
        return `Publish ${target?.name ?? "the share class"} to the Apollo and Wilshire workspaces`;
      },
      priority: 6,
    },
    preconditions: [
      {
        id: "share-class-is-publishable",
        description:
          "At least one share class must have passed validation and been approved",
        check: () => getDomain().shareClasses.some(isPublishable),
      },
    ],
    preview: (input) => {
      const shareClass = getDomain().shareClasses.find(
        (candidate) => candidate.id === input.shareClassId,
      );
      const names = input.workspaceIds.map(
        (workspaceId) =>
          getDomain().workspaces.find((workspace) => workspace.id === workspaceId)
            ?.name ?? workspaceId,
      );
      return {
        summary: `Publish ${shareClass?.name ?? input.shareClassId} to ${names.join(" and ")}`,
        changes: input.workspaceIds.map((workspaceId) => ({
          path: `publications.${workspaceId}`,
          from: "unpublished",
          to: "published",
        })),
      };
    },
    execute: (input) => {
      let outcome: unknown;
      mutate((state) => {
        const result = publishShareClass(state, input);
        outcome = result.results;
        return result.state;
      });
      surface?.bumpRevision();
      return { results: outcome };
    },
  });

  return null;
}

function statusChip(text: string, tone: "ok" | "warn" | "bad" | "muted") {
  const tones = {
    ok: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    bad: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    muted:
      "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400",
  } as const;
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {text}
    </span>
  );
}

function ShareClassCard({
  shareClass,
  domain,
}: {
  readonly shareClass: ShareClass;
  readonly domain: PublicationDomainState;
}): React.JSX.Element {
  const fee = domain.feeSchedules.find(
    (schedule) => schedule.id === shareClass.feeScheduleId,
  );
  return (
    <div
      className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
      data-testid={`share-class-${shareClass.id}`}
    >
      <div className="flex items-center justify-between">
        <p className="font-semibold">
          {shareClass.name}{" "}
          <span className="text-xs text-neutral-500">({shareClass.id})</span>
        </p>
        <span className="text-sm text-neutral-500">{shareClass.currency}</span>
      </div>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        Min subscription{" "}
        <span data-testid={`${shareClass.id}-minimum`} className="tabular-nums">
          {shareClass.currency === "GBP" ? "£" : ""}
          {shareClass.minimumSubscription.toLocaleString()}
        </span>
        {shareClass.overriddenFields.includes("minimumSubscription")
          ? " (overridden)"
          : " (inherited)"}
        {" · "}
        {fee?.name ?? shareClass.feeScheduleId} fees
        {" · "}
        {shareClass.documentIds.length} doc(s)
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2" data-testid={`${shareClass.id}-status`}>
        {shareClass.validation.status === "passed"
          ? statusChip("validation passed", "ok")
          : shareClass.validation.status === "failed"
            ? statusChip("validation failed", "bad")
            : statusChip("not validated", "muted")}
        {shareClass.approval.status === "approved"
          ? statusChip("approved", "ok")
          : shareClass.approval.status === "pending"
            ? statusChip(`pending: ${shareClass.approval.approver}`, "warn")
            : shareClass.approval.status === "rejected"
              ? statusChip("rejected", "bad")
              : statusChip("draft", "muted")}
        {shareClass.publications.map((publication) => {
          const workspace = domain.workspaces.find(
            (candidate) => candidate.id === publication.workspaceId,
          );
          const name = workspace?.name ?? publication.workspaceId;
          return (
            <span key={publication.workspaceId}>
              {publication.status === "published"
                ? statusChip(`${name} ✓`, "ok")
                : statusChip(`${name} ✗`, "bad")}
            </span>
          );
        })}
        {isPublishable(shareClass) && shareClass.publications.length === 0
          ? statusChip("ready to publish", "warn")
          : null}
      </div>
      {shareClass.validation.status === "failed" ? (
        <ul className="mt-2 list-disc pl-5 text-xs text-red-700 dark:text-red-400">
          {shareClass.validation.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
      {shareClass.publications.some((p) => p.status === "failed") ? (
        <ul className="mt-2 list-disc pl-5 text-xs text-red-700 dark:text-red-400">
          {shareClass.publications
            .filter((p) => p.status === "failed")
            .map((p) => (
              <li key={p.workspaceId} data-testid={`${shareClass.id}-failure`}>
                {p.error}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}

function isPublicationDomain(value: unknown): value is PublicationDomainState {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as PublicationDomainState).shareClasses) &&
    Array.isArray((value as PublicationDomainState).workspaces) &&
    typeof (value as PublicationDomainState).product === "object"
  );
}

function ProductPublicationFeature(): React.JSX.Element {
  const persistent = usePersistentDomain(
    "agentface-products-v1",
    seedPublicationDomain,
    isPublicationDomain,
  );
  const domain = persistent.value;
  const getDomain = persistent.getValue;
  const rootSurface = useAgentSurface();

  const mutate = (
    change: (state: PublicationDomainState) => PublicationDomainState,
  ): void => {
    persistent.mutate(change);
    rootSurface?.bumpRevision();
  };

  useAgentResource({
    id: "product",
    name: "Product",
    description:
      "The product share classes inherit from: currency band, minimum subscription, default fee schedule",
    getValue: () => getDomain().product,
  });
  useAgentResource({
    id: "fee-schedules",
    name: "Fee schedules",
    description: "Fee schedules available to apply to share classes",
    getValue: () => getDomain().feeSchedules,
  });
  useAgentResource({
    id: "documents",
    name: "Document library",
    description:
      "Documents that can be attached to share classes (validation requires a supplement)",
    getValue: () => getDomain().documents,
  });

  return (
    <>
      <AgentSurface face={shareClassFace}>
        <ShareClassManager domain={domain} getDomain={getDomain} mutate={mutate} />
      </AgentSurface>
      <AgentSurface face={complianceFace}>
        <ComplianceValidation domain={domain} getDomain={getDomain} mutate={mutate} />
      </AgentSurface>
      <AgentSurface face={approvalFace}>
        <ApprovalWorkflow domain={domain} getDomain={getDomain} mutate={mutate} />
      </AgentSurface>
      <AgentSurface face={publicationFace}>
        <PublicationManager domain={domain} getDomain={getDomain} mutate={mutate} />
      </AgentSurface>

      <div className="space-y-4">
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="font-semibold">{domain.product.name}</p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Base {domain.product.baseCurrency} · permitted{" "}
            {domain.product.permittedCurrencies.join(", ")} · min subscription $
            {domain.product.minimumSubscription.toLocaleString()} ·{" "}
            {
              domain.feeSchedules.find(
                (schedule) => schedule.id === domain.product.feeScheduleId,
              )?.name
            }{" "}
            fees
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            Workspaces:{" "}
            {domain.workspaces.map((workspace) => (
              <span key={workspace.id} className="mr-2">
                {workspace.name}{" "}
                {workspace.health === "healthy" ? "●" : "○ degraded"}
              </span>
            ))}
          </p>
        </div>

        {domain.shareClasses.length === 0 ? (
          <p
            className="text-sm text-neutral-500"
            data-testid="no-share-classes"
          >
            No share classes yet — ask the assistant to create one.
          </p>
        ) : (
          domain.shareClasses.map((shareClass) => (
            <ShareClassCard
              key={shareClass.id}
              shareClass={shareClass}
              domain={domain}
            />
          ))
        )}
      </div>
    </>
  );
}

/**
 * Route 5 — the Phase-7 reference scenario: nested surfaces, inheritance,
 * cross-surface sign-off rules, confirmation-gated approval and publication,
 * and explicit partial failure across workspaces.
 */
export function ProductPublicationExample(): React.JSX.Element {
  return (
    <AgentSurface
      face={catalogFace}
      entity={{
        type: "product",
        id: "gcf2",
        displayName: "Global Credit Fund II",
      }}
    >
      <ProductPublicationFeature />
    </AgentSurface>
  );
}
