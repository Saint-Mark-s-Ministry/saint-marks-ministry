import { describe, expect, it } from "vitest";
import {
  applicationProgress,
  canViewOwnApplication,
  fieldWithDraft,
  firstFieldProblem,
  validateApprovalFile,
  validateFatherOfConfession,
  validateMentorFields,
  visibleSections,
  type ApplicationState,
} from "../../apps/mobile/src/data/prep-application";

const baseState: Pick<ApplicationState, "showChurchInformation" | "showApprovalForm" | "missingDetails"> = {
  showChurchInformation: true,
  showApprovalForm: true,
  missingDetails: [],
};

describe("canViewOwnApplication", () => {
  it("is for students only (happy path + highest-risk path)", () => {
    expect(canViewOwnApplication("STUDENT")).toBe(true);
    expect(canViewOwnApplication("MENTOR")).toBe(false);
    expect(canViewOwnApplication(null)).toBe(false);
  });
});

describe("visibleSections / applicationProgress", () => {
  it("counts all three sections when both church and approval-form are shown (happy path)", () => {
    expect(visibleSections(baseState)).toEqual(["mentor", "church", "approvalForm"]);
    expect(applicationProgress(baseState)).toEqual({ done: 3, total: 3 });
  });

  it("drops to the one real section for an annual-mentor-only reconfirmation (highest-risk path)", () => {
    const annualOnly = { showChurchInformation: false, showApprovalForm: false, missingDetails: [] };
    expect(visibleSections(annualOnly)).toEqual(["mentor"]);
    expect(applicationProgress(annualOnly)).toEqual({ done: 1, total: 1 });
  });

  it("maps each missingDetails key to exactly one section, never double-counting", () => {
    const partial = { ...baseState, missingDetails: ["fatherOfConfession", "mentorInformation"] };
    expect(applicationProgress(partial)).toEqual({ done: 1, total: 3 });
  });
});

describe("validateMentorFields", () => {
  const valid = { mentorName: "Abouna Peter", mentorPhone: "555-123-4567", mentorEmail: "mentor@church.com" };

  it("passes with all three fields valid (happy path)", () => {
    expect(validateMentorFields(valid)).toBeNull();
  });

  it("reports the first empty field in form order, not the last (highest-risk path)", () => {
    expect(validateMentorFields({ ...valid, mentorName: "  " })!.field).toBe("mentorName");
    expect(validateMentorFields({ ...valid, mentorPhone: "" })!.field).toBe("mentorPhone");
    expect(validateMentorFields({ ...valid, mentorEmail: "" })!.field).toBe("mentorEmail");
  });

  it("rejects a malformed email even when every field is non-empty", () => {
    const problem = validateMentorFields({ ...valid, mentorEmail: "not-an-email" });
    expect(problem).toEqual({ field: "mentorEmail", message: "Enter a valid email address." });
  });
});

describe("validateFatherOfConfession / firstFieldProblem", () => {
  const mentor = { mentorName: "Abouna Peter", mentorPhone: "555-123-4567", mentorEmail: "mentor@church.com" };

  it("is required only when the Church section is actually shown", () => {
    expect(validateFatherOfConfession("", true)?.field).toBe("fatherOfConfessionName");
    expect(validateFatherOfConfession("", false)).toBeNull();
  });

  it("checks Church before Mentor, matching the screen's top-to-bottom order", () => {
    const problem = firstFieldProblem({ showChurchInformation: true }, "", { ...mentor, mentorName: "" });
    expect(problem?.field).toBe("fatherOfConfessionName");
  });

  it("falls through to the first bad mentor field once Church is satisfied", () => {
    const problem = firstFieldProblem({ showChurchInformation: true }, "Fr. Markos", { ...mentor, mentorPhone: "" });
    expect(problem?.field).toBe("mentorPhone");
  });
});

describe("validateApprovalFile", () => {
  it("accepts an on-size PDF or image (happy path)", () => {
    expect(validateApprovalFile({ mimeType: "application/pdf", size: 1_000_000 })).toBeNull();
    expect(validateApprovalFile({ mimeType: "image/png", size: 500_000 })).toBeNull();
  });

  it("rejects an unsupported type and an oversized file (highest-risk path)", () => {
    expect(validateApprovalFile({ mimeType: "application/zip", size: 1000 })).toMatch(/PNG, JPG, GIF, or PDF/);
    expect(validateApprovalFile({ mimeType: "image/png", size: 5 * 1024 * 1024 })).toMatch(/4\.5 MB/);
  });

  it("treats an unknown size as acceptable rather than guessing it's too big", () => {
    expect(validateApprovalFile({ mimeType: "application/pdf", size: null })).toBeNull();
  });
});

describe("fieldWithDraft", () => {
  it("prefers an unsaved draft over the last-known server value (the whole point of a draft)", () => {
    expect(fieldWithDraft("Old name", "New name")).toBe("New name");
  });

  it("falls back to the server value, then to empty, when there's no draft", () => {
    expect(fieldWithDraft("Server name", null)).toBe("Server name");
    expect(fieldWithDraft(null, null)).toBe("");
  });
});
