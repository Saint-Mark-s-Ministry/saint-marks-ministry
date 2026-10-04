/**
 * Mobile port of lib/confession.ts — same 2-month-period math, so the
 * native Confession screen stays consistent with the web admin tracker.
 */
export type ConfessionPeriodStatus =
  | "na"
  | "registration"
  | "slip"
  | "missing"
  | "due"
  | "upcoming";

export interface ConfessionPeriod {
  start: Date;
  end: Date;
}

export function getConfessionPeriods(year: { startDate: string; endDate: string }): ConfessionPeriod[] {
  const first = new Date(year.startDate);
  const end = new Date(year.endDate);
  const periods: ConfessionPeriod[] = [];
  for (let m = first.getUTCMonth(); ; m += 2) {
    const start = new Date(Date.UTC(first.getUTCFullYear(), m, 1));
    if (!(start < end)) break;
    periods.push({ start, end: new Date(Date.UTC(first.getUTCFullYear(), m + 2, 1)) });
  }
  return periods;
}

export function getStudentStart(enrollment: {
  attendanceStartDate?: string | null;
  academicYearStart?: string | null;
  enrolledAt: string;
}): Date {
  return new Date(enrollment.attendanceStartDate ?? enrollment.academicYearStart ?? enrollment.enrolledAt);
}

export function getConfessionPeriodStatus(
  period: ConfessionPeriod,
  studentStart: Date,
  hasSlip: boolean,
  now: Date = new Date(),
): ConfessionPeriodStatus {
  if (hasSlip) return "slip";
  if (period.end <= studentStart) return "na";
  if (period.start <= studentStart) return "registration";
  if (period.start > now) return "upcoming";
  return period.end <= now ? "missing" : "due";
}

export function formatConfessionPeriod(period: ConfessionPeriod): string {
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const last = new Date(period.end.getTime() - 1);
  return `${month(period.start)}–${month(last)} ${last.getUTCFullYear()}`;
}
