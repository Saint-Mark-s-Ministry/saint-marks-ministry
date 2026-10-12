/**
 * Pure logic for the Servants Prep Curriculum list, lesson detail, and the
 * shared create/edit lesson form (SMM-38), pulled out of the screen
 * components so status labeling, filtering, speaker suggestions, and form
 * validation are unit-testable without rendering native UI.
 */

export { canManageAttendance as canManageCurriculum } from "./prep-attendance";

export type LessonStatus = "SCHEDULED" | "CANCELLED" | "NO_CLASS" | "COMPLETED";
export type LessonListItem = {
  id: string;
  title: string | null;
  scheduledDate: string;
  status: LessonStatus;
  isExamDay?: boolean;
  lessonNumber: number;
  speaker?: string | null;
  examSection?: { id: string; displayName: string } | null;
};

export type LessonBadge = "Done" | "Next" | "Cancelled" | "No class" | "Exam" | null;

/** The next non-completed, non-cancelled, today-or-later lesson — the one that gets the "Next" badge. */
export function nextLessonId(lessons: LessonListItem[], today: string): string | null {
  const next = lessons.find((l) => l.status === "SCHEDULED" && !l.isExamDay && l.scheduledDate.slice(0, 10) >= today);
  return next?.id ?? null;
}

export function lessonBadge(lesson: LessonListItem, nextId: string | null): LessonBadge {
  if (lesson.isExamDay) return "Exam";
  if (lesson.status === "COMPLETED") return "Done";
  if (lesson.id === nextId) return "Next";
  if (lesson.status === "CANCELLED") return "Cancelled";
  if (lesson.status === "NO_CLASS") return "No class";
  return null;
}

/** The distinct exam sections actually in use among the lessons, for the segmented filter — never a fabricated fixed list. */
export function sectionsInUse(lessons: LessonListItem[]): { id: string; displayName: string }[] {
  const seen = new Map<string, string>();
  for (const l of lessons) {
    if (l.examSection) seen.set(l.examSection.id, l.examSection.displayName);
  }
  return [...seen.entries()].map(([id, displayName]) => ({ id, displayName })).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function filterLessonsBySection(lessons: LessonListItem[], sectionId: string | null): LessonListItem[] {
  if (!sectionId) return lessons;
  return lessons.filter((l) => l.examSection?.id === sectionId);
}

export function searchLessons(lessons: LessonListItem[], query: string): LessonListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return lessons;
  return lessons.filter((l) => (l.title ?? "").toLowerCase().includes(q) || (l.speaker ?? "").toLowerCase().includes(q));
}

/** Distinct, real speaker names already used, most-recent-first — the only honest source for "speaker selection" (speaker is a free-text field, not a relation). */
export function speakerSuggestions(lessons: LessonListItem[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of [...lessons].sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate))) {
    const name = l.speaker?.trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

export type LessonFormValues = {
  title: string;
  subtitle: string;
  examSectionId: string;
  scheduledDate: Date;
  speaker: string;
  isExamDay: boolean;
  description: string;
};

/** Matches the server's own "Missing required fields" rule in POST /api/lessons. */
export function validateLessonForm(values: Pick<LessonFormValues, "title" | "examSectionId">): string | null {
  if (!values.title.trim()) return "A topic title is required.";
  if (!values.examSectionId) return "Choose a section.";
  return null;
}

/** True if any field differs from the form's initial snapshot — gates the "discard changes?" prompt on dismiss. */
export function formIsDirty(initial: LessonFormValues, current: LessonFormValues): boolean {
  return (
    initial.title !== current.title ||
    initial.subtitle !== current.subtitle ||
    initial.examSectionId !== current.examSectionId ||
    initial.scheduledDate.getTime() !== current.scheduledDate.getTime() ||
    initial.speaker !== current.speaker ||
    initial.isExamDay !== current.isExamDay ||
    initial.description !== current.description
  );
}

export function isSafeResourceUrl(url: string): boolean {
  return /^https:\/\//i.test(url.trim()) || /^http:\/\//i.test(url.trim());
}
