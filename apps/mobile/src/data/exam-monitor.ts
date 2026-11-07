// The staff side of an original digital exam (Exam Monitoring), as pure rules so each one is testable without a screen.
// The server decides who may configure, open, close, unlock, release and approve retakes, and it finalizes, grades and
// publishes (lib/digital-exam-service.ts). Nothing here grants anything or computes a grade: these only decide what the
// app offers, how it orders and words the roster, and what it says when the server refuses.

import type { DigitalExamStaffAction, DigitalExamView } from "@stmark/contracts";
import { canUnlockStudent, type ProctorRow } from "./live-exams";

export const STALE_CONTACT_SECONDS = 30;

/** The words the proctor sees once an action succeeded. */
export const ACTION_SUCCESS: Record<DigitalExamStaffAction, string> = {
  configure: "Answer sheet setup saved",
  open: "Exam opened",
  close: "Exam closed; saved answers submitted",
  release: "Results released",
  unlock: "Student unlocked",
  retake: "Retake approved; previous grade and history preserved",
  ready: "Exam ready to open; grades and history preserved",
  reset: "Test opening reset; answer key and grades preserved",
};

export type ExamControls = {
  /** First setup, before the exam has ever been opened (the key and choices lock on first opening). */
  configure: boolean;
  ready: boolean;
  open: boolean;
  close: boolean;
  release: boolean;
  reset: boolean;
  retakes: boolean;
};

/**
 * Which controls to offer, from the server's own response. `manage` is the server's `canManage` (false for a priest's read-only
 * session, a View As session, and everyone below Prep staff). The same conditions as the web monitor; the server re-checks all.
 */
export function examControls(view: DigitalExamView | undefined, manage: boolean): ExamControls {
  const none = { configure: false, ready: false, open: false, close: false, release: false, reset: false, retakes: false };
  const sheet = view?.sheet;
  if (!view || !manage) return none;
  const unfinished = (view.roster ?? []).some((row) => row.attempt && row.attempt.state !== "SUBMITTED");
  return {
    configure: !sheet?.openedAt,
    ready: !!sheet && !!sheet.openedAt && sheet.state !== "DRAFT",
    open: !!sheet && sheet.state !== "OPEN" && (!sheet.releasedAt || unfinished),
    close: sheet?.state === "OPEN",
    release: sheet?.state === "CLOSED" && (!sheet.releasedAt || !!view.pendingResults),
    reset: !!sheet?.openedAt && !sheet.releasedAt && !view.hasAttempts,
    retakes: !!sheet?.openedAt && !!view.retakeCandidates?.length,
  };
}

/** "Ready to open", "Open", "Closed", "Results released", or "Needs setup": the exam's one-line state. */
export function sheetStateLabel(view: DigitalExamView): string {
  const sheet = view.sheet;
  if (!sheet) return "Needs setup";
  if (sheet.state === "DRAFT") return sheet.openedAt ? "Ready to open" : "Needs setup";
  if (sheet.state === "CLOSED") return sheet.releasedAt ? "Results released" : "Closed";
  return "Open";
}

/** Waiting on a proctor: paused, and not merely a retake that has not started. */
export const awaitingUnlock = (row: ProctorRow) => row.attempt?.state === "PAUSED" && !row.attempt.retakeReady;

/** Why a paused student cannot be unlocked yet; null when the server would allow it. Mirrors the server's own checks. */
export function unlockBlocker(view: DigitalExamView, row: ProctorRow): string | null {
  const attempt = row.attempt;
  if (!attempt || !awaitingUnlock(row)) return null;
  if (view.sheet?.state !== "OPEN") return "The exam is not open, so nobody can be unlocked.";
  if (attempt.stale) return "Waiting for contact: the student must reconnect.";
  if (attempt.pageVisible === false) return "Waiting for return: the exam screen is hidden on the student's device.";
  return null;
}

export type TileTone = "alert" | "warn" | "active" | "done" | "idle";
export type StudentTile = { label: string; detail: string | null; tone: TileTone; order: number };

/**
 * One student's tile: what to call it, how loud to make it, where it sorts. Paused students come first, those a proctor can
 * unlock right now before those still reconnecting; then stale contact, answering, not started, and submitted last.
 */
export function studentTile(view: DigitalExamView, row: ProctorRow): StudentTile {
  const attempt = row.attempt;
  if (!attempt) return { label: "Not started", detail: null, tone: "idle", order: 4 };
  if (attempt.retakeReady) return { label: "Retake ready", detail: "Waiting for the student to start", tone: "idle", order: 4 };
  if (attempt.state === "SUBMITTED") return { label: "Submitted", detail: null, tone: "done", order: 5 };
  if (attempt.state === "PAUSED") {
    const blocker = unlockBlocker(view, row);
    return blocker === null
      ? { label: "Needs unlock", detail: "Connected. Review, then unlock.", tone: "alert", order: 0 }
      : { label: "Paused", detail: blocker, tone: "alert", order: 1 };
  }
  if (attempt.stale) return { label: "No contact", detail: "Nothing heard for over 30 seconds", tone: "warn", order: 2 };
  return { label: "Answering", detail: null, tone: "active", order: 3 };
}

