/**
 * Pure logic + a tiny in-memory draft store for the Servants Prep
 * attendance workflow (SMM-35), pulled out of the screen component so the
 * progress math, the save-gating rule, and the role/date lock are
 * unit-testable without rendering native UI.
 *
 * Draft persistence: kept in a module-level store (same cache+listener
 * shape as data/resources.ts), not device storage. This survives
 * backgrounding and navigating away-and-back within the app session —
 * matching the level of resilience the already-shipped Sunday School
 * attendance draft (PortalProvider's in-memory `drafts` map) was judged
 * sufficient at — but not a full app kill. No new storage dependency
 * (AsyncStorage isn't installed; expo-secure-store's Keychain backing is
 * the wrong tool for a roster-sized, frequently-written draft).
 */

import { useSyncExternalStore } from "react";
import { STUDENT_MANAGE_ROLES } from "./prep-students";
import { isAsyncRow } from "./rotation-attendance";

export type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";
export type AttendanceMark = { status: AttendanceStatus; notes?: string };
export type AttendanceDraft = Record<string, AttendanceMark>;

/** Same role set as the web's canManageData/canManageCurriculum: Super Admins, priests and Servants Prep servants. */
export function canManageAttendance(role?: string | null): boolean {
  return !!role && STUDENT_MANAGE_ROLES.includes(role);
}

/** Matches the server's own rule in /api/attendance/batch: a lesson in the future can't have attendance taken yet. */
export function isLessonInFuture(scheduledDate: string, today: string): boolean {
  return scheduledDate.slice(0, 10) > today;
}

export function canEditSession(role: string | null | undefined, scheduledDate: string, today: string): boolean {
  return canManageAttendance(role) && !isLessonInFuture(scheduledDate, today);
}

export type StatusTotals = { present: number; late: number; absent: number; excused: number; marked: number; remaining: number };

export function statusTotals(draft: AttendanceDraft, rosterIds: string[]): StatusTotals {
  let present = 0, late = 0, absent = 0, excused = 0;
  for (const id of rosterIds) {
    const status = draft[id]?.status;
    if (status === "PRESENT") present++;
    else if (status === "LATE") late++;
    else if (status === "ABSENT") absent++;
    else if (status === "EXCUSED") excused++;
  }
  const marked = present + late + absent + excused;
  return { present, late, absent, excused, marked, remaining: rosterIds.length - marked };
}

/** Save is disabled until every roster student has a status — the acceptance criterion, made testable. */
export function allResolved(draft: AttendanceDraft, rosterIds: string[]): boolean {
  return rosterIds.length > 0 && rosterIds.every((id) => !!draft[id]?.status);
}

export function draftChanged(serverDraft: AttendanceDraft, draft: AttendanceDraft, rosterIds: string[]): boolean {
  return rosterIds.some((id) => draft[id]?.status !== serverDraft[id]?.status || draft[id]?.notes !== serverDraft[id]?.notes);
}

/** "Rest present": fills only the still-unmarked roster members — never overwrites an existing mark. */
export function restPresent(draft: AttendanceDraft, rosterIds: string[]): AttendanceDraft {
  const next = { ...draft };
  for (const id of rosterIds) {
    if (!next[id]?.status) next[id] = { status: "PRESENT" };
  }
  return next;
}

export type AttendanceBatchRecord = { studentId: string; status: AttendanceStatus; notes?: string };

/** The exact body /api/attendance/batch expects, built only from roster members with a resolved status. */
export function buildBatchRecords(draft: AttendanceDraft, rosterIds: string[]): AttendanceBatchRecord[] {
  return rosterIds
    .filter((id) => !!draft[id]?.status)
    .map((id) => ({ studentId: id, status: draft[id].status, ...(draft[id].notes ? { notes: draft[id].notes } : {}) }));
}

// --- Async students are not on lesson roll calls ---
//
// A current async student has no Servants Prep lesson attendance: their
// attendance is their Sunday School rotation (docs/async-serving-rotations.md).
// The server enforces it: /api/attendance/batch drops their records, and the
// single-record routes answer 400. The roll call mirrors that so nobody is shown
// as unmarked, counted as remaining, or sent, and so a student who becomes async
// while a roll call is open stops blocking Save.

