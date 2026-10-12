import { describe, expect, it } from "vitest";
import {
  completenessLabel,
  duplicateCaption,
  genderLabel,
  guardianLine,
  isReviewable,
  levelAndBirthLine,
  reviewValidationError,
  statusLabel,
  statusTone,
  submittedLabel,
} from "../../apps/mobile/src/data/sunday-school-child-registrations";

describe("statusTone/statusLabel", () => {
  it("maps every status to its tone and a readable label (happy path)", () => {
    expect(statusTone("PENDING")).toBe("warning");
    expect(statusTone("APPROVED")).toBe("success");
    expect(statusTone("REJECTED")).toBe("danger");
    expect(statusTone("CHANGES_REQUESTED")).toBe("info");
    expect(statusLabel("CHANGES_REQUESTED")).toBe("Changes requested");
  });

  it("title-cases a plain status rather than shouting it (highest-risk path)", () => {
    expect(statusLabel("PENDING")).toBe("Pending");
  });
});

describe("genderLabel", () => {
  it("reads naturally for a known gender (happy path)", () => {
    expect(genderLabel("MALE")).toBe("Boy");
    expect(genderLabel("FEMALE")).toBe("Girl");
  });

  it("never claims a gender that wasn't given (highest-risk path)", () => {
    expect(genderLabel(null)).toBe("Gender not specified");
  });
});

describe("completenessLabel", () => {
  it("reports complete once gender and a guardian email are both present (happy path)", () => {
    expect(completenessLabel({ gender: "MALE", hasGuardianEmail: true })).toBe("All details provided");
  });

  it("names exactly what's missing rather than a vague score, including both at once (highest-risk path)", () => {
    expect(completenessLabel({ gender: null, hasGuardianEmail: false })).toBe("Missing guardian gender & email");
    expect(completenessLabel({ gender: "FEMALE", hasGuardianEmail: false })).toBe("Missing guardian email");
    // Falls back to a raw guardianEmail string (the detail view's shape) when hasGuardianEmail isn't present.
    expect(completenessLabel({ gender: "FEMALE", guardianEmail: "a@b.com" })).toBe("All details provided");
  });
});

describe("duplicateCaption", () => {
  it("names each kind of match in plain language (happy path)", () => {
    expect(
      duplicateCaption({
        matchCount: 2,
        matches: [
          { type: "existing_child", id: "c1", firstName: "A", lastName: "B", className: "Elementary A" },
          { type: "pending_request", id: "r2", firstName: "A", lastName: "B", className: null },
        ],
      })
    ).toBe("Possible duplicate — matches 1 existing child and 1 other request");
  });

  it("is silent when there's no signal at all, never a false positive (highest-risk path)", () => {
    expect(duplicateCaption(undefined)).toBeNull();
    expect(duplicateCaption({ matchCount: 0, matches: [] })).toBeNull();
  });
});

describe("isReviewable", () => {
  it("is reviewable while pending or sent back for changes (happy path)", () => {
    expect(isReviewable("PENDING")).toBe(true);
    expect(isReviewable("CHANGES_REQUESTED")).toBe(true);
  });

  it("is never reviewable once a decision is final (highest-risk path)", () => {
    expect(isReviewable("APPROVED")).toBe(false);
    expect(isReviewable("REJECTED")).toBe(false);
  });
});

describe("levelAndBirthLine / submittedLabel / guardianLine", () => {
  it("compose the summary line's three pieces (happy path)", () => {
    expect(levelAndBirthLine("GRADE_3", "2018-05-02T00:00:00.000Z")).toContain("Born");
    expect(submittedLabel("2026-09-28T00:00:00.000Z")).toBe("Submitted Sep 28");
    expect(guardianLine({ guardianName: "Mina Youssef", guardianPhone: "•••• 0170" })).toBe(
      "Guardian Mina Youssef · •••• 0170"
    );
  });
});

describe("reviewValidationError", () => {
  it("passes a well-formed approve/request_changes (happy path)", () => {
    expect(reviewValidationError("approve", "class-1", "")).toBeNull();
    expect(reviewValidationError("request_changes", "", "Please attach a baptism certificate")).toBeNull();
  });

  it("blocks approving with no class and requesting changes with no note (highest-risk path)", () => {
    expect(reviewValidationError("approve", "", "")).toMatch(/class/i);
    expect(reviewValidationError("request_changes", "", "   ")).toMatch(/note/i);
    expect(reviewValidationError("reject", "", "")).toBeNull();
  });
});
