/**
 * The product-publication domain: a deliberately rich, in-memory model for
 * the Phase-7 reference scenario (MISSION §18 route 5). Pure functions over
 * immutable state so the rules — inheritance, validation, approval,
 * partial-failure publication — are testable without React or the runtime.
 */

export interface FeeSchedule {
  readonly id: string;
  readonly name: string;
  readonly managementFeePercent: number;
  readonly performanceFeePercent: number;
}

export interface DocumentRecord {
  readonly id: string;
  readonly name: string;
  readonly kind: "prospectus" | "supplement" | "kiid";
  readonly publishedAt: string;
}

export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly health: "healthy" | "degraded";
  readonly note?: string;
}

export interface Product {
  readonly id: string;
  readonly name: string;
  readonly baseCurrency: string;
  readonly permittedCurrencies: readonly string[];
  readonly minimumSubscription: number;
  readonly feeScheduleId: string;
}

export interface ValidationState {
  readonly status: "not-run" | "passed" | "failed";
  readonly issues: readonly string[];
}

export type ApprovalState =
  | { readonly status: "draft" }
  | { readonly status: "pending"; readonly approver: string }
  | { readonly status: "approved"; readonly approver: string }
  | {
      readonly status: "rejected";
      readonly approver: string;
      readonly reason: string;
    };

export interface PublicationResult {
  readonly workspaceId: string;
  readonly status: "published" | "failed";
  readonly error?: string;
}

export interface ShareClass {
  readonly id: string;
  readonly productId: string;
  readonly name: string;
  readonly currency: string;
  readonly minimumSubscription: number;
  /** Product fields this class overrides (everything else is inherited). */
  readonly overriddenFields: readonly string[];
  readonly feeScheduleId: string;
  readonly documentIds: readonly string[];
  readonly validation: ValidationState;
  readonly approval: ApprovalState;
  readonly publications: readonly PublicationResult[];
}

export interface PublicationDomainState {
  readonly product: Product;
  readonly feeSchedules: readonly FeeSchedule[];
  readonly documents: readonly DocumentRecord[];
  readonly workspaces: readonly Workspace[];
  readonly shareClasses: readonly ShareClass[];
  readonly nextShareClassNumber: number;
}

export const MAXIMUM_MINIMUM_SUBSCRIPTION = 50_000_000;

/** The seeded demo world: Global Credit Fund II and its surroundings. */
export function seedPublicationDomain(): PublicationDomainState {
  return {
    product: {
      id: "gcf2",
      name: "Global Credit Fund II",
      baseCurrency: "USD",
      permittedCurrencies: ["USD", "EUR", "GBP"],
      minimumSubscription: 1_000_000,
      feeScheduleId: "fee-standard",
    },
    feeSchedules: [
      {
        id: "fee-standard",
        name: "Standard",
        managementFeePercent: 1.5,
        performanceFeePercent: 15,
      },
      {
        id: "fee-institutional",
        name: "Institutional",
        managementFeePercent: 0.75,
        performanceFeePercent: 10,
      },
    ],
    documents: [
      {
        id: "doc-prospectus-v3",
        name: "Prospectus v3",
        kind: "prospectus",
        publishedAt: "2026-01-15",
      },
      {
        id: "doc-supplement-2026-06",
        name: "Supplement (June 2026)",
        kind: "supplement",
        publishedAt: "2026-06-01",
      },
      {
        id: "doc-supplement-2025-11",
        name: "Supplement (November 2025)",
        kind: "supplement",
        publishedAt: "2025-11-01",
      },
    ],
    workspaces: [
      { id: "apollo", name: "Apollo", health: "healthy" },
      {
        id: "wilshire",
        name: "Wilshire",
        health: "degraded",
        note: "Catalog schema v1 — rejects new share-class publications",
      },
      { id: "meridian", name: "Meridian", health: "healthy" },
    ],
    shareClasses: [],
    nextShareClassNumber: 1,
  };
}

