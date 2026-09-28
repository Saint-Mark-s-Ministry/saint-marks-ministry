import type { SundaySchoolLevel } from "@stmark/contracts";

/**
 * Helpers for Sunday School mode — the Sunday School class itself (classes,
 * children, weekly child attendance).
 *
 * Not to be confused with lib/sunday-school-utils.ts, which serves the
 * Servants Prep flow that verifies async students served their weeks.
 */

export const LEVEL_DISPLAY_NAMES: Record<SundaySchoolLevel, string> = {
  PRE_K: "Pre-K",
  KINDERGARTEN: "Kindergarten",
  GRADE_1: "1st Grade",
  GRADE_2: "2nd Grade",
  GRADE_3: "3rd Grade",
  GRADE_4: "4th Grade",
  GRADE_5: "5th Grade",
  SPECIAL_NEEDS: "Special Needs",
  GRADE_6: "6th Grade",
  GRADE_7: "7th Grade",
  GRADE_8: "8th Grade",
  GRADE_9: "9th Grade",
  GRADE_10: "10th Grade",
  GRADE_11: "11th Grade",
  GRADE_12: "12th Grade",
  COLLEGE: "College & Grad",
  GRAD: "College & Grad",
  COLLEGE_GRAD: "College & Grad",
};

// Ordered Pre-K → College & Grad, for dropdowns and sorting class lists.
// COLLEGE and GRAD are legacy database values and are intentionally omitted
// so people can only create or assign the combined grade level.
export const LEVEL_ORDER: SundaySchoolLevel[] = [
  "PRE_K",
  "KINDERGARTEN",
  "GRADE_1",
  "GRADE_2",
  "GRADE_3",
  "GRADE_4",
  "GRADE_5",
  "SPECIAL_NEEDS",
  "GRADE_6",
  "GRADE_7",
  "GRADE_8",
  "GRADE_9",
  "GRADE_10",
  "GRADE_11",
  "GRADE_12",
  "COLLEGE_GRAD",
];

const LEVEL_ORDER_INDEX = new Map(
  LEVEL_ORDER.map((level, index) => [level, index]),
);

const ELEMENTARY_LEVELS = new Set<SundaySchoolLevel>([
  "PRE_K",
  "KINDERGARTEN",
  "GRADE_1",
  "GRADE_2",
  "GRADE_3",
  "GRADE_4",
  "GRADE_5",
  "SPECIAL_NEEDS",
]);

export type SundaySchoolMeetingDay = 0 | 6;

export function getLevelDisplayName(level: SundaySchoolLevel): string {
  return LEVEL_DISPLAY_NAMES[level];
}

export function isValidLevel(value: unknown): value is SundaySchoolLevel {
  return typeof value === "string" && (LEVEL_ORDER as string[]).includes(value);
}

/** Elementary meets Saturday; every other Sunday School level meets Sunday. */
export function getClassMeetingDay(
  level: SundaySchoolLevel,
): SundaySchoolMeetingDay {
  return ELEMENTARY_LEVELS.has(level) ? 6 : 0;
}

export function getClassMeetingDayName(
  level: SundaySchoolLevel,
): "Saturday" | "Sunday" {
  return getClassMeetingDay(level) === 6 ? "Saturday" : "Sunday";
}

/**
 * Sessions are identified by their date, so the time component must be
 * normalized or two entries for the same Sunday would not collide on the
 * @@unique([classId, date]) constraint.
 *
 * Normalized to midnight UTC, matching how the rest of the app stores
 * calendar days (see formatDateUTC in lib/utils.ts) — a "YYYY-MM-DD" value
 * from a date input already parses to midnight UTC, so this is a no-op for
 * the common case and truncates the day for full timestamps.
 */
export function normalizeSessionDate(date: Date | string): Date {
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error("Invalid session date");
  }
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export const SUNDAY_SCHOOL_TIME_ZONE = "America/New_York";

