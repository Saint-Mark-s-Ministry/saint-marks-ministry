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

// --- SMM-36: the list screen's 3-way filter/grouping, built on top of the
// period-status math above ---

export type ConfessionSegment = "due" | "received" | "missing";

/**
 * Collapses the 6-value period status into the 3 segments the design
 * source's filter shows. "na" (period ended before the student joined) is
 * excluded entirely — they're not tracked for this period at all.
 * "registration" (covered by their registration form, no slip needed) and
 * "upcoming" (a future period; never the case for the one period this
 * screen shows) both count as nothing-left-to-do, so they fold into
 * "received" alongside an actual uploaded slip.
 */
export function segmentFor(status: ConfessionPeriodStatus): ConfessionSegment | null {
  if (status === "na") return null;
  if (status === "slip" || status === "registration") return "received";
  if (status === "missing") return "missing";
  return "due"; // "due" or "upcoming"
}

export function segmentCounts(statuses: ConfessionPeriodStatus[]): Record<ConfessionSegment, number> {
  const counts: Record<ConfessionSegment, number> = { due: 0, received: 0, missing: 0 };
  for (const status of statuses) {
    const segment = segmentFor(status);
    if (segment) counts[segment]++;
  }
  return counts;
}

export type FatherGroupable = { fatherName: string | null; status: ConfessionPeriodStatus };

/** Groups rows (already filtered to a segment) by father of confession, sorted by name, "No father assigned" last. */
export function groupByFather<T extends FatherGroupable>(rows: T[]): { father: string; rows: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.fatherName ?? "No father of confession assigned";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === "No father of confession assigned") return 1;
      if (b === "No father of confession assigned") return -1;
      return a.localeCompare(b);
    })
    .map(([father, rows]) => ({ father, rows }));
}

export function daysLeft(period: ConfessionPeriod, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((period.end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}

export function periodClosed(period: ConfessionPeriod, now: Date = new Date()): boolean {
  return period.end <= now;
}
