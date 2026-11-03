// Makeup exam scores on the staff score screen (SMM-114), the native counterpart of the web's
// components/makeup-exam-scores.tsx. Pure rules, so each is testable without a screen. The server validates every
// write, keeps the original grade, and recalculates the best (effective) result in one transaction; the app only
// shows what it returns. Checks here mirror lib/makeup-scores.ts so a form fails early with the same words.

import type { MakeupScoreAttempt, MakeupScoreRequest, MakeupScoreStudent, ExamScoreResult } from "@stmark/contracts";
import { formatPercent } from "./format-percent";

export const makeupScoresPath = (examId: string) => `/api/exams/${encodeURIComponent(examId)}/makeup-scores`;

/** Staff who grade: administrators, priests and Servants Prep servants. A mentor, student or Sunday School-only account holds none of the required tags, so the API refuses them. */
export const canGradeMakeups = (role?: string | null) => role === "SUPER_ADMIN" || role === "PRIEST" || role === "SERVANT_PREP";

export const dayOf = (iso: string) => iso.slice(0, 10);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const validDay = (value: string) => DAY.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

/** "Sat, Oct 31, 2026", read in UTC so the phone's own time zone never moves the day. */
export function dayLabel(day: string): string {
  return new Date(`${dayOf(day)}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export const percentOf = (score: number, total: number) => (total > 0 ? (score / total) * 100 : 0);

// ---- the form ----

export type MakeupDraft = {
  studentId: string;
  version: "" | "1" | "2";
  score: string;
  totalPoints: string;
  takenDate: string;
  notes: string;
  attemptId: string | null;
};
export const emptyDraft = (today: string, examTotal: number): MakeupDraft => ({
  studentId: "", version: "", score: "", totalPoints: String(examTotal), takenDate: today, notes: "", attemptId: null,
});
export const draftFromAttempt = (studentId: string, attempt: MakeupScoreAttempt): MakeupDraft => ({
  studentId,
  version: String(attempt.version) as "1" | "2",
  score: String(attempt.score),
  totalPoints: String(attempt.totalPoints),
  takenDate: dayOf(attempt.takenDate),
  notes: attempt.notes ?? "",
  attemptId: attempt.id,
});

export type DraftCheck = { ok: true; body: MakeupScoreRequest } | { ok: false; error: string };

/**
 * The server's own rules (lib/makeup-scores.ts parseMakeupScoreInput), with one extra a person can act on: a makeup cannot
 * be dated before the exam it retakes (the server refuses that with a generic message).
 */
export function checkDraft(draft: MakeupDraft, context: { examDay: string; today: string }): DraftCheck {
  if (!draft.studentId) return { ok: false, error: "Choose a student." };
  if (draft.version !== "1" && draft.version !== "2") return { ok: false, error: "Choose makeup exam version 1 or 2." };
  const totalText = draft.totalPoints.trim();
  const total = Number(totalText);
  if (!totalText || !Number.isSafeInteger(total) || total <= 0 || total > 2147483647) return { ok: false, error: "Total points must be a positive whole number." };
  const scoreText = draft.score.trim();
  const score = Number(scoreText);
  if (!scoreText || !Number.isFinite(score) || score < 0 || score > total) return { ok: false, error: "Enter a score between zero and the total points." };
  if (!DAY.test(draft.takenDate)) return { ok: false, error: "Choose the date the makeup exam was taken." };
  if (!validDay(draft.takenDate) || draft.takenDate > context.today) return { ok: false, error: "The makeup exam date must be a valid date on or before today." };
  if (draft.takenDate < context.examDay) return { ok: false, error: `A makeup can't be dated before the exam it retakes (${dayLabel(context.examDay)}).` };
  const notes = draft.notes.trim();
  return {
    ok: true,
    body: {
      studentId: draft.studentId,
      version: Number(draft.version) as 1 | 2,
      score,
      totalPoints: total,
      takenDate: draft.takenDate,
      notes: notes || null,
      ...(draft.attemptId ? { attemptId: draft.attemptId } : {}),
    },
  };
}

/** Students a new makeup can be recorded for: no result yet (missed) or still below the passing score; the one being edited always stays. */
export function candidates(students: MakeupScoreStudent[], passingScore: number, editingStudentId?: string): MakeupScoreStudent[] {
  return students.filter(
    (student) => student.effectivePercentage === null || student.effectivePercentage < passingScore || student.id === editingStudentId,
  );
}
export const studentsWithAttempts = (students: MakeupScoreStudent[]) => students.filter((student) => student.attempts.length > 0);

// ---- how grades read ----

/** "Original: 55%  ·  Counts toward progress: 88%", or "Original: Not taken" for a missed exam with a makeup. */
export function gradeSummary(student: Pick<MakeupScoreStudent, "originalPercentage" | "effectivePercentage">) {
  return {
    original: student.originalPercentage === null ? "Not taken" : formatPercent(student.originalPercentage),
    counts: student.effectivePercentage === null ? "—" : formatPercent(student.effectivePercentage),
  };
}

/** "Version 2 · 44/50 (88%) · Sat, Oct 31, 2026". */
export const attemptLine = (attempt: MakeupScoreAttempt) =>
  `Version ${attempt.version} · ${attempt.score}/${attempt.totalPoints} (${formatPercent(attempt.percentage)}) · ${dayLabel(attempt.takenDate)}`;

/**
 * The original-grade editor's line for a student, reading the ORIGINAL fields only. The effective best is shown beside it
 * when a makeup raised it, never in its place, so a save in the original editor cannot overwrite the original with it.
 */
export function originalCaption(result: Pick<ExamScoreResult, "originalScore" | "originalPercentage" | "percentage"> | undefined, examTotal: number) {
  if (!result || result.originalScore === null || result.originalScore === undefined) {
    const counts = result ? ` · Counts toward progress: ${formatPercent(result.percentage)} (makeup)` : "";
    return { original: "Not entered", counts, hasOriginal: false };
  }
  const originalPct = result.originalPercentage ?? percentOf(result.originalScore, examTotal);
  const raised = result.percentage > originalPct + 1e-9;
  return {
    original: formatPercent(originalPct),
    counts: raised ? ` · Counts toward progress: ${formatPercent(result.percentage)}` : "",
    hasOriginal: true,
  };
}

/** The text an original-score field starts with: the original score, never the effective best. */
export const originalFieldValue = (result?: Pick<ExamScoreResult, "originalScore">) =>
  result && result.originalScore !== null && result.originalScore !== undefined ? String(result.originalScore) : "";

/**
 * Whether any original-score field holds a value the server does not yet. Compared as numbers ("07" is 7), and a cleared field
 * counts as no change (clearing never deletes a grade). A makeup is held back until the original fields are saved.
 */
export function originalUnsaved(local: Record<string, string>, results: Map<string, Pick<ExamScoreResult, "originalScore">>): boolean {
  return Object.entries(local).some(([studentId, text]) => {
    if (!text.trim()) return false;
    const saved = results.get(studentId)?.originalScore;
    return saved === null || saved === undefined || Number(text) !== saved;
  });
}

export type MakeupFailureKind = "forbidden" | "missing" | "invalid" | "offline" | "other";
export function makeupFailure(error: unknown): { kind: MakeupFailureKind; message: string } {
  const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : null;
  const message = error instanceof Error && error.message ? error.message : "Unable to save the makeup score.";
  if (status === 403 && !/view as/i.test(message)) return { kind: "forbidden", message: "You can't record makeup scores with this account." };
  if (status === 404) return { kind: "missing", message: "That score or exam is no longer available. The list has been refreshed." };
  if (status === 400) return { kind: "invalid", message };
  if (status === null) return { kind: "offline", message: "Could not reach the server. Nothing was saved; try again when you are back online." };
  return { kind: "other", message };
}
