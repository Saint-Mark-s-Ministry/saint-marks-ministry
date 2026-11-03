// GET/POST/DELETE /api/makeup-exams (docs/makeup-exams.md). Type-only: the server decides eligibility, the dates
// on offer and who may see what; nothing here defines times, locations, capacity or an approval step.

export type MakeupExamReason = "FAILED" | "MISSED";
export type MakeupExamYearLevel = "YEAR_1" | "YEAR_2" | "BOTH";

export interface MakeupExamSummary {
  id: string;
  /** ISO timestamp at UTC midnight; the calendar day is the first ten characters. */
  examDate: string;
  yearLevel: MakeupExamYearLevel;
  examSection: { displayName: string; passingScore: number };
  academicYear: { name: string };
}

/** An exam the signed-in student may schedule: failed (below the section's passing score) or not taken. */
export interface EligibleMakeupExam extends MakeupExamSummary {
  reason: MakeupExamReason;
  /** The student's current percentage, or null when the exam was missed. */
  currentPercentage: number | null;
}

export interface MakeupExamBooking {
  id: string;
  /** ISO timestamp at UTC midnight of the booked Friday. */
  scheduledDate: string;
  exam: MakeupExamSummary;
  /** Only in the staff list. */
  student?: { name: string; email: string };
}

export interface MakeupExamsResponse {
  /** Eligible exams for a student; always empty for staff. */
  exams: EligibleMakeupExam[];
  /** A student's own bookings (past ones stay as history), or every student's for staff; ordered by Friday. */
  bookings: MakeupExamBooking[];
  /** The next 12 Fridays after today's New York calendar date, as `YYYY-MM-DD`. */
  fridays: string[];
}

export interface MakeupExamBookRequest {
  examId: string;
  /** One of `fridays`. Booking an exam that already has a booking reschedules it. */
  scheduledDate: string;
}

export interface MakeupExamCancelRequest {
  id: string;
}

// ---- Makeup exam scores (docs/makeup-exams.md, "Makeup exam scores"): GET/POST/PATCH /api/exams/[id]/makeup-scores ----

/** One recorded retake. Attempts never overwrite the original grade; the server keeps the best percentage as the effective result. */
export interface MakeupScoreAttempt {
  id: string;
  version: 1 | 2;
  score: number;
  /** The points this makeup version was out of; it can differ from the exam's own total. */
  totalPoints: number;
  /** score / totalPoints × 100, computed by the server. */
  percentage: number;
  /** ISO timestamp at UTC midnight of the date the makeup exam was taken. */
  takenDate: string;
  notes: string | null;
}

export interface MakeupScoreStudent {
  id: string;
  name: string;
  /** The original grade as a percentage; null for a missed exam (a makeup-only result). */
  originalPercentage: number | null;
  /** The highest percentage from the original and every attempt; what progress and graduation use. Null with no result at all. */
  effectivePercentage: number | null;
  /** Newest first. */
  attempts: MakeupScoreAttempt[];
}

export interface MakeupScoresResponse {
  exam: { id: string; examDate: string; totalPoints: number; yearLevel: MakeupExamYearLevel; examSection: { displayName: string; passingScore: number } };
  students: MakeupScoreStudent[];
}

/** POST adds an attempt; PATCH (with `attemptId`) corrects one. */
export interface MakeupScoreRequest {
  studentId: string;
  version: 1 | 2;
  score: number;
  totalPoints: number;
  /** `YYYY-MM-DD`, on or before today (New York) and not before the exam date. */
  takenDate: string;
  notes?: string | null;
  attemptId?: string;
}

/** A row of GET /api/exams/[id]/scores: the original grade and the effective best are separate fields. */
export interface ExamScoreResult {
  id: string;
  studentId: string;
  /** The effective best result, in the exam's points: never the original editor's value. */
  score: number;
  percentage: number;
  /** The original grade; null when the exam was missed and only a makeup exists. */
  originalScore: number | null;
  originalPercentage: number | null;
}