export function sortRoster(view: DigitalExamView, roster: ProctorRow[]): ProctorRow[] {
  return [...roster].sort(
    (a, b) => studentTile(view, a).order - studentTile(view, b).order || a.student.name.localeCompare(b.student.name),
  );
}

export const filterRoster = (roster: ProctorRow[], search: string) => {
  const term = search.trim().toLowerCase();
  return term ? roster.filter((row) => row.student.name.toLowerCase().includes(term)) : roster;
};

export type RosterSummary = {
  eligible: number;
  started: number;
  /** Paused students, whether or not they can be unlocked yet. */
  paused: number;
  /** Paused students a proctor can unlock this second. */
  unlockReady: number;
  noContact: number;
  submitted: number;
};

export function rosterSummary(view: DigitalExamView, roster: ProctorRow[]): RosterSummary {
  const started = roster.filter((row) => row.attempt && !row.attempt.retakeReady);
  return {
    eligible: roster.filter((row) => row.eligible).length,
    started: started.length,
    paused: roster.filter(awaitingUnlock).length,
    unlockReady: roster.filter((row) => canUnlockStudent(view, row)).length,
    noContact: started.filter((row) => row.attempt!.state === "ACTIVE" && row.attempt!.stale).length,
    submitted: started.filter((row) => row.attempt!.state === "SUBMITTED").length,
  };
}

/** "3 students need an unlock" / "1 student is paused and reconnecting"; null when nobody is waiting on a proctor. */
export function unlockHeadline(summary: RosterSummary): string | null {
  if (summary.paused === 0) return null;
  const plural = (n: number) => `${n} ${n === 1 ? "student" : "students"}`;
  const waiting = summary.paused - summary.unlockReady;
  if (summary.unlockReady > 0 && waiting > 0) return `${plural(summary.unlockReady)} can be unlocked now · ${waiting} still reconnecting`;
  if (summary.unlockReady > 0) return `${plural(summary.unlockReady)} can be unlocked now`;
  return `${plural(summary.paused)} paused and still reconnecting`;
}

/** "just now", "12 s ago", "3 min ago": the age of the last contact, from the server's own timestamp. */
export function contactAge(lastSeenAt: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(lastSeenAt).getTime()) / 1000));
  if (Number.isNaN(seconds)) return "unknown";
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  return "over an hour ago";
}

/**
 * The answer detail for one student: each of the 50 saved choices exactly as the server holds them. There is deliberately no
 * right/wrong here: the app never compares answers with the key or calculates a grade; the server finalizes and grades.
 */
export function answerCells(answers: readonly string[] | undefined): { question: number; choice: string }[] {
  return Array.from({ length: 50 }, (_, index) => ({ question: index + 1, choice: answers?.[index] || "" }));
}

/** The server's result for a submitted attempt, shown as the server sent it. */
export function resultLine(attempt: { correctCount?: number | null; percentage?: number }): string | null {
  if (typeof attempt.correctCount !== "number") return null;
  return typeof attempt.percentage === "number"
    ? `${attempt.correctCount} of 50 correct · ${attempt.percentage}%`
    : `${attempt.correctCount} of 50 correct`;
}

export type StaffFailureKind = "forbidden" | "missing" | "conflict" | "readonly" | "invalid" | "offline" | "other";

/**
 * What went wrong with a staff action, in words a proctor can act on, and whether the dashboard must reload to stay
 * truthful. A refused action never changes the grade or the attempt: the server did nothing, or (offline) it is unknown.
 */
export function staffActionFailure(error: unknown, action?: DigitalExamStaffAction): { kind: StaffFailureKind; message: string; refresh: boolean } {
  const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : null;
  const code = (error as { code?: unknown })?.code;
  const message = error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.";
  if (code === "ViewAsReadOnly" || (status === 403 && /view as/i.test(message)))
    return { kind: "readonly", message: "View as is read-only. Stop viewing as this user to manage the exam.", refresh: false };
  if (status === 403)
    return { kind: "forbidden", message: "You no longer have permission to manage this exam. Ask an administrator if this is unexpected.", refresh: true };
  if (status === 404) return { kind: "missing", message: "This exam or student is no longer available.", refresh: true };
  // 409 carries the server's rule in plain words: "The student must return and reconnect before unlocking.", "Existing
  // grades overlap these submissions. Resolve them before releasing; no grades were overwritten.", and so on.
  if (status === 409) return { kind: "conflict", message, refresh: true };
  if (status === 400) return { kind: "invalid", message, refresh: false };
  if (status === null)
    return {
      kind: "offline",
      message: `Could not reach the server${action ? `, so it is not known whether "${action}" was applied` : ""}. Check the dashboard before trying again.`,
      refresh: true,
    };
  return { kind: "other", message, refresh: true };
}
