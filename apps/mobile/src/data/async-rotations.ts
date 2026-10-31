/**
 * Pure logic for the servant's Async students screen (SMM-91): the assignment
 * sort, the review queue, per-student ten-grade progress, and the review
 * request and its outcomes.
 *
 * Mirrors components/admin/sunday-school-panel.tsx, rotation-forms-review.tsx,
 * rotation-progress-overview.tsx, and lib/rotation-forms.ts on the web. The
 * device never advances a student, credits weeks, or picks a next class: it
 * sends a human decision to the review endpoint and shows what the server
 * decided. Nothing here is optimistic.
 */

import type {
  PrepRotationAssignmentRow,
  RotationFormReviewRow,
  RotationReviewResult,
} from "@stmark/contracts";
import { formStatus } from "./rotation-forms";

export type { PrepRotationAssignmentRow, RotationFormReviewRow, RotationReviewResult };

/** Pre-K, Kindergarten, then grades 1–8: the ten grades every async student visits. */
export const ROTATION_LEVELS = [
  "PRE_K",
  "KINDERGARTEN",
  "GRADE_1",
  "GRADE_2",
  "GRADE_3",
  "GRADE_4",
  "GRADE_5",
  "GRADE_6",
  "GRADE_7",
  "GRADE_8",
] as const;

const LEVEL_NAMES: Record<string, string> = {
  PRE_K: "Pre-K",
  KINDERGARTEN: "Kindergarten",
  GRADE_1: "1st Grade",
  GRADE_2: "2nd Grade",
  GRADE_3: "3rd Grade",
  GRADE_4: "4th Grade",
  GRADE_5: "5th Grade",
  GRADE_6: "6th Grade",
  GRADE_7: "7th Grade",
  GRADE_8: "8th Grade",
  GRADE_6_PLUS: "6th Grade+",
};

export function levelName(level: string): string {
  return LEVEL_NAMES[level] ?? level.replace(/_/g, " ");
}

/** The grade after this one, wrapping from eighth grade to Pre-K. Null for a level outside the ten. */
export function nextRotationLevel(level: string): string | null {
  const index = ROTATION_LEVELS.findIndex((candidate) => candidate === level);
  if (index < 0) return null;
  return ROTATION_LEVELS[(index + 1) % ROTATION_LEVELS.length];
}

/** The class a rotation was served in, or its grade for rotations made before classes were linked. */
export function rotationPlace(row: { grade: string; class?: { name: string } | null }): string {
  return row.class?.name ?? levelName(row.grade);
}

export type AssignmentSort = "name" | "grade";

/**
 * Grade order uses the assigned class's actual level (so 6th, 7th and 8th stay
 * separate); only a legacy rotation with no class and "Grade 6+" is ranked as
 * 6th grade's slot. Anything unrecognised sorts last.
 */
function gradeRank(row: PrepRotationAssignmentRow): number {
  const level = row.class?.level ?? row.grade;
  const rank = ROTATION_LEVELS.findIndex((candidate) => candidate === level);
  if (rank >= 0) return rank;
  return !row.class?.level && row.grade === "GRADE_6_PLUS" ? 7 : Number.MAX_SAFE_INTEGER;
}

export function sortAssignments(rows: PrepRotationAssignmentRow[], sortBy: AssignmentSort): PrepRotationAssignmentRow[] {
  return [...rows].sort((a, b) => {
    if (sortBy === "grade") {
      const order = gradeRank(a) - gradeRank(b);
      if (order) return order;
    }
    return (
      a.student.name.localeCompare(b.student.name, "en", { sensitivity: "base", numeric: true }) ||
      Number(b.isActive) - Number(a.isActive) ||
      rotationPlace(a).localeCompare(rotationPlace(b), "en", { numeric: true })
    );
  });
}

export const SORT_OPTIONS: { value: AssignmentSort; label: string }[] = [
  { value: "name", label: "Student name (A–Z)" },
  { value: "grade", label: "Grade (Pre-K to 8th)" },
];