export type RollCallEnrollment = { studentId: string; isAsyncStudent?: boolean | null; student: { name: string } };

/** Splits the active enrollments into who is on this lesson's roll call and who is off it because they are async. */
export function splitRollCall<T extends RollCallEnrollment>(enrollments: readonly T[]): { roster: T[]; offRoll: T[] } {
  const roster: T[] = [];
  const offRoll: T[] = [];
  for (const enrollment of enrollments) (isAsyncRow(enrollment) ? offRoll : roster).push(enrollment);
  return { roster, offRoll };
}

/** The draft without marks for students who are now async, and which of them had a mark. */
export function dropAsyncMarks(draft: AttendanceDraft, asyncIds: readonly string[]): { draft: AttendanceDraft; dropped: string[] } {
  const dropped = asyncIds.filter((id) => draft[id] !== undefined);
  if (!dropped.length) return { draft, dropped };
  const next = { ...draft };
  for (const id of dropped) delete next[id];
  return { draft: next, dropped };
}

const nameList = (names: readonly string[]) => names.join(", ");

/** The standing note under the roll call: who is off it and why. */
export function offRollCallNote(names: readonly string[]): string {
  return `Not on this roll call (async): ${nameList(names)}. Their attendance comes from their Sunday School rotation. Normal lessons do not count.`;
}

/** What changed under an open roll call, or null when nothing did. */
export function rollCallChangeNotice(change: { becameAsync: readonly string[]; markedDropped: readonly string[]; leftAsync: readonly string[] }): string | null {
  const parts: string[] = [];
  if (change.becameAsync.length) {
    const dropped = change.markedDropped.length
      ? ` Their marks on this roll call were discarded and won't be saved.`
      : "";
    parts.push(
      `${nameList(change.becameAsync)} ${change.becameAsync.length === 1 ? "is" : "are"} now async and ${change.becameAsync.length === 1 ? "is" : "are"} off this roll call.${dropped}`,
    );
  }
  if (change.leftAsync.length) {
    parts.push(
      `${nameList(change.leftAsync)} ${change.leftAsync.length === 1 ? "is" : "are"} no longer async and ${change.leftAsync.length === 1 ? "is" : "are"} back on this roll call. Check their mark before saving.`,
    );
  }
  return parts.length ? parts.join(" ") : null;
}

export function searchRoster<T extends { name: string }>(roster: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return roster;
  return roster.filter((r) => r.name.toLowerCase().includes(q));
}

// --- In-memory draft store, keyed by lessonId ---

type Listener = () => void;
const drafts = new Map<string, AttendanceDraft>();
const listeners = new Map<string, Set<Listener>>();
// useSyncExternalStore requires getSnapshot to return a referentially stable
// value when nothing changed — a fresh `{}` literal on every call (for any
// lessonId with no draft yet) looks like a change on every render and
// causes an infinite re-render loop (confirmed live: "Maximum update depth
// exceeded"), not just a missed optimization.
const EMPTY_DRAFT: AttendanceDraft = {};

function emit(lessonId: string) {
  listeners.get(lessonId)?.forEach((listener) => listener());
}

export function getAttendanceDraft(lessonId: string): AttendanceDraft {
  return drafts.get(lessonId) ?? EMPTY_DRAFT;
}

export function setAttendanceDraft(lessonId: string, draft: AttendanceDraft) {
  drafts.set(lessonId, draft);
  emit(lessonId);
}

export function clearAttendanceDraft(lessonId: string) {
  drafts.delete(lessonId);
  emit(lessonId);
}

export function useAttendanceDraft(lessonId: string): AttendanceDraft {
  return useSyncExternalStore(
    (listener) => {
      const set = listeners.get(lessonId) ?? new Set();
      set.add(listener);
      listeners.set(lessonId, set);
      return () => set.delete(listener);
    },
    () => getAttendanceDraft(lessonId),
    () => getAttendanceDraft(lessonId),
  );
}
