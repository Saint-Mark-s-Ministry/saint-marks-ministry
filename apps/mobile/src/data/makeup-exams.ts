// Makeup Exams (SMM-113), the native counterpart of the web's components/makeup-exam-bookings.tsx. Pure rules, so each
// one is testable without a screen. The server decides eligibility, the Fridays on offer and who may see the staff list
// (app/api/makeup-exams); nothing here grants anything or invents a time, place, capacity or approval step.

import type {
  EligibleMakeupExam,
  MakeupExamBooking,
  MakeupExamBookRequest,
  MakeupExamSummary,
  MakeupExamsResponse,
  MakeupExamYearLevel,
} from "@stmark/contracts";
import { formatPercent } from "./format-percent";

export const MAKEUP_EXAMS_PATH = "/api/makeup-exams";

/** Students book for themselves. */
export const isMakeupStudent = (role?: string | null) => role === "STUDENT";
/** The staff list is for the same people the API treats as staff: administrators, priests and Servants Prep servants. A mentor or a Sunday School servant has neither tag, so the API refuses them. */
export const canViewMakeupBookings = (role?: string | null) =>
  role === "SUPER_ADMIN" || role === "PRIEST" || role === "SERVANT_PREP";

export const dayOf = (iso: string) => iso.slice(0, 10);

/** "Fri, Nov 6, 2026", read in UTC so the phone's own time zone never moves the day. */
export function dayLabel(day: string, weekday: "short" | "long" = "short"): string {
  return new Date(`${dayOf(day)}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday,
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const YEARS: Record<MakeupExamYearLevel, string> = { YEAR_1: "Year 1", YEAR_2: "Year 2", BOTH: "Both years" };

/** Section name, then where it sits: "Year 1 · 2026–2027 · Exam Oct 4, 2026". */
export function examTitle(exam: MakeupExamSummary): string {
  return exam.examSection.displayName;
}
export function examDetail(exam: MakeupExamSummary): string {
  return `${YEARS[exam.yearLevel] ?? exam.yearLevel} · ${exam.academicYear.name} · Exam ${dayLabel(exam.examDate)}`;
}

/** "72.5% · passing 80%" for a failed exam, "Not taken" for a missed one. */
export function resultLabel(exam: EligibleMakeupExam): string {
  return exam.reason === "FAILED"
    ? `${formatPercent(exam.currentPercentage)} · passing ${formatPercent(exam.examSection.passingScore)}`
    : "Not taken";
}

/** Failed exams first, then missed ones, each in the order the API sent them. */
export function groupEligible(exams: EligibleMakeupExam[]): { reason: "FAILED" | "MISSED"; title: string; exams: EligibleMakeupExam[] }[] {
  return (["FAILED", "MISSED"] as const)
    .map((reason) => ({
      reason,
      title: reason === "FAILED" ? "Failed exams" : "Missed exams",
      exams: exams.filter((exam) => exam.reason === reason),
    }))
    .filter((group) => group.exams.length > 0);
}

/** A booking can be cancelled while its Friday is after today at the church (the server's own rule). */
export const canCancel = (booking: Pick<MakeupExamBooking, "scheduledDate">, today: string) => dayOf(booking.scheduledDate) > today;

/** Upcoming (after today) and past bookings, each ordered by Friday. Past bookings stay as history. */
export function splitBookings<T extends Pick<MakeupExamBooking, "scheduledDate">>(bookings: T[], today: string) {
  const byDay = (a: T, b: T) => dayOf(a.scheduledDate).localeCompare(dayOf(b.scheduledDate));
  const sorted = [...bookings].sort(byDay);
  return {
    upcoming: sorted.filter((booking) => dayOf(booking.scheduledDate) > today),
    past: sorted.filter((booking) => dayOf(booking.scheduledDate) <= today),
  };
}

/** The staff list: ordered by Friday, then by student name, so a day's bookings read together. */
export function staffBookings(bookings: MakeupExamBooking[], today: string) {
  const name = (booking: MakeupExamBooking) => booking.student?.name ?? "";
  const sorted = [...bookings].sort(
    (a, b) => dayOf(a.scheduledDate).localeCompare(dayOf(b.scheduledDate)) || name(a).localeCompare(name(b)),
  );
  return {
    upcoming: sorted.filter((booking) => dayOf(booking.scheduledDate) > today),
    past: sorted.filter((booking) => dayOf(booking.scheduledDate) <= today),
  };
}

/** The booking an exam already has, if any (a second save for it reschedules). */
export const bookingForExam = (examId: string, bookings: MakeupExamBooking[]) =>
  bookings.find((booking) => booking.exam.id === examId);

export type Selection = { examId: string; friday: string };

/**
 * What to keep of a selection after fresh data arrives: an exam that is no longer eligible, or a Friday that has left the
 * window (the New York day moved on), is dropped; the rest stays so nothing the person chose is lost for no reason.
 */
export function reconcileSelection(selection: Selection, data: Pick<MakeupExamsResponse, "exams" | "fridays">): Selection {
  return {
    examId: data.exams.some((exam) => exam.id === selection.examId) ? selection.examId : "",
    friday: data.fridays.includes(selection.friday) ? selection.friday : "",
  };
}

export type BookingCheck = { ok: true; body: MakeupExamBookRequest } | { ok: false; error: string };

/** The form's own check against what the API last offered; the server repeats it. */
export function checkBooking(selection: Selection, data: Pick<MakeupExamsResponse, "exams" | "fridays">): BookingCheck {
  if (!selection.examId) return { ok: false, error: "Choose an exam." };
  if (!selection.friday) return { ok: false, error: "Choose a Friday." };
  if (!data.exams.some((exam) => exam.id === selection.examId)) return { ok: false, error: "This exam is not eligible for a makeup." };
  if (!data.fridays.includes(selection.friday)) return { ok: false, error: "Choose one of the available Fridays." };
  return { ok: true, body: { examId: selection.examId, scheduledDate: selection.friday } };
}

export type BookingFailureKind = "ineligible" | "friday" | "already" | "forbidden" | "missing" | "offline" | "other";

/** What went wrong in words a student can act on, and whether the list must be reloaded to stay truthful. */
export function bookingFailure(error: unknown): { kind: BookingFailureKind; message: string; reload: boolean } {
  const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : null;
  const message = error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.";
  if (status === 400 && /not eligible/i.test(message))
    return { kind: "ineligible", message: "This exam is no longer eligible for a makeup, so it has been taken off the list.", reload: true };
  if (status === 400 && /available Fridays/i.test(message))
    return { kind: "friday", message: "That Friday is no longer available. Choose another from the updated dates.", reload: true };
  if (status === 409) return { kind: "already", message: "This exam is already booked. The list has been refreshed.", reload: true };
  if (status === 403 && !/view as/i.test(message))
    return { kind: "forbidden", message: "You can't schedule makeup exams with this account.", reload: true };
  if (status === 404) return { kind: "missing", message: "That booking is already gone, or its Friday has passed. The list has been refreshed.", reload: true };
  if (status === null) return { kind: "offline", message: "Could not reach the server. Nothing was changed; try again when you are back online.", reload: false };
  return { kind: "other", message, reload: false };
}
