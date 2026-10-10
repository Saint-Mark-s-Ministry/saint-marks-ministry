import { describe, expect, it } from "vitest";
import {
  applyFeedbackView,
  emptyComposerDraft,
  filterByCategory,
  isComposerDraftDirty,
  isResolved,
  matchesSearch,
  responsePreview,
  sortFeedbackIdeas,
  statusLabel,
  submittedLabel,
  typeLabel,
  validateFeedbackResponseDraft,
} from "../../apps/mobile/src/data/sunday-school-feedback";

const base = {
  type: "IDEA" as const,
  description: null,
  teamResponse: null,
  createdAt: "2026-09-20T00:00:00.000Z",
  upvotes: 0,
  downvotes: 0,
};

describe("sortFeedbackIdeas", () => {
  it("ranks OPEN before PLANNED/IN_PROGRESS before DECLINED before COMPLETED, ties by votes (happy path)", () => {
    const ideas = [
      { ...base, id: "completed", status: "COMPLETED" as const, title: "c", upvotes: 100 },
      { ...base, id: "open-low", status: "OPEN" as const, title: "a", upvotes: 1 },
      { ...base, id: "open-high", status: "OPEN" as const, title: "b", upvotes: 5 },
      { ...base, id: "declined", status: "DECLINED" as const, title: "d", upvotes: 50 },
    ];
    const sorted = sortFeedbackIdeas(ideas, "TOP");
    expect(sorted.map((i) => i.id)).toEqual(["open-high", "open-low", "declined", "completed"]);
  });

  it("never lets a high-vote resolved item outrank an open one, even sorted NEWEST (highest-risk path)", () => {
    const ideas = [
      { ...base, id: "completed", status: "COMPLETED" as const, title: "c", upvotes: 999, createdAt: "2026-09-25T00:00:00.000Z" },
      { ...base, id: "open", status: "OPEN" as const, title: "a", upvotes: 0, createdAt: "2026-09-01T00:00:00.000Z" },
    ];
    expect(sortFeedbackIdeas(ideas, "NEWEST").map((i) => i.id)).toEqual(["open", "completed"]);
  });
});

describe("applyFeedbackView", () => {
  const ideas = [
    { ...base, id: "mine", status: "OPEN" as const, title: "mine", submitter: { id: "me", name: "Me", profileImageUrl: null } },
    { ...base, id: "theirs", status: "OPEN" as const, title: "theirs", submitter: { id: "them", name: "Them", profileImageUrl: null } },
  ];

  it("'mine' scopes to the viewer's own submissions (happy path)", () => {
    expect(applyFeedbackView(ideas, "mine", "me").map((i) => i.id)).toEqual(["mine"]);
  });

  it("'mine' with no signed-in id (or no match) returns nothing, never everything (highest-risk path)", () => {
    expect(applyFeedbackView(ideas, "mine", undefined)).toEqual([]);
    expect(applyFeedbackView(ideas, "mine", "nobody")).toEqual([]);
  });
});

describe("filterByCategory / matchesSearch", () => {
  it("filters by type, and matches title or description case-insensitively (happy path)", () => {
    const ideas = [
      { type: "IDEA" as const, title: "Print roster", description: null },
      { type: "PROBLEM" as const, title: "Save button broken", description: "hidden on SMALL phones" },
    ];
    expect(filterByCategory(ideas, "PROBLEM")).toHaveLength(1);
    expect(matchesSearch(ideas[1], "small phones")).toBe(true);
  });

  it("'ALL' never drops anything, and an empty query matches everything (highest-risk path)", () => {
    const ideas = [{ type: "IDEA" as const, title: "x", description: null }];
    expect(filterByCategory(ideas, "ALL")).toHaveLength(1);
    expect(matchesSearch(ideas[0], "")).toBe(true);
    expect(matchesSearch(ideas[0], "nope")).toBe(false);
  });
});

describe("typeLabel / statusLabel / isResolved", () => {
  it("reads naturally (happy path)", () => {
    expect(typeLabel("PROBLEM")).toBe("Problem");
    expect(statusLabel("IN_PROGRESS")).toBe("In progress");
    expect(isResolved("COMPLETED")).toBe(true);
    expect(isResolved("DECLINED")).toBe(true);
  });

  it("OPEN/PLANNED are never treated as resolved (highest-risk path)", () => {
    expect(isResolved("OPEN")).toBe(false);
    expect(isResolved("PLANNED")).toBe(false);
  });
});

describe("submittedLabel", () => {
  it("names the real submitter (happy path)", () => {
    expect(submittedLabel({ submitter: { id: "1", name: "Mina", profileImageUrl: null }, createdAt: "2026-09-26T00:00:00.000Z" })).toBe(
      "Mina · Sep 26",
    );
  });

  it("falls back for a deleted account rather than showing blank/null (highest-risk path)", () => {
    expect(submittedLabel({ submitter: null, createdAt: "2026-09-26T00:00:00.000Z" })).toBe("Former member · Sep 26");
  });
});

describe("responsePreview", () => {
  it("returns the response text as-is when short (happy path)", () => {
    expect(responsePreview({ teamResponse: "Thanks, shipping this next release." })).toBe("Thanks, shipping this next release.");
  });

  it("truncates a long response and never returns a preview with no response (highest-risk path)", () => {
    const long = "a".repeat(100);
    expect(responsePreview({ teamResponse: long })?.endsWith("…")).toBe(true);
    expect(responsePreview({ teamResponse: null })).toBeNull();
  });
});

describe("validateFeedbackResponseDraft", () => {
  it("accepts a trimmed, in-range response (happy path)", () => {
    expect(validateFeedbackResponseDraft("  Good catch, fixing it.  ")).toBe("Good catch, fixing it.");
  });

  it("rejects empty/whitespace-only and over-length text, mirroring the server's own rule exactly (highest-risk path)", () => {
    expect(validateFeedbackResponseDraft("   ")).toBeNull();
    expect(validateFeedbackResponseDraft("a".repeat(2001))).toBeNull();
    expect(validateFeedbackResponseDraft("a".repeat(2000))).not.toBeNull();
  });
});

describe("isComposerDraftDirty", () => {
  it("is dirty once any field changes from the original (happy path)", () => {
    const original = emptyComposerDraft();
    expect(isComposerDraftDirty({ ...original, title: "New" }, original)).toBe(true);
  });

  it("is never dirty for an unchanged draft, even after being reconstructed (highest-risk path)", () => {
    const original = { type: "PROBLEM" as const, title: "x", description: "y" };
    expect(isComposerDraftDirty({ ...original }, original)).toBe(false);
  });
});
