import type { AttendanceSaveInfo, AttendanceStatus } from "@stmark/contracts";

export type AttendanceMarks = Record<string, AttendanceStatus>;
export function rosterProgress(ids: string[], marks: AttendanceMarks) {
  const statuses = ids.map((id) => marks[id]);
  return {
    marked: statuses.filter(Boolean).length,
    present: statuses.filter((value) => value === "PRESENT" || value === "LATE")
      .length,
    complete:
      ids.length > 0 &&
      statuses.every((value) =>
        ["PRESENT", "LATE", "ABSENT", "EXCUSED"].includes(value),
      ),
  };
}

export function marksForRoster(
  ids: string[],
  marks: AttendanceMarks,
): AttendanceMarks {
  return Object.fromEntries(
    ids.filter((id) => marks[id]).map((id) => [id, marks[id]]),
  );
}

export function sameMarks(
  ids: string[],
  left: AttendanceMarks,
  right: AttendanceMarks,
) {
  return ids.every((id) => left[id] === right[id]);
}

/** "Mark rest present": fills only the still-unmarked roster members — never overwrites an existing mark. */
export function restPresent(
  ids: string[],
  marks: AttendanceMarks,
): AttendanceMarks {
  const next = { ...marks };
  for (const id of ids) {
    if (!next[id]) next[id] = "PRESENT";
  }
  return next;
}

/** A freshly-typed note always wins; otherwise keep whatever the record already had. */
export function resolveAttendanceNote(
  existing: string | null | undefined,
  draftNote: string | null | undefined,
): string | null {
  return draftNote !== undefined ? draftNote : (existing ?? null);
}

export function shiftWeek(date: string, direction: -1 | 1) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + direction * 7);
  return value.toISOString().slice(0, 10);
}

// ---- Autosave, recovery and the save area (SMM-111) -------------------------------------------
// Pure rules shared by the editor (attendance-editor.ts) and its tests. They mirror the web's
// lib/sunday-school-attendance-draft.ts and hooks/useSundaySchoolAttendance.ts.

/** The statuses a Sunday School save accepts. Excused is rejected by the server (it was retired). */
export type SavableStatus = "PRESENT" | "LATE" | "ABSENT";
const SAVABLE: readonly string[] = ["PRESENT", "LATE", "ABSENT"];
export const isSavableStatus = (value: unknown): value is SavableStatus =>
  typeof value === "string" && SAVABLE.includes(value);

/** Only the three savable statuses count as a mark; a retired Excused record shows as unmarked, as on the web. */
export function savedMarksOf(roster: { id: string; attendance: { status: string } | null }[]): AttendanceMarks {
  const marks: AttendanceMarks = {};
  for (const child of roster) {
    const status = child.attendance?.status;
    if (isSavableStatus(status)) marks[child.id] = status;
  }
  return marks;
}

/** Notes the server already holds, by child; a save must send these back or the server clears them. */
export function savedNotesOf(
  roster: { id: string; attendance: { notes: string | null } | null }[],
): Record<string, string | null> {
  return Object.fromEntries(roster.map((child) => [child.id, child.attendance?.notes ?? null]));
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * SecureStore keys allow only letters, digits, ".", "-" and "_", so the web's JSON key cannot be reused.
 * Account, class and date are all in the key: a draft can never be replayed under another login, class or
 * week. Null when any part is not a plain identifier (nothing is stored rather than guessing an encoding).
 */
export function attendanceDraftStorageKey(userId: string, classId: string, date: string): string | null {
  if (!SAFE_ID.test(userId) || !SAFE_ID.test(classId) || !DATE.test(date)) return null;
  return `stmark.attendance-draft.v1.${userId}.${classId}.${date}`;
}

/** What is kept on the device: child IDs, marks and any typed note. Never names, photos or contacts. */
export interface StoredDraft {
  marks: AttendanceMarks;
  notes: Record<string, string>;
}
export const emptyDraft = (): StoredDraft => ({ marks: {}, notes: {} });
const MAX_NOTE = 2000;

export function serializeDraft(draft: StoredDraft): string {
  return JSON.stringify({ v: 1, marks: draft.marks, notes: draft.notes });
}

/** Throws on anything unexpected; the caller treats that as "cannot trust this draft" and tells the user. */
export function parseDraft(raw: string | null): StoredDraft {
  if (!raw) return emptyDraft();
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value) || (value as { v?: unknown }).v !== 1)
    throw new Error("Invalid attendance draft");
  const { marks: rawMarks, notes: rawNotes } = value as { marks?: unknown; notes?: unknown };
  const draft = emptyDraft();
  if (rawMarks !== undefined) {
    if (!rawMarks || typeof rawMarks !== "object" || Array.isArray(rawMarks)) throw new Error("Invalid attendance draft");
    for (const [id, status] of Object.entries(rawMarks)) {
      if (!SAFE_ID.test(id) || !isSavableStatus(status)) throw new Error("Invalid attendance draft");
      // defineProperty, so an ID such as "__proto__" stays a plain key.
      Object.defineProperty(draft.marks, id, { value: status, enumerable: true, configurable: true, writable: true });
    }
  }
  if (rawNotes !== undefined) {
    if (!rawNotes || typeof rawNotes !== "object" || Array.isArray(rawNotes)) throw new Error("Invalid attendance draft");
    for (const [id, note] of Object.entries(rawNotes)) {
      if (!SAFE_ID.test(id) || typeof note !== "string" || note.length > MAX_NOTE) throw new Error("Invalid attendance draft");
      Object.defineProperty(draft.notes, id, { value: note, enumerable: true, configurable: true, writable: true });
    }
  }
  return draft;
}

