// Sunday School absence notifications (kind `sunday-school-absence`). The server
// finds the streaks, picks the recipients (direct class staff at three
// consecutive weeks; active band coordinators and that band's priest overseer at
// four or more), writes one notification per recipient, threshold and absence
// episode, and sends the push. The app only displays and opens what it is sent:
// it never works out a streak, picks a recipient, or sends an alert of its own.
// Pure helpers.

import type { SundaySchoolAbsenceNotificationMetadata } from "@stmark/contracts";

export type { SundaySchoolAbsenceNotificationMetadata };

export const ABSENCE_KIND = "sunday-school-absence";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The absence details on a notification, or null when it is some other notification or malformed. */
export function parseAbsenceMetadata(metadata: unknown): SundaySchoolAbsenceNotificationMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = metadata as Record<string, unknown>;
  if (value.kind !== ABSENCE_KIND) return null;
  const { childId, classId, firstAbsenceDate, weeks, threshold } = value;
  if (typeof childId !== "string" || !ID.test(childId)) return null;
  if (typeof classId !== "string" || !ID.test(classId)) return null;
  if (!isDateKey(firstAbsenceDate)) return null;
  if (typeof weeks !== "number" || !Number.isInteger(weeks) || weeks < 1 || weeks > 99) return null;
  if (threshold !== 2 && threshold !== 4) return null;
  return { kind: ABSENCE_KIND, childId, classId, firstAbsenceDate, weeks, threshold };
}

/**
 * Opens that child's visitation workflow; `classId` narrows the lookup but is not
 * required. `check=1` makes the screen ask the server again before it shows the
 * child, because the alert may be days old and access or the class may have changed.
 */
export function absencePath(target: { childId: string; classId?: string | null }): string {
  const base = `/visitation/${target.childId}`;
  return target.classId && ID.test(target.classId) ? `${base}?classId=${target.classId}&check=1` : `${base}?check=1`;
}

/**
 * The child from the web link a push carries (`/dashboard/servants/visitations?childId=…`).
 * A push has no metadata, only this link, so it can name the child but not the class.
 */
export function absenceChildFromUrl(url: string | null | undefined): { childId: string } | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url, "https://portal.invalid");
  } catch {
    return null;
  }
  if (!/^\/dashboard\/servants\/visitations\/?$/.test(parsed.pathname)) return null;
  const childId = parsed.searchParams.get("childId");
  return childId && ID.test(childId) ? { childId } : null;
}

export type AbsenceTone = "followUp" | "escalation";

export interface AbsenceDisplay {
  tone: AbsenceTone;
  /** "Follow-up" for direct class staff, "Escalation" for coordinators and the priest overseer. */
  tag: string;
  /** "3 consecutive weeks absent" */
  weeksText: string;
  spoken: string;
}

export function absenceDisplay(meta: Pick<SundaySchoolAbsenceNotificationMetadata, "weeks" | "threshold">): AbsenceDisplay {
  const tone: AbsenceTone = meta.threshold === 4 ? "escalation" : "followUp";
  const tag = tone === "escalation" ? "Escalation" : "Follow-up";
  const weeksText = `${meta.weeks} consecutive ${meta.weeks === 1 ? "week" : "weeks"} absent`;
  return { tone, tag, weeksText, spoken: `${tag}. ${weeksText}.` };
}

/** Said when the opened child can no longer be shown to this person. */
export const ABSENCE_UNAVAILABLE_TITLE = "Child unavailable";
export const ABSENCE_UNAVAILABLE_BODY =
  "You may no longer have access to this child, or they were moved to another class or archived. Go back and check your visitations list.";
