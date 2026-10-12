/**
 * Pure logic for the Sunday School Lessons list and detail screens (SMM-52).
 *
 * Mirrors what `/api/sunday-school/lessons` actually returns. A weekly lesson
 * has a class, a Sunday, an optional title, an optional teacher (owner), and
 * ordered links. It has no canceled, changed, or publication field, so the
 * screens cannot show those states and this module does not invent them.
 *
 * Calendar dates are `YYYY-MM-DD` strings. The server stores each Sunday at
 * midnight UTC, so the first ten characters are the calendar day and no time
 * zone math is needed to compare them against today.
 */

import type { SundaySchoolWeeklyLesson, SundaySchoolWeeklyLessonStatus } from "@stmark/contracts";
import { resourceKind, safeHttpUrl } from "./prep-lessons";

export type LessonSchedule = "upcoming" | "past";
export type LessonOwnership = "everyone" | "mine";

export const SCHEDULE_LABEL: Record<LessonSchedule, string> = { upcoming: "Upcoming", past: "Past" };
export const OWNERSHIP_LABEL: Record<LessonOwnership, string> = { everyone: "All lessons", mine: "My lessons" };

/** Today's calendar day in the device's own time zone, as `YYYY-MM-DD`. */
export function localDateKey(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function lessonDateKey(lesson: Pick<SundaySchoolWeeklyLesson, "sundayDate">): string {
  return lesson.sundayDate.slice(0, 10);
}

/**
 * Upcoming includes today. Past is strictly before today. Upcoming reads
 * soonest first, past reads most recent first, and ties break on class name.
 * "Mine" is a filter on ownership only; it keeps the upcoming order.
 */
export function scheduleLessons(
  lessons: SundaySchoolWeeklyLesson[],
  schedule: LessonSchedule,
  today: string,
  ownership: LessonOwnership = "everyone",
  userId?: string | null,
): SundaySchoolWeeklyLesson[] {
  const rows = lessons.filter((lesson) => {
    if (ownership === "mine" && (!userId || lesson.ownerId !== userId)) return false;
    const isPast = lessonDateKey(lesson) < today;
    return schedule === "past" ? isPast : !isPast;
  });
  const direction = schedule === "past" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const byDate = lessonDateKey(a).localeCompare(lessonDateKey(b)) * direction;
    return byDate || a.class.name.localeCompare(b.class.name);
  });
}

export type ReadinessTone = "ready" | "needsLinks" | "unassigned";
export type Readiness = { label: string; tone: ReadinessTone };

/** The one word for a lesson's readiness. Always text, never color alone. */
export function readiness(status: SundaySchoolWeeklyLessonStatus): Readiness {
  if (status === "READY") return { label: "Ready", tone: "ready" };
  if (status === "NEEDS_LINKS") return { label: "Needs links", tone: "needsLinks" };
  return { label: "Unassigned", tone: "unassigned" };
}

export function lessonTitle(lesson: Pick<SundaySchoolWeeklyLesson, "title" | "status">): string {
  const title = lesson.title?.trim();
  if (title) return title;
  // "Weekly lesson" is this app's own established term for an untitled lesson
  // (the nav title on this detail screen, and the old list screen's fallback).
  return lesson.status === "UNASSIGNED" ? "Not assigned" : "Weekly lesson";
}

/**
 * The row's second line. Ready lessons name their links, so a servant can
 * scan what is ready to share. The copy follows the data model: a lesson with
 * no teacher is "No teacher assigned", not "Choose a lesson" as the artboard
 * says, because there is no lesson-picking step in this model.
 */
export function lessonSubtitle(lesson: Pick<SundaySchoolWeeklyLesson, "status" | "resources">): string {
  if (lesson.status === "UNASSIGNED") return "No teacher assigned";
  if (lesson.status === "NEEDS_LINKS") return "No links yet";
  return lesson.resources.map((resource) => resource.title).join(" · ");
}

export type MissingSummary = { needsLinks: number; unassigned: number };

/** Counts for the banner that tells a servant what still needs attention. */
export function missingSummary(lessons: Pick<SundaySchoolWeeklyLesson, "status">[]): MissingSummary {
  return {
    needsLinks: lessons.filter((lesson) => lesson.status === "NEEDS_LINKS").length,
    unassigned: lessons.filter((lesson) => lesson.status === "UNASSIGNED").length,
  };
}

/** Null when nothing is missing, so the banner simply does not render. */
export function missingSummaryLabel({ needsLinks, unassigned }: MissingSummary): string | null {
  const parts = [
    needsLinks ? `${needsLinks} ${needsLinks === 1 ? "needs" : "need"} links` : null,
    unassigned ? `${unassigned} without a teacher` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * The server's own flags decide what the signed-in user may do. The client
 * only hides controls the server would refuse anyway, so a stale or missing
 * flag can never grant more than the API allows.
 */
export function canOpenEditor(lesson: Pick<SundaySchoolWeeklyLesson, "canEdit" | "canAssignOwner">): boolean {
  return lesson.canEdit === true || lesson.canAssignOwner === true;
}

/** Only the human-readable host, for a secondary line. Never the full path or query. */
export function resourceHost(url: string): string | null {
  const href = safeHttpUrl(url);
  return href ? new URL(href).host : null;
}

export function resourceSubtitle(resource: { url: string }): string {
  const host = resourceHost(resource.url);
  return [resourceKind(resource), host].filter(Boolean).join(" · ");
}

export type LinkDraft = { title: string; url: string };

/**
 * Same rules the server enforces in `validateWeeklyLessonResources`, checked
 * before a request is sent so the servant can fix the draft in place. Returns
 * the first problem, or null when every link is usable.
 */
export function validateLinkDraft(links: LinkDraft[]): string | null {
  for (const link of links) {
    if (!link.title.trim() || !link.url.trim()) return "Each link needs a name and a web address.";
    if (!safeHttpUrl(link.url.trim())) return "Link addresses must start with https:// or http://.";
  }
  return null;
}

/** True when the draft differs from what was loaded, so Cancel can ask before discarding. */
export function isLessonDraftDirty(
  initial: { title: string; ownerId: string; links: LinkDraft[] },
  draft: { title: string; ownerId: string; links: LinkDraft[] },
): boolean {
  return (
    initial.title !== draft.title ||
    initial.ownerId !== draft.ownerId ||
    JSON.stringify(initial.links) !== JSON.stringify(draft.links)
  );
}