/**
 * Lay a recovered or carried-over draft over a freshly loaded roster. Children no longer on the roster
 * are dropped (counted, so the screen can say so) and children new to it stay unmarked: a draft never
 * marks anyone it did not mention. A mark that already matches the server and has no note to send is
 * not pending (it was saved before the app was interrupted), so resuming never re-records it.
 */
export function mergeAttendanceDraft(
  saved: AttendanceMarks,
  draft: StoredDraft,
  rosterIds: string[],
): { marks: AttendanceMarks; pending: AttendanceMarks; notes: Record<string, string>; removedCount: number } {
  const roster = new Set(rosterIds);
  const marks: AttendanceMarks = {};
  const pending: AttendanceMarks = {};
  const notes: Record<string, string> = {};
  for (const id of rosterIds) {
    if (saved[id]) marks[id] = saved[id];
    const note = draft.notes[id];
    if (note !== undefined) notes[id] = note;
    const mark = draft.marks[id];
    if (mark) {
      marks[id] = mark;
      if (mark !== saved[id] || note !== undefined) pending[id] = mark;
    }
  }
  const dropped = new Set([...Object.keys(draft.marks), ...Object.keys(draft.notes)].filter((id) => !roster.has(id)));
  return { marks, pending, notes, removedCount: dropped.size };
}

/**
 * Acknowledgment clears only what was submitted. A child tapped again while the save was in flight keeps
 * its newer mark pending, and a note edited meanwhile keeps its child pending, so neither is lost.
 */
export function afterAcknowledgment(
  current: { pending: AttendanceMarks; notes: Record<string, string> },
  sent: AttendanceMarks,
  sentNotes: Record<string, string>,
): { pending: AttendanceMarks; notes: Record<string, string> } {
  const pending = { ...current.pending };
  const notes = { ...current.notes };
  for (const [id, status] of Object.entries(sent)) {
    const markChanged = pending[id] !== status;
    const noteChanged = notes[id] !== sentNotes[id];
    if (!noteChanged) delete notes[id];
    if (!markChanged && !noteChanged) delete pending[id];
  }
  return { pending, notes };
}

/** Why a save failed, and whether trying again by itself can help. */
export function attendanceFailure(error: unknown): { message: string; retryable: boolean } {
  const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : null;
  const fixed = (error as { retryable?: unknown })?.retryable;
  const message = error instanceof Error && error.message ? error.message : "Could not save attendance.";
  // No status: the request never got an answer (offline, timed out, dropped). A bad answer is not retried
  // on its own: a permission, validation or roster problem needs a person to look at it.
  const retryable = typeof fixed === "boolean" ? fixed : status === null || status >= 500 || status === 408 || status === 429;
  if (status === 403 && !/view as/i.test(message))
    return { message: "You can't save attendance for this class. Ask an administrator if this is unexpected.", retryable };
  return { message, retryable };
}

