/**
 * Pure logic for the student "My progress" screen (SMM-44), pulled out of the
 * screen component so thresholds, the what-to-do-next guidance, the next-lesson
 * pick, and confession labels are unit-testable without rendering native UI.
 *
 * Guidance is a port of lib/graduation-guidance.ts (the web student dashboard);
 * keep the two in step when the rules change.
 */

export const ATTENDANCE_GOAL = 75;
export const EXAM_GOAL = 75;
export const SECTION_MINIMUM = 60;

export type ProgressAnalytics = {
  enrollment: {
    yearLevel: "YEAR_1" | "YEAR_2";
    isAsyncStudent: boolean;
    mentor: { id: string; name: string; email: string; phone: string | null } | null;
    fatherOfConfession: { id: string; name: string; phone: string | null; church: string | null } | null;
    student: { id: string; name: string; email: string };
  };
  attendance: {
    percentage: number | null;
    effectivePresent: number;
    totalLessons: number;
    allLessons: number;
    excusedCount: number;
    met: boolean;
    required: number;
  };
  exams: {
    overallAverage: number | null;
    overallAverageMet: boolean;
    allSectionsPassing: boolean;
    sectionAverages: { section: string; average: number; passingMet: boolean }[];
    missingExams: { id: string; sectionDisplayName: string }[];
    examsTaken: number;
    totalApplicableExams: number;
    requiredAverage: number;
  };
  graduation: {
    eligible: boolean;
    attendanceMet: boolean;
    overallAverageMet: boolean;
    allSectionsPassing: boolean;
    sundaySchoolMet?: boolean;
  };
};

export type ConfessionStatus = "na" | "registration" | "slip" | "missing" | "due" | "upcoming";
export type ConfessionPeriodView = { start: string; end: string; status: ConfessionStatus; uploadedAt: string | null };
export type ConfessionResponse = {
  academicYear: { id: string; name: string } | null;
  periods: ConfessionPeriodView[];
};