function mustGetShareClass(
  state: PublicationDomainState,
  shareClassId: string,
): ShareClass {
  const shareClass = state.shareClasses.find(
    (candidate) => candidate.id === shareClassId,
  );
  if (shareClass === undefined) {
    throw new Error(`No share class "${shareClassId}"`);
  }
  return shareClass;
}

function replaceShareClass(
  state: PublicationDomainState,
  next: ShareClass,
): PublicationDomainState {
  return {
    ...state,
    shareClasses: state.shareClasses.map((candidate) =>
      candidate.id === next.id ? next : candidate,
    ),
  };
}

/**
 * Any change to a share class invalidates downstream sign-off: validation
 * must be re-run and approval re-requested. This is the cross-surface
 * staleness rule the demo exists to show.
 */
function invalidate(shareClass: ShareClass): ShareClass {
  return {
    ...shareClass,
    validation: { status: "not-run", issues: [] },
    approval: { status: "draft" },
  };
}

/** Creates a share class inheriting the product's configuration. */
export function createShareClass(
  state: PublicationDomainState,
  input: { readonly name: string; readonly currency: string },
): { readonly state: PublicationDomainState; readonly shareClass: ShareClass } {
  const shareClass: ShareClass = {
    id: `sc-${state.nextShareClassNumber}`,
    productId: state.product.id,
    name: input.name,
    currency: input.currency.toUpperCase(),
    minimumSubscription: state.product.minimumSubscription,
    overriddenFields: [],
    feeScheduleId: state.product.feeScheduleId,
    documentIds: [],
    validation: { status: "not-run", issues: [] },
    approval: { status: "draft" },
    publications: [],
  };
  return {
    state: {
      ...state,
      shareClasses: [...state.shareClasses, shareClass],
      nextShareClassNumber: state.nextShareClassNumber + 1,
    },
    shareClass,
  };
}

/** Overrides the inherited minimum subscription. */
export function setMinimumSubscription(
  state: PublicationDomainState,
  input: { readonly shareClassId: string; readonly minimumSubscription: number },
): PublicationDomainState {
  const shareClass = mustGetShareClass(state, input.shareClassId);
  return replaceShareClass(
    state,
    invalidate({
      ...shareClass,
      minimumSubscription: input.minimumSubscription,
      overriddenFields: [
        ...new Set([...shareClass.overriddenFields, "minimumSubscription"]),
      ],
    }),
  );
}

/** Applies a fee schedule (overriding the inherited one). */
export function applyFeeSchedule(
  state: PublicationDomainState,
  input: { readonly shareClassId: string; readonly feeScheduleId: string },
): PublicationDomainState {
  const shareClass = mustGetShareClass(state, input.shareClassId);
  if (
    !state.feeSchedules.some(
      (schedule) => schedule.id === input.feeScheduleId,
    )
  ) {
    throw new Error(`No fee schedule "${input.feeScheduleId}"`);
  }
  return replaceShareClass(
    state,
    invalidate({
      ...shareClass,
      feeScheduleId: input.feeScheduleId,
      overriddenFields: [
        ...new Set([...shareClass.overriddenFields, "feeScheduleId"]),
      ],
    }),
  );
}

/** Attaches a document from the library. */
export function attachDocument(
  state: PublicationDomainState,
  input: { readonly shareClassId: string; readonly documentId: string },
): PublicationDomainState {
  const shareClass = mustGetShareClass(state, input.shareClassId);
  if (!state.documents.some((document) => document.id === input.documentId)) {
    throw new Error(`No document "${input.documentId}"`);
  }
  return replaceShareClass(
    state,
    invalidate({
      ...shareClass,
      documentIds: [...new Set([...shareClass.documentIds, input.documentId])],
    }),
  );
}

