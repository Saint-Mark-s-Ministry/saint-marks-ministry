import { describe, expect, it } from "vitest";
import {
  emptyParentSignupDraft,
  isDuplicateAccountError,
  isParentSignupDraftDirty,
  validateParentSignup,
} from "../../apps/mobile/src/data/parent-signup";

describe("validateParentSignup", () => {
  it("accepts a well-formed signup (happy path)", () => {
    const draft = { fullName: "Mina Fouad", email: "mina@example.com", phone: "", password: "password123", confirmPassword: "password123" };
    expect(validateParentSignup(draft)).toBeNull();
  });

  it("mirrors the server's own checks exactly: name, email format, password length, confirmation mismatch (highest-risk path)", () => {
    const base = emptyParentSignupDraft();
    expect(validateParentSignup({ ...base, email: "x", password: "password123", confirmPassword: "password123" })).toMatch(/name/i);
    expect(validateParentSignup({ ...base, fullName: "Mina", email: "not-an-email", password: "password123", confirmPassword: "password123" })).toMatch(/email/i);
    expect(validateParentSignup({ ...base, fullName: "Mina", email: "a@b.com", password: "short1", confirmPassword: "short1" })).toMatch(/8 characters/);
    expect(validateParentSignup({ ...base, fullName: "Mina", email: "a@b.com", password: "password123", confirmPassword: "different1" })).toMatch(/do not match/i);
  });
});

describe("isParentSignupDraftDirty", () => {
  it("is dirty once any field changes (happy path)", () => {
    const blank = emptyParentSignupDraft();
    expect(isParentSignupDraftDirty({ ...blank, fullName: "Mina" }, blank)).toBe(true);
  });

  it("ignores surrounding whitespace in text fields, but not password fields (highest-risk path)", () => {
    const blank = emptyParentSignupDraft();
    expect(isParentSignupDraftDirty({ ...blank, fullName: "  " }, blank)).toBe(false);
    expect(isParentSignupDraftDirty({ ...blank, password: " " }, blank)).toBe(true);
  });
});

describe("isDuplicateAccountError", () => {
  it("recognizes the real route's exact duplicate message, and only that message", () => {
    expect(isDuplicateAccountError("An account with this email already exists")).toBe(true);
    expect(isDuplicateAccountError("Invalid email format")).toBe(false);
  });
});
