import { describe, expect, it } from "vitest";
import {
  canAdvanceFromStep,
  emptyRegistrationDraft,
  gradeLabel,
  isDuplicateRegistrationError,
  isRegistrationDraftDirty,
  validateProfileImage,
  validateRegistrationDraft,
} from "../../apps/mobile/src/data/registration-wizard";

const today = "2026-10-10";

function completeDraft() {
  return {
    ...emptyRegistrationDraft("FALL26-7QX"),
    fullName: "Mina Fouad",
    email: "mina@example.com",
    phone: "2015550170",
    dateOfBirth: "2008-05-01",
    grade: "GRADE_11" as const,
    previouslyServed: false,
    currentlyServing: false,
    previouslyAttendedPrep: false,
    profileImageUrl: "https://blob/x.jpg",
    profileImageFilename: "x.jpg",
  };
}

describe("canAdvanceFromStep", () => {
  it("advances past each step once its own fields are real and complete (happy path)", () => {
    const draft = completeDraft();
    expect(canAdvanceFromStep("code", draft, today)).toBe(true);
    expect(canAdvanceFromStep("personal", draft, today)).toBe(true);
    expect(canAdvanceFromStep("history", draft, today)).toBe(true);
    expect(canAdvanceFromStep("photo", draft, today)).toBe(true);
  });

  it("never advances past 'personal' with a future birth date, and never past 'history' with an unanswered or inconsistent toggle (highest-risk path)", () => {
    const futureDob = { ...completeDraft(), dateOfBirth: "2027-01-01" };
    expect(canAdvanceFromStep("personal", futureDob, today)).toBe(false);

    const unanswered = { ...completeDraft(), currentlyServing: null };
    expect(canAdvanceFromStep("history", unanswered, today)).toBe(false);

    const missingLocation = { ...completeDraft(), previouslyServed: true, previousServiceLocation: "" };
    expect(canAdvanceFromStep("history", missingLocation, today)).toBe(false);
  });
});

describe("validateRegistrationDraft", () => {
  it("passes a fully complete draft (happy path)", () => {
    expect(validateRegistrationDraft(completeDraft(), today)).toBeNull();
  });

  it("catches a missing invite code and a missing profile photo — the two fields with no earlier step gate (highest-risk path)", () => {
    expect(validateRegistrationDraft({ ...completeDraft(), inviteCode: "" }, today)).toMatch(/invite code/i);
    expect(validateRegistrationDraft({ ...completeDraft(), profileImageUrl: "" }, today)).toMatch(/profile picture/i);
  });
});

describe("isRegistrationDraftDirty", () => {
  it("is dirty once any field changes from blank (happy path)", () => {
    const blank = emptyRegistrationDraft();
    expect(isRegistrationDraftDirty({ ...blank, fullName: "Mina" }, blank)).toBe(true);
  });

  it("is never dirty for an unchanged draft reconstructed from scratch (highest-risk path)", () => {
    const blank = emptyRegistrationDraft("CODE1");
    expect(isRegistrationDraftDirty({ ...blank }, blank)).toBe(false);
  });
});

describe("validateProfileImage", () => {
  it("accepts an allowed type under the size limit (happy path)", () => {
    expect(validateProfileImage({ mimeType: "image/jpeg", size: 1_000_000 })).toBeNull();
  });

  it("rejects a disallowed type and an oversized file — the real upload route's own limits (highest-risk path)", () => {
    expect(validateProfileImage({ mimeType: "application/pdf", size: 1000 })).toMatch(/PNG|JPEG|GIF/);
    expect(validateProfileImage({ mimeType: "image/jpeg", size: 10 * 1024 * 1024 })).toMatch(/smaller/);
  });
});

describe("gradeLabel / isDuplicateRegistrationError", () => {
  it("labels a known grade and recognizes every real duplicate message", () => {
    expect(gradeLabel("COLLEGE_FRESHMAN")).toBe("College Freshman");
    expect(isDuplicateRegistrationError("A registration with this email is already pending review")).toBe(true);
    expect(isDuplicateRegistrationError("A registration with this email has already been approved")).toBe(true);
    expect(isDuplicateRegistrationError("An account with this email already exists. Please sign in; registration is only for new applicants.")).toBe(true);
    expect(isDuplicateRegistrationError("Missing required fields")).toBe(false);
  });
});