/** The compliance rules. Returns the validation outcome and records it. */
export function runValidation(
  state: PublicationDomainState,
  input: { readonly shareClassId: string },
): {
  readonly state: PublicationDomainState;
  readonly validation: ValidationState;
} {
  const shareClass = mustGetShareClass(state, input.shareClassId);
  const issues: string[] = [];

  if (!state.product.permittedCurrencies.includes(shareClass.currency)) {
    issues.push(
      `Currency ${shareClass.currency} is not permitted for ${state.product.name} (permitted: ${state.product.permittedCurrencies.join(", ")})`,
    );
  }
  if (shareClass.minimumSubscription <= 0) {
    issues.push("Minimum subscription must be positive");
  }
  if (shareClass.minimumSubscription > MAXIMUM_MINIMUM_SUBSCRIPTION) {
    issues.push(
      `Minimum subscription exceeds the ${MAXIMUM_MINIMUM_SUBSCRIPTION.toLocaleString()} ceiling`,
    );
  }
  const attached = state.documents.filter((document) =>
    shareClass.documentIds.includes(document.id),
  );
  if (!attached.some((document) => document.kind === "supplement")) {
    issues.push("A current supplement must be attached before validation");
  }

  const validation: ValidationState =
    issues.length === 0
      ? { status: "passed", issues: [] }
      : { status: "failed", issues };
  return {
    state: replaceShareClass(state, { ...shareClass, validation }),
    validation,
  };
}

/** Sends the share class for approval. Requires validation to have passed. */
export function requestApproval(
  state: PublicationDomainState,
  input: { readonly shareClassId: string; readonly approver: string },
): PublicationDomainState {
  const shareClass = mustGetShareClass(state, input.shareClassId);
  if (shareClass.validation.status !== "passed") {
    throw new Error(
      "Compliance validation must pass before requesting approval",
    );
  }
  return replaceShareClass(state, {
    ...shareClass,
    approval: { status: "pending", approver: input.approver },
  });
}

/** Records the approver's decision. Requires a pending request. */
export function decideApproval(
  state: PublicationDomainState,
  input: {
    readonly shareClassId: string;
    readonly decision: "approved" | "rejected";
    readonly reason?: string;
  },
): PublicationDomainState {
  const shareClass = mustGetShareClass(state, input.shareClassId);
  if (shareClass.approval.status !== "pending") {
    throw new Error("There is no pending approval request to decide");
  }
  const approver = shareClass.approval.approver;
  return replaceShareClass(state, {
    ...shareClass,
    approval:
      input.decision === "approved"
        ? { status: "approved", approver }
        : {
            status: "rejected",
            approver,
            reason: input.reason ?? "No reason given",
          },
  });
}

/** True when the share class may be published. */
export function isPublishable(shareClass: ShareClass): boolean {
  return (
    shareClass.validation.status === "passed" &&
    shareClass.approval.status === "approved"
  );
}

/**
 * Publishes to each target workspace independently. Partial failure is
 * explicit and final: each target gets its own result, nothing is rolled
 * back, and no transactionality is claimed.
 */
export function publishShareClass(
  state: PublicationDomainState,
  input: {
    readonly shareClassId: string;
    readonly workspaceIds: readonly string[];
  },
): {
  readonly state: PublicationDomainState;
  readonly results: readonly PublicationResult[];
} {
  const shareClass = mustGetShareClass(state, input.shareClassId);
  if (!isPublishable(shareClass)) {
    throw new Error(
      "The share class must pass validation and be approved before publication",
    );
  }
  if (input.workspaceIds.length === 0) {
    throw new Error("At least one target workspace is required");
  }
  const results: PublicationResult[] = input.workspaceIds.map((workspaceId) => {
    const workspace = state.workspaces.find(
      (candidate) => candidate.id === workspaceId,
    );
    if (workspace === undefined) {
      return {
        workspaceId,
        status: "failed",
        error: `Unknown workspace "${workspaceId}"`,
      };
    }
    if (workspace.health === "degraded") {
      return {
        workspaceId,
        status: "failed",
        error: `${workspace.name} rejected the publication: ${workspace.note ?? "workspace degraded"}`,
      };
    }
    return { workspaceId, status: "published" };
  });

  const merged = [
    ...shareClass.publications.filter(
      (existing) => !input.workspaceIds.includes(existing.workspaceId),
    ),
    ...results,
  ];
  return {
    state: replaceShareClass(state, { ...shareClass, publications: merged }),
    results,
  };
}