export type LessonItem = {
  id: string;
  title: string | null;
  lessonNumber: number;
  scheduledDate: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_CLASS";
  attendance: { status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED" } | null;
};

export type GuidanceStatus = "on-track" | "at-risk" | "failing" | "no-data";
export type Guidance = { status: GuidanceStatus; message: string; detail?: string };

export const GUIDANCE_LABEL: Record<GuidanceStatus, string> = {
  "on-track": "On track",
  "at-risk": "At risk",
  failing: "Below goal",
  "no-data": "No data yet",
};

/** "On track" or "Needs attention": the server's graduation.eligible, in plain words. */
export function standingLabel(eligible: boolean): "On track" | "Needs attention" {
  return eligible ? "On track" : "Needs attention";
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function attendanceGuidance(a: ProgressAnalytics["attendance"]): Guidance {
  const denom = a.allLessons - a.excusedCount;
  if (denom <= 0 || a.percentage === null) {
    return { status: "no-data", message: "No attendance recorded yet" };
  }
  const required = a.required / 100;
  const effective = a.effectivePresent;

  if (a.met) {
    // (effective) / (denom + n) >= required  →  n <= effective/required - denom
    const buffer = Math.floor(effective / required - denom);
    if (buffer <= 0) {
      return { status: "on-track", message: "Just above the line", detail: `Any further absence will drop you below ${a.required}%` };
    }
    return {
      status: "on-track",
      message: `${plural(buffer, "absence")} of buffer remaining`,
      detail: `You can miss up to ${plural(buffer, "more lesson")} before dropping below ${a.required}%`,
    };
  }

  // (effective + n) / (denom + n) >= required  →  n >= (required*denom - effective) / (1 - required)
  const needed = Math.ceil((required * denom - effective) / (1 - required));
  if (needed > 0 && Number.isFinite(needed)) {
    return {
      status: "failing",
      message: `Attend the next ${plural(needed, "lesson")} in a row to recover`,
      detail: `Currently ${(a.percentage ?? 0).toFixed(1)}%. Target is ${a.required}%.`,
    };
  }
  return { status: "failing", message: `Below ${a.required}% threshold`, detail: `Currently ${(a.percentage ?? 0).toFixed(1)}%` };
}

export function examGuidance(e: ProgressAnalytics["exams"]): Guidance {
  const taken = e.examsTaken;
  const missing = e.missingExams.length;
  const totalExams = taken + missing;
  const target = e.requiredAverage;

  if (taken === 0 && missing === 0) {
    return { status: "no-data", message: "No exams scheduled yet" };
  }

  if (e.overallAverageMet) {
    if (missing === 0) {
      return { status: "on-track", message: "All exams complete, average met" };
    }
    const currentSum = (e.overallAverage ?? 0) * taken;
    const minAvg = (target * totalExams - currentSum) / missing;
    if (minAvg <= 0) {
      return { status: "on-track", message: `${plural(missing, "exam")} remaining. Your average is locked in` };
    }
    return {
      status: "on-track",
      message: `Score ${Math.ceil(minAvg)}% or higher on the remaining ${plural(missing, "exam")} to stay on track`,
      detail: `${plural(missing, "exam")} remaining`,
    };
  }

  if (missing === 0) {
    return {
      status: "failing",
      message: "Average below target with no exams remaining",
      detail: `Currently ${(e.overallAverage ?? 0).toFixed(1)}%, need ${target}%`,
    };
  }

  const currentSum = (e.overallAverage ?? 0) * taken;
  const needed = (target * totalExams - currentSum) / missing;
  if (needed > 100) {
    return { status: "failing", message: "Out of reach: the remaining exams can't lift the average to target", detail: `Currently ${(e.overallAverage ?? 0).toFixed(1)}%` };
  }
  return {
    status: "at-risk",
    message: `Average ${Math.ceil(needed)}% or higher on the remaining ${plural(missing, "exam")}`,
    detail: `Currently ${(e.overallAverage ?? 0).toFixed(1)}%, target ${target}%`,
  };
}

/** The earliest lesson that hasn't happened yet (scheduled on or after today, not completed). */
export function nextLesson(lessons: LessonItem[], today: string): LessonItem | null {
  const upcoming = lessons
    .filter((l) => l.status === "SCHEDULED" && l.scheduledDate.slice(0, 10) >= today)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  return upcoming[0] ?? null;
}

const MARK_LABEL: Record<NonNullable<LessonItem["attendance"]>["status"], { mark: string; word: string }> = {
  PRESENT: { mark: "P", word: "Present" },
  LATE: { mark: "L", word: "Late" },
  ABSENT: { mark: "A", word: "Absent" },
  EXCUSED: { mark: "E", word: "Excused" },
};

/**
 * The most recent recorded lessons, oldest first. Each mark carries a letter and
 * a word so the trend reads without relying on color.
 */
export function recentMarks(lessons: LessonItem[], limit = 10) {
  return lessons
    .filter((l) => l.attendance)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
    .slice(-limit)
    .map((l) => ({ id: l.id, date: l.scheduledDate, ...MARK_LABEL[l.attendance!.status] }));
}

export const CONFESSION_LABEL: Record<ConfessionStatus, string> = {
  slip: "Confessed",
  due: "Due",
  missing: "Missing",
  registration: "Covered by registration",
  upcoming: "Upcoming",
  na: "Not applicable",
};

/** The period that contains `now`, if any. */
export function currentConfessionPeriod(periods: ConfessionPeriodView[], now: Date): ConfessionPeriodView | null {
  const t = now.getTime();
  return periods.find((p) => Date.parse(p.start) <= t && t < Date.parse(p.end)) ?? null;
}

/** The last day of a period, as the student reads it ("Oct 31"). `end` is exclusive, so that's one day earlier. */
export function periodLastDay(period: Pick<ConfessionPeriodView, "end">): string {
  const last = new Date(Date.parse(period.end) - 1);
  return last.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** The period's span as the student reads it, e.g. "Sep–Oct 2026". */
export function periodTitle(period: Pick<ConfessionPeriodView, "start" | "end">): string {
  const start = new Date(period.start);
  const last = new Date(Date.parse(period.end) - 1);
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${month(start)}–${month(last)} ${last.getUTCFullYear()}`;
}

/** Only the student's own record can be requested from this screen. */
export function canViewOwnProgress(role?: string | null): boolean {
  return role === "STUDENT";
}
