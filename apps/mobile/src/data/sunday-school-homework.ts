/**
 * Pure logic for the Sunday School Elementary Homework screen (SMM-71,
 * porting PR #127's web implementation to iOS).
 *
 * Eligibility, authorization (`canEdit`/`canManage`), due dates, and each
 * week's own completion summary are all computed server-side
 * (app/api/sunday-school/homework/route.ts) and simply read here — this
 * app never re-derives "is this an Elementary class" or "can I edit this"
 * locally, matching this ticket's own "re-check through the API, not
 * locally cached navigation state." The one aggregation the real web page
 * itself computes client-side (not a separate endpoint) is school-year
 * history by child, ported verbatim below.
 */

import type {
  SundaySchoolHomeworkDisplayStatus,
  SundaySchoolHomeworkWeek,
} from "@stmark/contracts";
import { validateLinkDraft, type LinkDraft } from "./sunday-school-lessons";

export { validateLinkDraft, type LinkDraft };

export function completionLabel(status: SundaySchoolHomeworkDisplayStatus): string {
  if (status === "COMPLETED") return "Completed";
  if (status === "NOT_COMPLETED") return "Not completed";
  return "Not recorded";
}

export type CompletionTone = "success" | "danger" | "neutral";
export function completionTone(status: SundaySchoolHomeworkDisplayStatus): CompletionTone {
  if (status === "COMPLETED") return "success";
  if (status === "NOT_COMPLETED") return "danger";
  return "neutral";
}

type HomeworkCompletions = NonNullable<SundaySchoolHomeworkWeek["homework"]>["completions"];

export function statusFor(childId: string, completions: HomeworkCompletions): SundaySchoolHomeworkDisplayStatus {
  return completions.find((c) => c.childId === childId)?.status ?? "NOT_RECORDED";
}

/** The most relevant week to land on: the most recently assigned one that's already happened, or the earliest upcoming one otherwise. */
export function defaultWeekId(weeks: SundaySchoolHomeworkWeek[], today: string): string | null {
  if (!weeks.length) return null;
  const mostRecent = weeks.find((w) => w.assignedDate.slice(0, 10) <= today);
  return (mostRecent ?? weeks[weeks.length - 1]).weeklyLessonId;
}

export type HomeworkDraft = { title: string; instructions: string; links: LinkDraft[] };

export function emptyHomeworkDraft(): HomeworkDraft {
  return { title: "", instructions: "", links: [] };
}

export function draftFromWeek(week: SundaySchoolHomeworkWeek): HomeworkDraft {
  return {
    title: week.homework?.title ?? "",
    instructions: week.homework?.instructions ?? "",
    links: week.homework?.resources.map((r) => ({ title: r.title, url: r.url })) ?? [],
  };
}

/** Mirrors the real route's own required-title check, plus the shared link-validation rule. */
export function validateHomeworkDraft(draft: HomeworkDraft): string | null {
  if (!draft.title.trim()) return "Homework title is required.";
  return validateLinkDraft(draft.links);
}

export function isHomeworkDraftDirty(draft: HomeworkDraft, original: HomeworkDraft): boolean {
  return JSON.stringify(draft) !== JSON.stringify(original);
}

export interface ChildHomeworkHistory {
  id: string;
  firstName: string;
  lastName: string;
  completed: number;
  notCompleted: number;
  notRecorded: number;
  rate: number | null;
}

/**
 * Ports the real web page's own `history` useMemo verbatim (no separate
 * API for this) — completion counts and a completion rate per child
 * across every week currently loaded, excluding not-recorded weeks from
 * the rate.
 */
export function homeworkHistory(
  roster: Array<{ id: string; firstName: string; lastName: string }>,
  weeks: SundaySchoolHomeworkWeek[],
): ChildHomeworkHistory[] {
  const children = new Map(roster.map((child) => [child.id, child]));
  for (const week of weeks) {
    for (const completion of week.homework?.completions ?? []) {
      if (!children.has(completion.childId)) children.set(completion.childId, completion.child);
    }
  }
  return Array.from(children.values())
    .map((child) => {
      const statuses = weeks.flatMap((week) => {
        if (!week.homework) return [];
        return [statusFor(child.id, week.homework.completions)];
      });
      const completed = statuses.filter((s) => s === "COMPLETED").length;
      const notCompleted = statuses.filter((s) => s === "NOT_COMPLETED").length;
      const recorded = completed + notCompleted;
      return {
        ...child,
        completed,
        notCompleted,
        notRecorded: statuses.length - recorded,
        rate: recorded ? Math.round((completed / recorded) * 100) : null,
      };
    })
    .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`));
}
