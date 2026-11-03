import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { MakeupScoreAttempt, MakeupScoreStudent } from "@stmark/contracts";
import { makeupToday } from "../../lib/makeup-exams";
import { effectiveExamResult, parseMakeupScoreInput } from "../../lib/makeup-scores";
import {
  attemptLine,
  candidates,
  canGradeMakeups,
  checkDraft,
  dayLabel,
  draftFromAttempt,
  emptyDraft,
  gradeSummary,
  makeupFailure,
  makeupScoresPath,
  originalCaption,
  originalFieldValue,
  originalUnsaved,
  percentOf,
  studentsWithAttempts,
  type MakeupDraft,
} from "../../apps/mobile/src/data/makeup-scores";

const src = (file: string) => readFileSync(join(__dirname, "../../apps/mobile/src", file), "utf8");
const code = (file: string) => src(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const NOW = new Date("2026-11-03T15:00:00Z"); // Tuesday Nov 3, 2026 in New York
const TODAY = makeupToday(NOW);
const EXAM_DAY = "2026-10-03";
const draft = (over: Partial<MakeupDraft> = {}): MakeupDraft => ({
  studentId: "s1", version: "1", score: "44", totalPoints: "50", takenDate: "2026-10-31", notes: "", attemptId: null, ...over,
});
const attempt = (over: Partial<MakeupScoreAttempt> = {}): MakeupScoreAttempt => ({
  id: "a1", version: 2, score: 44, totalPoints: 50, percentage: 88, takenDate: "2026-10-31T00:00:00.000Z", notes: null, ...over,
});
const student = (id: string, original: number | null, effective: number | null, attempts: MakeupScoreAttempt[] = []): MakeupScoreStudent => ({
  id, name: `Student ${id}`, originalPercentage: original, effectivePercentage: effective, attempts,
});

describe("who can grade", () => {
  it("administrators, priests and Servants Prep servants; never a mentor, student, Sunday School servant or parent", () => {
    for (const role of ["SUPER_ADMIN", "PRIEST", "SERVANT_PREP"]) expect(canGradeMakeups(role)).toBe(true);
    for (const role of ["MENTOR", "STUDENT", "SERVANT", "PARENT", undefined, null]) expect(canGradeMakeups(role)).toBe(false);
  });
});

describe("the form agrees with the server's own checks", () => {
  const cases: [string, Partial<MakeupDraft>, boolean][] = [
    ["a valid attempt", {}, true],
    ["a decimal score", { score: "43.5" }, true],
    ["a perfect score", { score: "50" }, true],
    ["zero", { score: "0" }, true],
    ["no student", { studentId: "" }, false],
    ["no version", { version: "" }, false],
    ["total points of zero", { totalPoints: "0" }, false],
    ["total points not whole", { totalPoints: "50.5" }, false],
    ["no total points", { totalPoints: "" }, false],
    ["score over the total", { score: "51" }, false],
    ["negative score", { score: "-1" }, false],
    ["no score", { score: "" }, false],
    ["a date in the future", { takenDate: "2026-11-04" }, false],
    ["today", { takenDate: TODAY }, true],
    ["a malformed date", { takenDate: "2026-1-5" }, false],
    ["an impossible date", { takenDate: "2026-02-30" }, false],
  ];
  it.each(cases)("%s", (_name, over, valid) => {
    const d = draft(over);
    const mine = checkDraft(d, { examDay: EXAM_DAY, today: TODAY });
    const server = parseMakeupScoreInput(
      { studentId: d.studentId, version: Number(d.version) || d.version, score: d.score === "" ? undefined : Number(d.score), totalPoints: d.totalPoints === "" ? undefined : Number(d.totalPoints), takenDate: d.takenDate, notes: d.notes },
      NOW,
    );
    expect(mine.ok).toBe(valid);
    expect(typeof server !== "string").toBe(valid);
    if (mine.ok && typeof server !== "string") {
      expect(mine.body).toEqual({ studentId: server.studentId, version: server.version, score: server.score, totalPoints: server.totalPoints, takenDate: server.takenDate, notes: server.notes });
    }
    if (!mine.ok && typeof server === "string" && !/^Choose a student|before the exam/.test(mine.error)) expect(mine.error).toBe(server);
  });

  it("trims notes, sends null for empty ones, and includes the attempt only when correcting", () => {
    expect(checkDraft(draft({ notes: "  Retook after illness  " }), { examDay: EXAM_DAY, today: TODAY })).toMatchObject({ ok: true, body: { notes: "Retook after illness" } });
    expect(checkDraft(draft({ notes: "   " }), { examDay: EXAM_DAY, today: TODAY })).toMatchObject({ ok: true, body: { notes: null } });
    const correcting = checkDraft(draft({ attemptId: "a1" }), { examDay: EXAM_DAY, today: TODAY });
    expect(correcting).toMatchObject({ ok: true, body: { attemptId: "a1" } });
    const adding = checkDraft(draft(), { examDay: EXAM_DAY, today: TODAY });
    expect(adding.ok && "attemptId" in adding.body).toBe(false);
  });

  it("refuses a date before the exam it retakes, in words, instead of the server's generic refusal", () => {
    const check = checkDraft(draft({ takenDate: "2026-10-02" }), { examDay: EXAM_DAY, today: TODAY });
    expect(check).toMatchObject({ ok: false });
    expect(check.ok ? "" : check.error).toMatch(/before the exam it retakes \(Sat, Oct 3, 2026\)/);
  });

  it("starts empty with the exam's own points and today's date, and a correction starts from the attempt", () => {
    expect(emptyDraft(TODAY, 100)).toEqual({ studentId: "", version: "", score: "", totalPoints: "100", takenDate: TODAY, notes: "", attemptId: null });
    expect(draftFromAttempt("s1", attempt({ notes: "n" }))).toEqual({ studentId: "s1", version: "2", score: "44", totalPoints: "50", takenDate: "2026-10-31", notes: "n", attemptId: "a1" });
  });
});

describe("different point scales and the best result", () => {
  it("scores each attempt out of its own points", () => {
    expect(percentOf(44, 50)).toBe(88);
    expect(percentOf(30, 40)).toBe(75);
    expect(percentOf(7, 0)).toBe(0);
  });

  it("the server's effective result is the highest percentage, so a lower retake never reduces it", () => {
    expect(effectiveExamResult(80, [60], 100).percentage).toBe(80); // lower retake
    expect(effectiveExamResult(55, [88, 70], 100).percentage).toBe(88); // best of several
    expect(effectiveExamResult(null, [75], 100).percentage).toBe(75); // missed original, makeup only
    expect(effectiveExamResult(55, [percentOf(30, 40)], 80)).toEqual({ percentage: 75, score: 60 }); // normalized onto the exam's own scale
  });

  it("shows the original grade apart from the effective best, never in its place", () => {
    expect(gradeSummary(student("a", 55, 88))).toEqual({ original: "55%", counts: "88%" });
    expect(gradeSummary(student("b", null, 75))).toEqual({ original: "Not taken", counts: "75%" });
    expect(gradeSummary(student("c", 80, 80))).toEqual({ original: "80%", counts: "80%" });
  });

  it("the original editor's line reads original fields, and adds the best only when a makeup raised it", () => {
    expect(originalCaption({ originalScore: 55, originalPercentage: 55, percentage: 88 }, 100)).toEqual({ original: "55%", counts: " · Counts toward progress: 88%", hasOriginal: true });
    // A lower retake: the effective result equals the original, so there is nothing extra to say.
    expect(originalCaption({ originalScore: 80, originalPercentage: 80, percentage: 80 }, 100)).toEqual({ original: "80%", counts: "", hasOriginal: true });
    // A missed original with a makeup-only result: the original is Not entered, and the best is labelled as a makeup.
    expect(originalCaption({ originalScore: null, originalPercentage: null, percentage: 75 }, 100)).toEqual({ original: "Not entered", counts: " · Counts toward progress: 75% (makeup)", hasOriginal: false });
    expect(originalCaption(undefined, 100)).toEqual({ original: "Not entered", counts: "", hasOriginal: false });
  });

  it("the original field starts with the original score, never the best result", () => {
    expect(originalFieldValue({ originalScore: 55 })).toBe("55");
    expect(originalFieldValue({ originalScore: null })).toBe("");
    expect(originalFieldValue(undefined)).toBe("");
  });

  it("holds a makeup back while an original field has something unsaved, comparing as numbers", () => {
    const results = new Map([["a", { originalScore: 55 as number | null }], ["b", { originalScore: null as number | null }]]);
    expect(originalUnsaved({}, results)).toBe(false);
    expect(originalUnsaved({ a: "55" }, results)).toBe(false);
    expect(originalUnsaved({ a: "055" }, results)).toBe(false);
    expect(originalUnsaved({ a: "60" }, results)).toBe(true);
    expect(originalUnsaved({ b: "70" }, results)).toBe(true); // a makeup-only student typed an original
    expect(originalUnsaved({ a: "" }, results)).toBe(false); // clearing never deletes a grade
    expect(originalUnsaved({ c: "40" }, results)).toBe(true); // no result yet
  });
});

describe("who can get a makeup score", () => {
  const list = [student("missed", null, null), student("failed", 55, 55), student("passing", 90, 90), student("raised", 55, 88, [attempt()]), student("edge", 60, 60)];
  it("missed and failed students, not passing ones; the student being corrected stays", () => {
    expect(candidates(list, 60).map((s) => s.id)).toEqual(["missed", "failed"]);
    expect(candidates(list, 60, "raised").map((s) => s.id)).toEqual(["missed", "failed", "raised"]);
    expect(candidates(list, 70).map((s) => s.id)).toEqual(["missed", "failed", "edge"]);
  });
  it("an exam that becomes passing drops out of the choices but keeps its attempts visible", () => {
    const becamePassing = student("p", 55, 82, [attempt({ percentage: 82 })]);
    expect(candidates([becamePassing], 70).map((s) => s.id)).toEqual([]);
    expect(studentsWithAttempts([becamePassing, student("x", 50, 50)]).map((s) => s.id)).toEqual(["p"]);
  });
});

describe("how attempts read", () => {
  it("shows version, points, percentage and the date taken, read in UTC", () => {
    expect(attemptLine(attempt())).toBe("Version 2 · 44/50 (88%) · Sat, Oct 31, 2026");
    expect(attemptLine(attempt({ version: 1, score: 7.5, totalPoints: 10, percentage: 75 }))).toBe("Version 1 · 7.5/10 (75%) · Sat, Oct 31, 2026");
    expect(dayLabel("2026-10-31T00:00:00.000Z")).toBe("Sat, Oct 31, 2026");
  });
  it("names the route by exam", () => {
    expect(makeupScoresPath("abc 1")).toBe("/api/exams/abc%201/makeup-scores");
  });
});

describe("what a refusal means", () => {
  const failed = (status: number | null, message: string) => (status === null ? new Error(message) : Object.assign(new Error(message), { status }));
  it("explains each refusal", () => {
    expect(makeupFailure(failed(403, "Forbidden")).kind).toBe("forbidden");
    expect(makeupFailure(failed(404, "Not found")).kind).toBe("missing");
    expect(makeupFailure(failed(400, "This student must have an active enrollment and a failed or missed exam to record a new makeup score."))).toMatchObject({ kind: "invalid" });
    expect(makeupFailure(failed(null, "x")).kind).toBe("offline");
    expect(makeupFailure(failed(403, "View as is read-only. Stop viewing as this user before making changes.")).kind).toBe("other");
  });
});

describe("wiring", () => {
  const screen = code("app/prep-exam/[id].tsx");
  const section = code("components/makeup-scores-section.tsx");

  it("the original editor reads and writes the original fields only", () => {
    expect(screen).toContain("originalScore");
    expect(screen).toContain("originalFieldValue(server)");
    expect(screen).not.toMatch(/String\((server|existing)\.score\)/);
    expect(screen).not.toMatch(/\?\.score \?\? null/);
    // The only write the original editor sends is the score it was given.
    expect(screen).toMatch(/"PATCH", \{ score: value \}/);
    expect(screen).toMatch(/"POST", \{ studentId, score: value \}/);
  });

  it("the makeup section is for graders only and writes only through Save, with no booking needed", () => {
    expect(screen).toMatch(/\{canEdit && exam && \(\s*<MakeupScoresSection/);
    expect(section.match(/"PATCH"/g)).toHaveLength(1);
    expect(section.match(/"POST"/g)).toHaveLength(1);
    expect(section.indexOf('"POST"')).toBeGreaterThan(section.indexOf("async function save()"));
    expect(section).not.toMatch(/makeup-exams|booking/i);
    expect(section).toContain("const readOnly = !!viewingAs;");
  });
});
