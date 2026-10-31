import type { AttendanceMarks } from "./attendance-draft";

export interface ActiveDraft {
  classId: string;
  date: string;
  className: string;
}

/**
 * The in-progress attendance draft to surface in the persistent accessory,
 * or null when nothing is in progress. Drafts are keyed `classId:date`
 * (see portal-provider.ts's `attendanceKey`) and only exist once at least
 * one child has been marked.
 */
export function activeDraft(
  drafts: Record<string, AttendanceMarks>,
  classes: { id: string; name: string }[],
): ActiveDraft | null {
  const key = Object.keys(drafts).find((k) => Object.keys(drafts[k]).length > 0);
  if (!key) return null;
  const separator = key.indexOf(":");
  if (separator < 0) return null;
  const classId = key.slice(0, separator);
  const date = key.slice(separator + 1);
  const className = classes.find((c) => c.id === classId)?.name ?? "class";
  return { classId, date, className };
}

/** Hide the accessory while already on the attendance screen it refers to. */
export function shouldShowAccessory(
  pathname: string,
  draft: ActiveDraft | null,
): draft is ActiveDraft {
  if (!draft) return false;
  return !pathname.startsWith(`/attendance/${draft.classId}`);
}
