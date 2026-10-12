/**
 * Pure logic for the Sunday School Servant attendance screen (SMM-54).
 *
 * Draft marks are keyed by userId, same shape the real batch endpoint
 * expects. The real status enum (SundaySchoolServantAttendanceStatus,
 * Prisma-side) is PRESENT | ABSENT only — no LATE/EXCUSED, those are
 * child-attendance concepts — kept here as a plain literal union rather than
 * importing the Prisma type, since mobile code has no other dependency on
 * @prisma/client.
 */
export type ServantAttendanceStatus = "PRESENT" | "ABSENT";
export type ServantMarks = Record<string, ServantAttendanceStatus>;

export type ServantProgress = { total: number; marked: number; present: number; absent: number; complete: boolean };

export function servantProgress(ids: string[], marks: ServantMarks): ServantProgress {
  const statuses = ids.map((id) => marks[id]);
  return {
    total: ids.length,
    marked: statuses.filter(Boolean).length,
    present: statuses.filter((s) => s === "PRESENT").length,
    absent: statuses.filter((s) => s === "ABSENT").length,
    complete: ids.length > 0 && statuses.every((s) => s === "PRESENT" || s === "ABSENT"),
  };
}

/** Fills only servants with no mark yet — never overwrites an existing choice. */
export function restPresentServants(ids: string[], marks: ServantMarks): ServantMarks {
  const next = { ...marks };
  for (const id of ids) if (!next[id]) next[id] = "PRESENT";
  return next;
}

/** The bottom bar's caption, or null once every servant has a mark. */
export function missingServantsLabel(progress: ServantProgress): string | null {
  const left = progress.total - progress.marked;
  return left > 0 ? `${left} left` : null;
}

export type EditLockReason =
  | { locked: false }
  | { locked: true; reason: "permission"; message: string }
  | { locked: true; reason: "date"; message: string };

/**
 * Why editing is unavailable, for display — never used to grant more than
 * the server's own `canEdit` flag allows. `canTakeAttendance` and `isToday`
 * are both independently knowable client-side (the class's own assignment
 * flag, and a plain date comparison), so the single server `canEdit` boolean
 * (permission AND date, combined) can still be explained as one or the other.
 */
export function editLockReason(canEdit: boolean, canTakeAttendance: boolean, isToday: boolean): EditLockReason {
  if (canEdit) return { locked: false };
  if (!canTakeAttendance) {
    return { locked: true, reason: "permission", message: "You can see this class's servant attendance, but recording it isn't part of your role here." };
  }
  return {
    locked: true,
    reason: "date",
    message: isToday
      ? "Attendance opens once this class's own meeting day arrives."
      : "You're looking at a past week. Come back on the class's own meeting day to make changes.",
  };
}

/** True when the roster saved to the draft no longer matches what's on screen — an assignment changed underneath the viewer. */
export function rosterChangedSinceDraft(draftIds: string[], currentIds: string[]): boolean {
  if (draftIds.length !== currentIds.length) return true;
  const a = [...draftIds].sort();
  const b = [...currentIds].sort();
  return a.some((id, i) => id !== b[i]);
}

/** A friendly explanation for the real "not on this class's active roster" save-time rejection, instead of the raw server message. */
export function assignmentChangedMessage(removedNames: string[]): string {
  if (!removedNames.length) {
    return "This class's servant assignments changed while you were editing. Refresh and try again.";
  }
  const names = removedNames.join(", ");
  return `${names} ${removedNames.length === 1 ? "is" : "are"} no longer assigned to this class. Refresh to see the current roster before saving.`;
}
