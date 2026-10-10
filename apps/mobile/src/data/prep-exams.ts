/**
 * Pure logic for the Servants Prep Exams list + score entry (SMM-37), pulled
 * out of the screen components so grouping, filtering, and score validation
 * are unit-testable without rendering native UI.
 */

export { canManageAttendance as canManageExams } from "./prep-attendance";
export { atRiskTone as scoreTone } from "./prep-home";

export type ExamListItem = {
  id: string;
  examDate: string;
  totalPoints: number;
  yearLevel: string;
  examSection: { displayName: string } | null;
  academicYear: { id: string; name: string } | null;
  _count: { scores: number };
};

/** Matches the server's own exactly-worded rules in /api/exam-scores/[id] (PATCH) and /api/exams/[id]/scores (POST). */
export function validateScore(raw: string, totalPoints: number): { value: number | null; error: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, error: null };
  const value = Number(trimmed);
  if (Number.isNaN(value)) return { value: null, error: "Score must be a valid number" };
  if (value < 0) return { value: null, error: "Score cannot be negative" };
  if (value > totalPoints) return { value: null, error: `Score cannot exceed total points (${totalPoints})` };
  return { value, error: null };
}

export type YearGroup = { academicYear: { id: string; name: string }; exams: ExamListItem[]; totalScores: number };

/** Groups past exams by academic year, newest year first, for the "Past years" list. */
export function groupExamsByYear(exams: ExamListItem[]): YearGroup[] {
  const groups = new Map<string, YearGroup>();
  for (const exam of exams) {
    if (!exam.academicYear) continue;
    const key = exam.academicYear.id;
    const group = groups.get(key) ?? { academicYear: exam.academicYear, exams: [], totalScores: 0 };
    group.exams.push(exam);
    group.totalScores += exam._count.scores;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.academicYear.name.localeCompare(a.academicYear.name));
}

export type ExamYearFilter = "YEAR_2" | "YEAR_1" | "all";
export function filterExamsByYear(exams: ExamListItem[], filter: ExamYearFilter): ExamListItem[] {
  if (filter === "all") return exams;
  return exams.filter((e) => e.yearLevel === filter || e.yearLevel === "BOTH");
}

/**
 * Matches the design source's "the number pad moves to the next student
 * after two digits": advances once 2 digits are in, except when exactly
 * "10" was typed and a 3rd digit could still complete a valid 3-digit score
 * (typically 100) — otherwise typing "100" would always get cut off at "10".
 */
export function shouldAdvanceFocus(text: string, totalPoints: number): boolean {
  if (text.length < 2) return false;
  if (text.length >= String(totalPoints).length) return true;
  if (text === "10" && totalPoints >= 100) return false;
  return text.length === 2;
}

export type ScoreRosterSegment = "all" | "notEntered" | "mentees";
export type ScoreRow = { studentId: string; score: number | null; mentorId?: string | null };

export function filterScoreRoster<T extends ScoreRow>(rows: T[], segment: ScoreRosterSegment, viewerId?: string): T[] {
  if (segment === "notEntered") return rows.filter((r) => (r.score === null || r.score === undefined));
  if (segment === "mentees") return rows.filter((r) => r.mentorId === viewerId);
  return rows;
}

export function scoreRosterCounts(rows: ScoreRow[], viewerId?: string) {
  return {
    all: rows.length,
    notEntered: rows.filter((r) => (r.score === null || r.score === undefined)).length,
    mentees: rows.filter((r) => r.mentorId === viewerId).length,
  };
}
