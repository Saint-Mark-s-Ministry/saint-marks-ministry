/**
 * Pure logic for the student's Class lessons screen (SMM-89): which of the four
 * situations a student is in, and how lessons and their resources read.
 *
 * The class comes only from the response's `classes`, which the server derives
 * from the student's explicit serving-class assignment (async) or their
 * linked child record. The app never infers a class from a grade, and this
 * screen grants nothing: it is read-only lessons and links.
 */

import type { SundaySchoolClassRef, SundaySchoolWeeklyLesson, SundaySchoolWeeklyLessonsResponse } from "@stmark/contracts";

export type ClassLessonsResponse = SundaySchoolWeeklyLessonsResponse;

export type ClassLessonsView =
  | { kind: "lessons"; classes: SundaySchoolClassRef[]; lessons: SundaySchoolWeeklyLesson[] }
  | { kind: "no-lessons"; classes: SundaySchoolClassRef[] }
  | { kind: "unassigned" }
  | { kind: "unlinked" }
  | { kind: "complete" };

/**
 * Which state to show once data has loaded. A retryable request failure is not
 * one of these: an error never reads as "unassigned".
 */
export function classLessonsView(data: ClassLessonsResponse, isAsync: boolean): ClassLessonsView {
  const classes = data.classes ?? [];
  const lessons = data.lessons ?? [];
  if (lessons.length > 0) return { kind: "lessons", classes, lessons };
  if (classes.length > 0) return { kind: "no-lessons", classes };
  if (isAsync) {
    const finished =
      typeof data.completedRotations === "number" &&
      typeof data.requiredRotations === "number" &&
      data.requiredRotations > 0 &&
      data.completedRotations >= data.requiredRotations;
    return finished ? { kind: "complete" } : { kind: "unassigned" };
  }
  return { kind: "unlinked" };
}

export function classHeading(isAsync: boolean): string {
  return isAsync ? "Your serving class" : "Your class";
}

export function viewTitle(view: ClassLessonsView): string | null {
  switch (view.kind) {
    case "complete":
      return "All ten rotations complete";
    case "unassigned":
      return "No serving class assigned";
    case "unlinked":
      return "No class found";
    case "no-lessons":
      return "No upcoming class lessons";
    default:
      return null;
  }
}

export function viewMessage(view: ClassLessonsView): string | null {
  switch (view.kind) {
    case "complete":
      return "You have completed a signed four-week rotation at every grade from Pre-K through eighth grade.";
    case "unassigned":
      return "Ask a Servants Prep servant to link your active serving assignment to a Sunday School class.";
    case "unlinked":
      return "Your account may not be linked to a Sunday School child record. Ask your class coordinator to check the link.";
    case "no-lessons":
      return "Your assigned class has no upcoming lessons yet.";
    default:
      return null;
  }
}

/** "Sun, Oct 25 · Kindergarten - 2": the stored calendar day, never shifted by the device's time zone. */
export function lessonLabel(lesson: Pick<SundaySchoolWeeklyLesson, "sundayDate" | "class">): string {
  const day = new Date(`${lesson.sundayDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${day} · ${lesson.class.name}`;
}

export function lessonTitle(lesson: Pick<SundaySchoolWeeklyLesson, "title">): string {
  return lesson.title?.trim() || "Upcoming lesson";
}

export function lessonStatusLabel(status: SundaySchoolWeeklyLesson["status"]): { label: string; ready: boolean } {
  return status === "READY" ? { label: "Ready", ready: true } : { label: "Needs links", ready: false };
}

/** Only web links are opened from a lesson; anything else is shown but not tappable. */
export function isOpenableUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** The explicit serving class shown on the Sunday School screen, from the progress response. */
export type ServingClassSummary =
  | { kind: "assigned"; name: string }
  | { kind: "complete" }
  | { kind: "unassigned" };

export function servingClassSummary(progress: {
  completedRotations: number;
  requiredRotations: number;
  assignments: Array<{ isActive: boolean; class: { name: string } | null }>;
}): ServingClassSummary {
  const active = progress.assignments.find((assignment) => assignment.isActive && assignment.class);
  if (active?.class) return { kind: "assigned", name: active.class.name };
  if (progress.requiredRotations > 0 && progress.completedRotations >= progress.requiredRotations) {
    return { kind: "complete" };
  }
  return { kind: "unassigned" };
}