export type AttendanceSaveState = "readonly" | "idle" | "local" | "recovered" | "saving" | "saved" | "failed";

/** One word for the save area; see the order below, the first that applies wins. */
export function saveStateOf(input: {
  canEdit: boolean;
  saving: boolean;
  failed: boolean;
  recovered: boolean;
  pendingCount: number;
  hasSavedMarks: boolean;
}): AttendanceSaveState {
  if (!input.canEdit) return "readonly";
  if (input.saving) return "saving";
  if (input.failed) return "failed";
  if (input.pendingCount > 0) return input.recovered ? "recovered" : "local";
  return input.hasSavedMarks ? "saved" : "idle";
}

/** "Last saved by Mina Mark · Oct 12, 2026, 2:14 PM", from the server's recorder and time. */
export function savedByLabel(info: AttendanceSaveInfo | null | undefined): string | null {
  if (info === undefined) return null;
  if (!info) return "Attendance not saved yet.";
  const when = new Date(info.savedAt);
  const time = Number.isFinite(when.getTime())
    ? when.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "an unknown time";
  return `Last saved by ${info.recorder?.name || "an unknown recorder"} · ${time}`;
}

export type StatusTone = "muted" | "warning" | "success" | "danger";

/** The one-line state in the save area: where the marks are right now. */
export function saveStatusText(state: AttendanceSaveState, pendingCount: number): { title: string; tone: StatusTone } {
  const marks = `${pendingCount} ${pendingCount === 1 ? "mark" : "marks"}`;
  switch (state) {
    case "readonly":
      return { title: "Read-only", tone: "muted" };
    case "idle":
      return { title: "Nothing marked yet", tone: "muted" };
    case "local":
      return { title: `On this device only · ${marks} waiting`, tone: "warning" };
    case "recovered":
      return { title: `Recovered ${marks} · not saved yet`, tone: "warning" };
    case "saving":
      return { title: "Saving to the church…", tone: "muted" };
    case "saved":
      return { title: "Saved to the church", tone: "success" };
    case "failed":
      return { title: "Not saved · kept on this device", tone: "danger" };
  }
}

export type AttendanceNoticeAction = "resume" | "retry" | "reload";
export interface AttendanceNotice {
  id: string;
  tone: StatusTone;
  text: string;
  actions: AttendanceNoticeAction[];
}

/** What the person must know or do about their marks, most urgent first. */
export function attendanceNotices(input: {
  canEdit: boolean;
  recovered: boolean;
  pendingCount: number;
  storageError: boolean;
  removedCount: number;
  saveError: string | null;
  retryable: boolean;
  refreshError: string | null;
  saving: boolean;
}): AttendanceNotice[] {
  const notices: AttendanceNotice[] = [];
  if (input.saveError) {
    notices.push({
      id: "failed",
      tone: "danger",
      text: `${/[.!?]$/.test(input.saveError) ? input.saveError : `${input.saveError}.`} Attendance has not been confirmed saved. Your marks are kept on this device.${input.retryable ? " Trying again automatically." : ""}`,
      actions: input.pendingCount > 0 ? ["retry", "reload"] : ["reload"],
    });
  }
  if (input.canEdit && input.recovered && input.pendingCount > 0) {
    notices.push({
      id: "recovered",
      tone: "warning",
      text: `Recovered ${input.pendingCount} ${input.pendingCount === 1 ? "mark" : "marks"} from this device. Review them, then resume saving.`,
      actions: ["resume"],
    });
  }
  if (input.canEdit && input.removedCount > 0) {
    notices.push({
      id: "removed",
      tone: "warning",
      text: `${input.removedCount} recovered ${input.removedCount === 1 ? "mark belongs" : "marks belong"} to children no longer in this class and will not be sent.`,
      actions: [],
    });
  }
  if (input.canEdit && input.storageError && input.pendingCount > 0) {
    notices.push({
      id: "storage",
      tone: "danger",
      text: "This device couldn't keep your marks. Stay on this screen until they save.",
      actions: [],
    });
  }
  if (input.refreshError) {
    notices.push({
      id: "refresh",
      tone: "warning",
      text: `Couldn't refresh the roster: ${input.refreshError} Your marks are still here.`,
      actions: input.saving ? [] : ["reload"],
    });
  }
  return notices;
}
