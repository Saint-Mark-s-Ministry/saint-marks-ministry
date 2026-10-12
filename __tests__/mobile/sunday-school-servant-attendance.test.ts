import { describe, expect, it } from "vitest";
import {
  assignmentChangedMessage,
  editLockReason,
  missingServantsLabel,
  restPresentServants,
  rosterChangedSinceDraft,
  servantProgress,
} from "../../apps/mobile/src/data/sunday-school-servant-attendance";

describe("servantProgress", () => {
  it("counts marked/present/absent and is complete once every servant has a real mark (happy path)", () => {
    const progress = servantProgress(["a", "b", "c"], { a: "PRESENT", b: "ABSENT", c: "PRESENT" });
    expect(progress).toEqual({ total: 3, marked: 3, present: 2, absent: 1, complete: true });
  });

  it("is never complete with an empty roster, and ignores an unmarked id rather than counting it (highest-risk path)", () => {
    expect(servantProgress([], {}).complete).toBe(false);
    const progress = servantProgress(["a", "b"], { a: "PRESENT" });
    expect(progress).toEqual({ total: 2, marked: 1, present: 1, absent: 0, complete: false });
  });
});

describe("restPresentServants", () => {
  it("fills only the unmarked servants (happy path)", () => {
    expect(restPresentServants(["a", "b"], { a: "ABSENT" })).toEqual({ a: "ABSENT", b: "PRESENT" });
  });

  it("never overwrites an existing mark, including ABSENT (highest-risk path)", () => {
    expect(restPresentServants(["a"], { a: "ABSENT" })).toEqual({ a: "ABSENT" });
  });
});

describe("missingServantsLabel", () => {
  it("counts how many still need a mark (happy path)", () => {
    expect(missingServantsLabel(servantProgress(["a", "b", "c"], { a: "PRESENT" }))).toBe("2 left");
  });

  it("returns null once complete, not '0 left' (highest-risk path)", () => {
    expect(missingServantsLabel(servantProgress(["a"], { a: "PRESENT" }))).toBeNull();
  });
});

describe("editLockReason", () => {
  it("reports unlocked when the server's own canEdit flag is true (happy path)", () => {
    expect(editLockReason(true, true, true)).toEqual({ locked: false });
  });

  it("distinguishes a permission lock from a date lock, never granting edit itself (highest-risk path)", () => {
    const permission = editLockReason(false, false, true);
    expect(permission).toMatchObject({ locked: true, reason: "permission" });
    const date = editLockReason(false, true, false);
    expect(date).toMatchObject({ locked: true, reason: "date" });
  });

  it("never reports unlocked when the server says canEdit is false, even if both other signals look permissive", () => {
    expect(editLockReason(false, true, true).locked).toBe(true);
  });
});

describe("rosterChangedSinceDraft", () => {
  it("is false for the same roster in a different order (happy path)", () => {
    expect(rosterChangedSinceDraft(["a", "b"], ["b", "a"])).toBe(false);
  });

  it("detects both an added and a removed servant (highest-risk path)", () => {
    expect(rosterChangedSinceDraft(["a", "b"], ["a", "c"])).toBe(true);
    expect(rosterChangedSinceDraft(["a"], ["a", "b"])).toBe(true);
  });
});

describe("assignmentChangedMessage", () => {
  it("names the servant(s) who dropped off the roster (happy path)", () => {
    expect(assignmentChangedMessage(["Abanob Faltas"])).toMatch(/Abanob Faltas is no longer assigned/);
    expect(assignmentChangedMessage(["Abanob Faltas", "Arpita Wilson"])).toMatch(/are no longer assigned/);
  });

  it("falls back to a generic explanation when no names are known (highest-risk path)", () => {
    expect(assignmentChangedMessage([])).toMatch(/changed while you were editing/);
  });
});