/** Needs review first, then returned forms, then approved; oldest first within each. */
export function orderReviewQueue(forms: RotationFormReviewRow[]): RotationFormReviewRow[] {
  const rank = (status: string) => (status === "PENDING" ? 0 : status === "REJECTED" ? 1 : 2);
  return [...forms].sort(
    (a, b) => rank(a.status) - rank(b.status) || Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}

/** The server's rule (rotation-forms review route): Super Admins, priests and Servants Prep servants. The API still decides. */
export function canReviewRotationForms(role?: string | null): boolean {
  return role === "SUPER_ADMIN" || role === "SERVANT_PREP" || role === "PRIEST";
}

export function canSeeAsyncRotations(role?: string | null): boolean {
  return role === "SUPER_ADMIN" || role === "SERVANT_PREP" || role === "PRIEST" || role === "MENTOR";
}

export type ReviewBlocker =
  | { kind: "ready" }
  | { kind: "read-only"; message: string }
  | { kind: "own-form"; message: string }
  | { kind: "not-pending"; message: string }
  | { kind: "inactive"; message: string };

/** Whether this form can be reviewed by this person right now, and if not, why. */
export function reviewBlocker(
  form: RotationFormReviewRow,
  viewer: { id?: string | null; role?: string | null },
): ReviewBlocker {
  if (!canReviewRotationForms(viewer.role)) {
    return { kind: "read-only", message: "Only Servants Prep servants, priests and Super Admins can review forms." };
  }
  if (viewer.id && form.assignment.studentId === viewer.id) {
    return { kind: "own-form", message: "A different Servants Prep servant must review your own form." };
  }
  if (form.status !== "PENDING") {
    return { kind: "not-pending", message: form.status === "APPROVED" ? "Already approved." : "Returned to the student for correction." };
  }
  if (!form.assignment.isActive) {
    return { kind: "inactive", message: "This rotation is no longer active." };
  }
  return { kind: "ready" };
}

export type ReviewDecision = "APPROVED" | "REJECTED";

/** Why the chosen decision can't be sent yet. Approval needs all four weeks confirmed; returning needs notes. */
export function decisionBlocker(decision: ReviewDecision, input: { confirmed: boolean; notes: string }): string | null {
  if (decision === "APPROVED" && !input.confirmed) return "Confirm that all four weeks were attended and signed.";
  if (decision === "REJECTED" && !input.notes.trim()) return "Explain what the student needs to correct.";
  return null;
}

/**
 * The review request exactly as the server reads it: `notes` (not `reviewNotes`),
 * the form's current `version`, and `confirmedWeeks: 4` only for an approval.
 */
export function buildReviewBody(
  decision: ReviewDecision,
  form: Pick<RotationFormReviewRow, "version">,
  notes: string,
): { status: ReviewDecision; version: number; notes: string; confirmedWeeks?: 4 } {
  return {
    status: decision,
    version: form.version,
    notes: notes.trim(),
    ...(decision === "APPROVED" ? { confirmedWeeks: 4 as const } : {}),
  };
}

/** What happened, in the server's own terms. Never claims an advance the server didn't report. */
export function reviewOutcomeMessage(result: RotationReviewResult): string {
  if (result.status === "REJECTED") return "Form returned for correction. The student stays in the current class.";
  if (result.rotationsComplete) return "Approved. All ten grade rotations are complete.";
  const next = result.nextAssignment?.class?.name;
  return next ? `Rotation approved. Next class: ${next}.` : "Rotation approved.";
}

export type ReviewFailure = { message: string; refresh: boolean };

/**
 * A failed review is never shown as progress. A stale version, a review that
 * already happened, or a changed rotation asks for a refresh; a missing next
 * class explains that nothing changed and what to fix.
 */
export function reviewErrorMessage(status: number | null, serverMessage?: string): ReviewFailure {
  if (status === null) {
    return { message: "Couldn't reach the server. Nothing was changed. Try again once you're connected.", refresh: false };
  }
  const text = serverMessage?.trim() ?? "";
  if (/active class for the next grade/i.test(text)) {
    return {
      message: `Not approved. ${text}. The student stays in the current class. Ask a Super Admin to open a class for the next grade, then review again.`,
      refresh: false,
    };
  }
  if (status === 409 || /refresh|already been reviewed|no longer pending|changed/i.test(text)) {
    return { message: `${text || "This form changed."} Nothing was changed. The queue was refreshed.`, refresh: true };
  }
  if (status === 403) return { message: text || "You can't review this form.", refresh: false };
  if (status === 401) return { message: "Your session expired. Sign in again to review.", refresh: false };
  if (text && status >= 400 && status < 500) return { message: text, refresh: false };
  return { message: "Something went wrong. Nothing was changed. Try again.", refresh: false };
}

export interface StudentRotationProgress {
  studentId: string;
  name: string;
  current: string | null;
  completed: number;
  required: number;
  allComplete: boolean;
}

/** Approved grades per student, counted by distinct level so a repeated grade never adds a rotation. */
export function studentProgress(rows: PrepRotationAssignmentRow[]): StudentRotationProgress[] {
  const byStudent = new Map<string, PrepRotationAssignmentRow[]>();
  for (const row of rows) byStudent.set(row.studentId, [...(byStudent.get(row.studentId) ?? []), row]);
  const result: StudentRotationProgress[] = [];
  for (const [studentId, history] of byStudent) {
    const levels = new Set<string>();
    for (const row of history) {
      const level = row.class?.level ?? row.grade;
      if (row.rotationForm?.status === "APPROVED" && ROTATION_LEVELS.some((candidate) => candidate === level)) {
        levels.add(level);
      }
    }
    const current = history.find((row) => row.isActive);
    result.push({
      studentId,
      name: history[0].student.name,
      current: current ? rotationPlace(current) : null,
      completed: levels.size,
      required: ROTATION_LEVELS.length,
      allComplete: levels.size === ROTATION_LEVELS.length,
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true }));
}

export function progressCurrentLabel(progress: StudentRotationProgress): string {
  if (progress.current) return progress.current;
  return progress.allComplete ? "All rotations complete" : "No active rotation";
}

/** The single status each assignment row shows (shared wording with the student's screen). */
export function assignmentFormStatus(row: Pick<PrepRotationAssignmentRow, "rotationForm">) {
  return formStatus(row.rotationForm ? { status: row.rotationForm.status } : null);
}

/** A cheap fingerprint so a decision elsewhere (another servant, a student upload) refreshes dependent caches. */
export function queueSignature(forms: RotationFormReviewRow[]): string {
  return forms.map((form) => `${form.id}:${form.status}:${form.version}`).sort().join("|");
}
