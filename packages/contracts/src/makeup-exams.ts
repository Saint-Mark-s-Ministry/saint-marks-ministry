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