/** Calendar date at the church, independent of the server/device timezone. */
export function getSundaySchoolTodayDateInputValue(
  date: Date = new Date(),
  timeZone: string = SUNDAY_SCHOOL_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: "year" | "month" | "day") =>
    parts.find(value => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Attendance writes are allowed only on the session's church-local date. */
export function isSessionDateToday(
  sessionDate: Date | string,
  now: Date = new Date(),
): boolean {
  return (
    toDateInputValue(normalizeSessionDate(sessionDate)) ===
    getSundaySchoolTodayDateInputValue(now)
  );
}

/**
 * The most recent Sunday on or before the given date — the default date when
 * a servant opens the attendance page. Derived from the viewer's local
 * calendar day, but returned as midnight UTC like every stored session date.
 */
export function getMostRecentSunday(date: Date = new Date()): Date {
  return getMostRecentMeetingDay(0, date);
}

/** The most recent requested weekday on or before the viewer's local day. */
export function getMostRecentMeetingDay(
  meetingDay: SundaySchoolMeetingDay,
  date: Date = new Date(),
): Date {
  const local = new Date(date);
  const daysSinceMeeting = (local.getDay() - meetingDay + 7) % 7;
  return new Date(
    Date.UTC(
      local.getFullYear(),
      local.getMonth(),
      local.getDate() - daysSinceMeeting,
    ),
  );
}

export function getMostRecentClassMeetingDate(
  level: SundaySchoolLevel,
  date: Date = new Date(),
): Date {
  return getMostRecentMeetingDay(getClassMeetingDay(level), date);
}

/** "YYYY-MM-DD" for a stored (midnight UTC) session date. */
export function toDateInputValue(date: Date): string {
  return date.toISOString().split("T")[0];
}

/** "YYYY-MM-DD" for the viewer's local today — used to cap the date picker. */
export function getTodayDateInputValue(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function getChildFullName(child: {
  firstName: string;
  lastName: string;
}): string {
  return `${child.firstName} ${child.lastName}`.trim();
}

/**
 * A grade level belongs to at most one age group, or a class would sit in two
 * bands at once and answer to two coordinators. Prisma cannot express this, so
 * it is checked whenever a band's levels are set.
 *
 * Returns an error message naming the clash, or null when the levels are free.
 */
export function assertLevelsUnclaimed(
  levels: SundaySchoolLevel[],
  otherGroups: { name: string; levels: SundaySchoolLevel[] }[],
): string | null {
  for (const group of otherGroups) {
    const claimed = levels.filter((level) => group.levels.includes(level));
    if (claimed.length > 0) {
      const names = claimed.map(getLevelDisplayName).join(", ");
      return `${names} already belong${claimed.length === 1 ? "s" : ""} to ${group.name}`;
    }
  }
  return null;
}

/** The age group that owns a level, if any. */
export function findAgeGroupForLevel<T extends { levels: SundaySchoolLevel[] }>(
  level: SundaySchoolLevel,
  ageGroups: T[],
): T | undefined {
  return ageGroups.find((group) => group.levels.includes(level));
}

/** Natural alphabetical order for names that may contain section numbers. */
export function compareClassNames(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

/** Grade order first (Pre-K → College & Grad), then natural class-name order. */
export function compareClassesByLevelAndName(
  left: { level: SundaySchoolLevel; name: string },
  right: { level: SundaySchoolLevel; name: string },
): number {
  const levelDifference =
    (LEVEL_ORDER_INDEX.get(left.level) ?? Number.MAX_SAFE_INTEGER) -
    (LEVEL_ORDER_INDEX.get(right.level) ?? Number.MAX_SAFE_INTEGER);

  return levelDifference || compareClassNames(left.name, right.name);
}

/** Age groups follow the first grade they contain; empty groups come last. */
export function compareAgeGroupsByLevel(
  left: { levels: SundaySchoolLevel[]; name: string },
  right: { levels: SundaySchoolLevel[]; name: string },
): number {
  const firstLevel = (levels: SundaySchoolLevel[]) =>
    Math.min(
      ...levels.map(
        (level) => LEVEL_ORDER_INDEX.get(level) ?? Number.MAX_SAFE_INTEGER,
      ),
    );
  const levelDifference = firstLevel(left.levels) - firstLevel(right.levels);

  return levelDifference || left.name.localeCompare(right.name);
}
