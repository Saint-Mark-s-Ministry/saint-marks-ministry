/**
 * Pure logic for the student "My lessons" screen (SMM-45), kept out of the
 * component so the upcoming/completed split, search, attendance wording,
 * summary counts, link safety, and time formatting are unit-testable.
 *
 * Times are formatted in the device's locale and time zone (no fixed zone),
 * so a lesson reads the same wall-clock time the student sees everywhere else.
 */

export type LessonStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_CLASS";
export type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";

export type LessonResource = { id: string; title: string; url: string; type?: string | null; createdAt: string };

export type StudentLesson = {
  id: string;
  title: string | null;
  subtitle?: string | null;
  speaker?: string | null;
  lessonNumber: number;
  scheduledDate: string;
  status: LessonStatus;
  cancellationReason?: string | null;
  examSection?: { displayName: string } | null;
  resources: LessonResource[];
  attendance: { status: AttendanceStatus } | null;
};

export type LessonTab = "upcoming" | "completed" | "all";

export const TAB_LABEL: Record<LessonTab, string> = { upcoming: "Upcoming", completed: "Completed", all: "All" };

/** Midnight at the start of `now`'s day, in the device's time zone. */
export function startOfLocalDay(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function isPast(lesson: StudentLesson, now: Date): boolean {
  return Date.parse(lesson.scheduledDate) < startOfLocalDay(now);
}

/** Upcoming: not yet held and not marked completed. Completed: already held, or marked completed. */
export function inTab(lesson: StudentLesson, tab: LessonTab, now: Date): boolean {
  if (tab === "all") return true;
  const past = isPast(lesson, now) || lesson.status === "COMPLETED";
  return tab === "completed" ? past : !past;
}

/** Upcoming soonest first; completed most recent first. */
export function lessonsForTab(lessons: StudentLesson[], tab: LessonTab, now: Date): StudentLesson[] {
  const rows = lessons.filter((l) => l.status !== "NO_CLASS" && inTab(l, tab, now));
  const byDate = (a: StudentLesson, b: StudentLesson) => Date.parse(a.scheduledDate) - Date.parse(b.scheduledDate);
  if (tab === "completed") return [...rows].sort((a, b) => byDate(b, a));
  return [...rows].sort(byDate);
}

export function searchLessons(lessons: StudentLesson[], query: string): StudentLesson[] {
  const q = query.trim().toLowerCase();
  if (!q) return lessons;
  return lessons.filter((l) =>
    [l.title, l.speaker, `lesson ${l.lessonNumber}`, l.examSection?.displayName]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(q)),
  );
}

/** The one word a student sees for a lesson's state. Always text, never color alone. */
export function attendanceLabel(lesson: StudentLesson, now: Date): string {
  if (lesson.status === "CANCELLED") return "Cancelled";
  if (lesson.attendance) {
    return { PRESENT: "Present", LATE: "Late", ABSENT: "Absent", EXCUSED: "Excused" }[lesson.attendance.status];
  }
  if (lesson.status === "COMPLETED" || isPast(lesson, now)) return "Not recorded";
  return "Upcoming";
}

export function summary(lessons: StudentLesson[]) {
  const held = lessons.filter((l) => l.status !== "CANCELLED" && l.status !== "NO_CLASS");
  const counted = held.filter((l) => l.attendance && l.attendance.status !== "EXCUSED");
  const attended = counted.filter((l) => l.attendance!.status === "PRESENT" || l.attendance!.status === "LATE").length;
  return {
    total: held.length,
    completed: lessons.filter((l) => l.status === "COMPLETED").length,
    attended,
    counted: counted.length,
  };
}

const NEW_MATERIAL_DAYS = 7;
/** Materials added in the last week get a "New" marker. Resources have no updatedAt, so creation is the only signal. */
export function isNewMaterial(resource: Pick<LessonResource, "createdAt">, now: Date): boolean {
  const age = now.getTime() - Date.parse(resource.createdAt);
  return age >= 0 && age < NEW_MATERIAL_DAYS * 24 * 60 * 60 * 1000;
}

export function resourceKind(resource: Pick<LessonResource, "url" | "type">): "PDF" | "Document" | "Slides" | "Link" {
  const hint = `${resource.type ?? ""} ${resource.url}`.toLowerCase();
  if (/\.pdf\b|application\/pdf|\bpdf\b/.test(hint)) return "PDF";
  if (/\.(docx?|pages|rtf)\b/.test(hint)) return "Document";
  if (/\.(pptx?|key)\b/.test(hint)) return "Slides";
  return "Link";
}

/** Only http(s) links are opened. Anything else is refused rather than handed to the system. */
export function safeHttpUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export function formatLessonWhen(iso: string, locale?: string): string {
  return new Date(iso).toLocaleString(locale, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "Saved 5 min ago", for the stale-data label. */
export function savedLabel(updatedAt: number, now: Date, locale?: string): string {
  const seconds = Math.round((updatedAt - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return "Saved just now";
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return `Saved ${rtf.format(minutes, "minute")}`;
  return `Saved ${rtf.format(Math.round(minutes / 60), "hour")}`;
}

/** Only the signed-in student's own lessons can be listed from this screen. */
export function canViewOwnLessons(role?: string | null): boolean {
  return role === "STUDENT";
}
