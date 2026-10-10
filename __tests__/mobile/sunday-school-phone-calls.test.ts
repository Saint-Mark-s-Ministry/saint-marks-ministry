import { describe, expect, it } from "vitest";
import {
  callOutcomeLabel,
  callRowSubtitle,
  emptyCallDraft,
  isCallDraftDirty,
  validateCallDraft,
} from "../../apps/mobile/src/data/sunday-school-phone-calls";

describe("callOutcomeLabel / callRowSubtitle", () => {
  it("reads every outcome naturally (happy path)", () => {
    expect(callOutcomeLabel("CONNECTED")).toBe("Connected");
    expect(callOutcomeLabel("LEFT_VOICEMAIL")).toBe("Left voicemail");
    expect(callOutcomeLabel("NO_ANSWER")).toBe("No answer");
    expect(callOutcomeLabel("OTHER")).toBe("Other");
  });

  it("names the real caller, never hiding who called (highest-risk path)", () => {
    expect(
      callRowSubtitle({ id: "1", calledAt: "2026-09-26T00:00:00.000Z", outcome: "NO_ANSWER", note: "x", callerName: "Mina Fouad", createdAt: "2026-09-26T00:00:00.000Z" }),
    ).toBe("No answer · Sep 26 · Mina Fouad");
  });
});

describe("validateCallDraft", () => {
  const today = "2026-10-10";

  it("accepts a well-formed call (happy path)", () => {
    expect(validateCallDraft({ calledAt: today, outcome: "CONNECTED", note: "Spoke with mom, will attend next week." }, today)).toBeNull();
  });

  it("mirrors the server's own checks exactly: future date, missing outcome, blank and overlong notes (highest-risk path)", () => {
    expect(validateCallDraft({ calledAt: "2026-10-11", outcome: "CONNECTED", note: "ok" }, today)).toMatch(/future/i);
    expect(validateCallDraft({ calledAt: today, outcome: "", note: "ok" }, today)).toMatch(/outcome/i);
    expect(validateCallDraft({ calledAt: today, outcome: "CONNECTED", note: "   " }, today)).toMatch(/500/);
    expect(validateCallDraft({ calledAt: today, outcome: "CONNECTED", note: "a".repeat(501) }, today)).toMatch(/500/);
    expect(validateCallDraft({ calledAt: today, outcome: "CONNECTED", note: "a".repeat(500) }, today)).toBeNull();
  });
});

describe("isCallDraftDirty", () => {
  it("is dirty once any field changes (happy path)", () => {
    const blank = emptyCallDraft("2026-10-10");
    expect(isCallDraftDirty({ ...blank, note: "started typing" }, blank)).toBe(true);
  });

  it("is never dirty for an unchanged draft, including whitespace-only note edits (highest-risk path)", () => {
    const blank = emptyCallDraft("2026-10-10");
    expect(isCallDraftDirty({ ...blank }, blank)).toBe(false);
    expect(isCallDraftDirty({ ...blank, note: "   " }, blank)).toBe(false);
  });
});
