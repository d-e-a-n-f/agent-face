import { describe, expect, it } from "vitest";
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
} from "./product-publication-domain";

/** Runs the happy path up to (not including) publication. */
function approvedShareClass() {
  let state = seedPublicationDomain();
  const created = createShareClass(state, {
    name: "Sterling Institutional",
    currency: "GBP",
  });
  state = created.state;
  const id = created.shareClass.id;
  state = setMinimumSubscription(state, {
    shareClassId: id,
    minimumSubscription: 5_000_000,
  });
  state = applyFeeSchedule(state, {
    shareClassId: id,
    feeScheduleId: "fee-institutional",
  });
  state = attachDocument(state, {
    shareClassId: id,
    documentId: "doc-supplement-2026-06",
  });
  state = runValidation(state, { shareClassId: id }).state;
  state = requestApproval(state, { shareClassId: id, approver: "Sarah" });
  state = decideApproval(state, { shareClassId: id, decision: "approved" });
  return { state, id };
}

describe("share class inheritance", () => {
  it("inherits the product configuration and records overrides", () => {
    const state = seedPublicationDomain();
    const { state: next, shareClass } = createShareClass(state, {
      name: "Sterling Institutional",
      currency: "gbp",
    });
    expect(shareClass.currency).toBe("GBP");
    expect(shareClass.minimumSubscription).toBe(
      state.product.minimumSubscription,
    );
    expect(shareClass.feeScheduleId).toBe(state.product.feeScheduleId);
    expect(shareClass.overriddenFields).toEqual([]);

    const overridden = setMinimumSubscription(next, {
      shareClassId: shareClass.id,
      minimumSubscription: 5_000_000,
    });
    const updated = overridden.shareClasses[0];
    expect(updated?.minimumSubscription).toBe(5_000_000);
    expect(updated?.overriddenFields).toContain("minimumSubscription");
  });
});

describe("compliance validation", () => {
  it("fails without a supplement and passes once attached", () => {
    let state = seedPublicationDomain();
    const created = createShareClass(state, { name: "X", currency: "GBP" });
    state = created.state;
    const id = created.shareClass.id;

    const failed = runValidation(state, { shareClassId: id });
    expect(failed.validation.status).toBe("failed");
    expect(failed.validation.issues.join(" ")).toContain("supplement");

    state = attachDocument(failed.state, {
      shareClassId: id,
      documentId: "doc-supplement-2026-06",
    });
    const passed = runValidation(state, { shareClassId: id });
    expect(passed.validation).toEqual({ status: "passed", issues: [] });
  });

  it("rejects impermissible currencies and out-of-band minimums", () => {
    let state = seedPublicationDomain();
    const created = createShareClass(state, { name: "X", currency: "CHF" });
    state = attachDocument(created.state, {
      shareClassId: created.shareClass.id,
      documentId: "doc-supplement-2026-06",
    });
    state = setMinimumSubscription(state, {
      shareClassId: created.shareClass.id,
      minimumSubscription: 90_000_000,
    });
    const { validation } = runValidation(state, {
      shareClassId: created.shareClass.id,
    });
    expect(validation.status).toBe("failed");
    expect(validation.issues).toHaveLength(2);
  });
});

describe("cross-surface sign-off rules", () => {
  it("approval cannot be requested before validation passes", () => {
    let state = seedPublicationDomain();
    const created = createShareClass(state, { name: "X", currency: "GBP" });
    state = created.state;
    expect(() =>
      requestApproval(state, {
        shareClassId: created.shareClass.id,
        approver: "Sarah",
      }),
    ).toThrowError(/validation must pass/);
  });

  it("mutating a share class invalidates validation and approval", () => {
    const { state, id } = approvedShareClass();
    expect(isPublishable(state.shareClasses[0]!)).toBe(true);

    const mutated = setMinimumSubscription(state, {
      shareClassId: id,
      minimumSubscription: 10_000_000,
    });
    const shareClass = mutated.shareClasses[0]!;
    expect(shareClass.validation.status).toBe("not-run");
    expect(shareClass.approval.status).toBe("draft");
    expect(isPublishable(shareClass)).toBe(false);
    expect(() =>
      publishShareClass(mutated, {
        shareClassId: id,
        workspaceIds: ["apollo"],
      }),
    ).toThrowError(/pass validation and be approved/);
  });

  it("publication requires both validation and approval", () => {
    let state = seedPublicationDomain();
    const created = createShareClass(state, { name: "X", currency: "GBP" });
    state = attachDocument(created.state, {
      shareClassId: created.shareClass.id,
      documentId: "doc-supplement-2026-06",
    });
    state = runValidation(state, {
      shareClassId: created.shareClass.id,
    }).state;
    expect(() =>
      publishShareClass(state, {
        shareClassId: created.shareClass.id,
        workspaceIds: ["apollo"],
      }),
    ).toThrowError(/approved/);
  });
});

describe("partial-failure publication", () => {
  it("publishes per workspace with explicit failures and no rollback", () => {
    const { state, id } = approvedShareClass();
    const { state: next, results } = publishShareClass(state, {
      shareClassId: id,
      workspaceIds: ["apollo", "wilshire"],
    });
    expect(results).toEqual([
      { workspaceId: "apollo", status: "published" },
      {
        workspaceId: "wilshire",
        status: "failed",
        error: expect.stringContaining("Wilshire rejected the publication"),
      },
    ]);
    // The Apollo publication stands even though Wilshire failed.
    expect(next.shareClasses[0]?.publications).toHaveLength(2);
  });

  it("unknown workspaces fail individually, not the whole operation", () => {
    const { state, id } = approvedShareClass();
    const { results } = publishShareClass(state, {
      shareClassId: id,
      workspaceIds: ["apollo", "atlantis"],
    });
    expect(results[0]?.status).toBe("published");
    expect(results[1]).toMatchObject({
      status: "failed",
      error: expect.stringContaining("Unknown workspace"),
    });
  });

  it("re-publication to the same workspace replaces its previous result", () => {
    const { state, id } = approvedShareClass();
    const first = publishShareClass(state, {
      shareClassId: id,
      workspaceIds: ["apollo", "wilshire"],
    });
    const second = publishShareClass(first.state, {
      shareClassId: id,
      workspaceIds: ["wilshire"],
    });
    expect(second.state.shareClasses[0]?.publications).toHaveLength(2);
  });
});
