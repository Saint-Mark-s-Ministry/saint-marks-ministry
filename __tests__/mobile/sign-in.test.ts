import { describe, expect, it } from "vitest";
import { canSubmitSignIn, looksLikeEmail, signInFailureKind } from "../../apps/mobile/src/data/sign-in";

describe("looksLikeEmail", () => {
  it("accepts a plausible email (happy path)", () => {
    expect(looksLikeEmail("servant@church.com")).toBe(true);
    expect(looksLikeEmail("  servant@church.com  ")).toBe(true);
  });

  it("rejects obviously malformed input, including empty (highest-risk path)", () => {
    expect(looksLikeEmail("")).toBe(false);
    expect(looksLikeEmail("not-an-email")).toBe(false);
    expect(looksLikeEmail("missing@domain")).toBe(false);
    expect(looksLikeEmail("@missing-local.com")).toBe(false);
  });
});

describe("canSubmitSignIn", () => {
  it("is submittable with a plausible email, a password, and a connected server (happy path)", () => {
    expect(canSubmitSignIn("servant@church.com", "password123", true)).toBe(true);
  });

  it("refuses when offline, or with a malformed email, or an empty password (highest-risk path)", () => {
    expect(canSubmitSignIn("servant@church.com", "password123", false)).toBe(false);
    expect(canSubmitSignIn("not-an-email", "password123", true)).toBe(false);
    expect(canSubmitSignIn("servant@church.com", "", true)).toBe(false);
  });
});

describe("signInFailureKind", () => {
  it("reads a reached-the-server rejection as 'rejected', never disclosing a reason (happy path)", () => {
    expect(signInFailureKind(new Error("Sign-in failed. Check your email and password, or try again later."))).toBe("rejected");
  });

  it("reads the real offline message, and only that exact message, as 'offline' (highest-risk path)", () => {
    expect(signInFailureKind(new Error("Could not reach the server. Check your connection and try again."))).toBe("offline");
    expect(signInFailureKind(new Error("Could not reach the server — try again"))).toBe("rejected");
    expect(signInFailureKind("not even an Error")).toBe("rejected");
  });
});
