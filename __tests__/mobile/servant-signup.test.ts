import { describe, expect, it } from "vitest";
import {
  emptyServantSignupDraft,
  isDuplicateApplicationError,
  isServantSignupDraftDirty,
  validateServantSignup,
} from "../../apps/mobile/src/data/servant-signup";

describe("validateServantSignup", () => {
  it("accepts a well-formed application (happy path)", () => {
    expect(validateServantSignup({ fullName: "Marina Fahmy", email: "marina@example.com", phone: "2015550170", currentGrade: "3rd grade" })).toBeNull();
  });

  it("requires every field, including phone (unlike parent sign-up) (highest-risk path)", () => {
    const base = emptyServantSignupDraft();
    expect(validateServantSignup({ ...base, email: "a@b.com", phone: "x", currentGrade: "x" })).toMatch(/name/i);
    expect(validateServantSignup({ ...base, fullName: "Marina", email: "not-an-email", phone: "x", currentGrade: "x" })).toMatch(/email/i);
    expect(validateServantSignup({ ...base, fullName: "Marina", email: "a@b.com", phone: "", currentGrade: "x" })).toMatch(/phone/i);
    expect(validateServantSignup({ ...base, fullName: "Marina", email: "a@b.com", phone: "x", currentGrade: "" })).toMatch(/grade/i);
  });
});

describe("isServantSignupDraftDirty", () => {
  it("is dirty once any field changes, trimmed (happy path + highest-risk path)", () => {
    const blank = emptyServantSignupDraft();
    expect(isServantSignupDraftDirty({ ...blank, currentGrade: "3rd" }, blank)).toBe(true);
    expect(isServantSignupDraftDirty({ ...blank, fullName: "  " }, blank)).toBe(false);
  });
});

describe("isDuplicateApplicationError", () => {
  it("recognizes both of the real route's duplicate messages", () => {
    expect(isDuplicateApplicationError("An application with this email is already pending or approved")).toBe(true);
    expect(isDuplicateApplicationError("A user with this email already exists")).toBe(true);
    expect(isDuplicateApplicationError("Missing required fields")).toBe(false);
  });
});
