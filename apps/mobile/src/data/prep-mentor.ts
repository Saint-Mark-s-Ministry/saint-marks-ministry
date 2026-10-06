/**
 * Pure logic for the Mentor Dashboard, My Mentees, and Mentee detail screens
 * (SMM-43), pulled out of the screen components so risk classification,
 * search/sort/filter, and graduation-requirement math are unit-testable
 * without rendering native UI.
 */

export { isAdminLike } from "./prep-home";
export { canViewStudentRoster as canViewMentees } from "./prep-students";

/**
 * Phone numbers are only ever returned by /api/students/[id]/details,
 * which is isAdmin-only server-side (SUPER_ADMIN/PRIEST/SERVANT_PREP) — a
 * real MENTOR account has no endpoint that returns a mentee's phone number
 * at all. Call/Message are gated on this; Email always works (it's on the
 * enrollments list response, which MENTOR can call for their own mentees).
 */
export function canViewPhone(role?: string | null): boolean {
  return !!role && ["SUPER_ADMIN", "PRIEST", "SERVANT_PREP"].includes(role);
}

export type MentorMentee = {
  id: string;
  studentId: string;
  yearLevel: string;
  status: string;
  isActive: boolean;
  student: { id: string; name: string; email: string; profileImageUrl?: string | null };
  fatherOfConfession: { id: string; name: string; phone: string | null; church: string | null } | null;
};

export type StudentAnalyticsFlat = {
  studentId: string;
  attendancePercentage: number | null;
  examAverage: number | null;
  examCount: number;
  graduationEligible: boolean;
  attendanceMet: boolean;
  examAverageMet: boolean;
  allSectionsMet: boolean;
  sectionAverages: Record<string, number>;
};

/** Averages each mentee's own per-section score into one class-vs-mentees comparison, matching the web dashboard's own menteeSectionAverages aggregation exactly. */
export function aggregateSectionAverages(rows: { sectionAverages: Record<string, number> }[]): Record<string, number> {
  const totals = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    for (const [section, avg] of Object.entries(row.sectionAverages)) {
      const entry = totals.get(section) ?? { sum: 0, count: 0 };
      entry.sum += avg;
      entry.count += 1;
      totals.set(section, entry);
    }
  }
  return Object.fromEntries([...totals.entries()].map(([section, { sum, count }]) => [section, sum / count]));
}

export function riskLabel(graduationEligible: boolean): "On track" | "At risk" {
  return graduationEligible ? "On track" : "At risk";
}

/** Server returns `null` average when a mentee has zero applicable scores yet — never divide/format against that. */
export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

export function diff(menteesAvg: number | null, classAvg: number | null): number | null {
  if (menteesAvg === null || classAvg === null) return null;
  return menteesAvg - classAvg;
}

export function formatDiff(value: number | null): string {
  if (value === null) return "—";
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}`;
}

/** Mentees' own average across whichever of them have a non-null exam average — excludes those with none, same as the web dashboard. */
export function menteesAverage(rows: { examAverage: number | null }[]): number | null {
  const withScores = rows.filter((r) => r.examAverage !== null);
  if (!withScores.length) return null;
  return withScores.reduce((sum, r) => sum + (r.examAverage ?? 0), 0) / withScores.length;
}

export type ClassSection = { sectionId: string; sectionName: string; displayName: string; average: number | null };

/**
 * Per-section class-vs-mentees diff bars — needs each mentee's own
 * per-section averages (from /api/students/[id]/analytics, not the batch
 * endpoint, which only returns the overall average). Dashboard/My-Mentees
 * fetch one analytics call per visible mentee section comparison the same
 * way the real web dashboard does — small lists in practice (a mentor's
 * caseload), not a true N+1 concern.
 */
export function sectionDiffs(
  classSections: ClassSection[],
  menteeSectionAverages: Record<string, number>,
): { sectionId: string; displayName: string; diff: number | null }[] {
  return classSections.map((section) => ({
    sectionId: section.sectionId,
    displayName: section.displayName,
    diff:
      section.average !== null && menteeSectionAverages[section.sectionName] !== undefined
        ? menteeSectionAverages[section.sectionName] - section.average
        : null,
  }));
}

export type MenteeFilter = "all" | "atRisk" | "onTrack";

export function filterMentees<T extends { graduationEligible: boolean }>(rows: T[], filter: MenteeFilter): T[] {
  if (filter === "atRisk") return rows.filter((r) => !r.graduationEligible);
  if (filter === "onTrack") return rows.filter((r) => r.graduationEligible);
  return rows;
}

export function searchMentees<T extends { name: string }>(rows: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.name.toLowerCase().includes(q));
}

export type MenteeSort = "name" | "attendance" | "exam" | "risk";

export function sortMentees<T extends { name: string; attendancePercentage: number | null; examAverage: number | null; graduationEligible: boolean }>(
  rows: T[],
  sort: MenteeSort,
): T[] {
  const sorted = [...rows];
  if (sort === "name") return sorted.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "attendance") return sorted.sort((a, b) => (a.attendancePercentage ?? -1) - (b.attendancePercentage ?? -1));
  if (sort === "exam") return sorted.sort((a, b) => (a.examAverage ?? -1) - (b.examAverage ?? -1));
  // "risk": at-risk mentees first, so the ones needing attention surface at the top.
  return sorted.sort((a, b) => Number(a.graduationEligible) - Number(b.graduationEligible));
}

/** "Attendance ≥75%: N of M mentees" / "Exam average ≥75%: N of M mentees" — both real, from the batch analytics' own booleans. */
export function graduationCounts(rows: { attendanceMet: boolean; examAverageMet: boolean }[]): {
  attendance: { met: number; total: number };
  exam: { met: number; total: number };
} {
  return {
    attendance: { met: rows.filter((r) => r.attendanceMet).length, total: rows.length },
    exam: { met: rows.filter((r) => r.examAverageMet).length, total: rows.length },
  };
}

export type SectionAverage = { section: string; displayName: string; average: number; passingMet: boolean };

/** The artboard names one specific failing section ("[Section B] 55%") — the lowest-scoring one that isn't passing, not just the first. */
export function worstFailingSection(sections: SectionAverage[]): SectionAverage | null {
  const failing = sections.filter((s) => !s.passingMet);
  if (!failing.length) return null;
  return failing.reduce((worst, s) => (s.average < worst.average ? s : worst));
}

/**
 * The server re-checks "is this still your mentee" at request time on every
 * mentee-scoped write (notes, analytics) — the exact reassignment-race
 * protection the ticket's acceptance criteria asks for. This recognizes
 * that specific denial so the UI can show a clear message instead of a
 * generic error.
 */
export function isReassignmentError(message: string | undefined): boolean {
  return !!message && message.includes("not this student's mentor");
}
