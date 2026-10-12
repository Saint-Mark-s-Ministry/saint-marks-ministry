import { describe, expect, it } from "vitest";
import {
  applicationHeading,
  applicationProgress,
  canViewOwnApplication,
  describeLoadFailure,
  fieldWithDraft,
  firstFieldProblem,
  saveErrorMessage,
  saveSuccessMessage,
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

describe("async students without a registration (parity with the corrected web page)", () => {
  // What GET /api/registration/application returns for an active async student:
  // no approved registration, but the annual mentor confirmation is required.
  const asyncState = {
    showChurchInformation: false,
    showApprovalForm: false,
    annualMentorRequired: true,
    academicYear: { id: "y1", name: "2026-2027" },
    missingDetails: ["mentorInformation"],
    complete: false,
  };

  it("shows only the mentor section, with progress out of one (happy path)", () => {
    expect(visibleSections(asyncState)).toEqual(["mentor"]);
    expect(applicationProgress(asyncState)).toEqual({ done: 0, total: 1 });
    expect(applicationProgress({ ...asyncState, missingDetails: [] })).toEqual({ done: 1, total: 1 });
  });

  it("does not require a father of confession when no church section is shown", () => {
    const problem = firstFieldProblem(asyncState, "", { mentorName: "A", mentorPhone: "1", mentorEmail: "a@b.co" });
    expect(problem).toBeNull();
  });

  it("keeps the in-person flow: church and approval form sections, father of confession required", () => {
    const inPerson = { ...asyncState, showChurchInformation: true, showApprovalForm: true, annualMentorRequired: false, missingDetails: ["fatherOfConfession", "approvalForm", "mentorInformation"] };
    expect(visibleSections(inPerson)).toEqual(["mentor", "church", "approvalForm"]);
    expect(applicationProgress(inPerson)).toEqual({ done: 0, total: 3 });
    expect(firstFieldProblem(inPerson, "", { mentorName: "A", mentorPhone: "1", mentorEmail: "a@b.co" })?.field).toBe(
      "fatherOfConfessionName",
    );
  });
});

describe("applicationHeading", () => {
  it("asks async students to confirm their mentor for the academic year, like the web page", () => {
    expect(applicationHeading({ annualMentorRequired: true, academicYear: { id: "y", name: "2026-2027" } })).toEqual({
      title: "Confirm your mentor",
      subtitle: "Confirm your mentor servant's contact information for 2026-2027",
    });
  });

  it("falls back to a generic year and to the Application heading for the in-person flow", () => {
    expect(applicationHeading({ annualMentorRequired: true, academicYear: null }).subtitle).toContain("the current academic year");
    expect(applicationHeading({ annualMentorRequired: false, academicYear: null }).title).toBe("Application");
    expect(applicationHeading(null).title).toBe("Application");
  });
});

describe("describeLoadFailure", () => {
  it("never claims a missing or unapproved registration as the reason (highest-risk path)", () => {
    const notFound = describeLoadFailure("Application information not found");
    expect(notFound.title).toBe("Application unavailable");
    expect(notFound.body).not.toMatch(/approved registration/i);
    expect(notFound.body).toMatch(/enrollment|academic year/i);
  });

  it("tells an offline student to reconnect, and shows other server text as is", () => {
    expect(describeLoadFailure("Could not reach the server. Check your connection and try again.").title).toBe("You're offline");
    expect(describeLoadFailure("Database unavailable").body).toBe("Database unavailable");
  });

  it("has a readable fallback when there is no message at all", () => {
    expect(describeLoadFailure(undefined).body).toBe("Application information is unavailable for this account.");
    expect(describeLoadFailure("   ").body).toBe("Application information is unavailable for this account.");
  });
});

describe("save feedback", () => {
  it("words the confirmation the way the web page does", () => {
    expect(saveSuccessMessage({ annualMentorRequired: true, complete: true })).toBe("Mentor information confirmed");
    expect(saveSuccessMessage({ annualMentorRequired: false, complete: true })).toBe("Application completed");
    expect(saveSuccessMessage({ annualMentorRequired: false, complete: false })).toBe("Application details saved");
  });

  it("explains a View As rejection instead of showing the raw code, and passes other errors through", () => {
    expect(saveErrorMessage("ViewAsReadOnly")).toContain("read-only");
    expect(saveErrorMessage("All mentor fields are required")).toBe("All mentor fields are required");
    expect(saveErrorMessage(undefined)).toBe("Unable to save application. Please try again.");
  });
});
