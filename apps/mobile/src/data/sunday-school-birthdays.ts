/**
 * Pure logic for the Sunday School birthday cards and the native Birthdays
 * list (SMM-48). Mirrors lib/sunday-school-birthdays.ts on the server.
 *
 * Birth dates are calendar values stored at midnight UTC, so every read uses
 * UTC parts and a device's time zone never shifts the displayed day.
 */

export type Birthday = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  classId: string | null;
  class: { id: string; name: string; level: string } | null;
};

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export function birthdayParts(value: string): { year: number; month: number; day: number } | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** "Mar 14", read from the UTC calendar day. */
export function formatBirthdayDay(value: string): string {
  const parts = birthdayParts(value);
  if (!parts) return "Unknown date";
  return `${MONTHS[parts.month - 1].slice(0, 3)} ${parts.day}`;
}

/** The age the child turns in `year`. Never negative. */
export function ageInYear(value: string, year: number): number | null {
  const parts = birthdayParts(value);
  if (!parts) return null;
  return Math.max(0, year - parts.year);
}

export function isToday(value: string, now: Date): boolean {
  const parts = birthdayParts(value);
  if (!parts) return false;
  return parts.month === now.getUTCMonth() + 1 && parts.day === now.getUTCDate();
}

/**
 * Days from today to the next birthday, wrapping into next year. Today is 0.
 * Compared on UTC month and day, the same as the stored value.
 */
export function daysUntilBirthday(value: string, now: Date): number | null {
  const parts = birthdayParts(value);
  if (!parts) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let next = Date.UTC(now.getUTCFullYear(), parts.month - 1, parts.day);
  if (next < today) next = Date.UTC(now.getUTCFullYear() + 1, parts.month - 1, parts.day);
  return Math.round((next - today) / (24 * 60 * 60 * 1000));
}

/** Birthdays in order from today: the nearest first, then by name. */
export function upcomingBirthdays(birthdays: Birthday[], now: Date, limit = Infinity): Birthday[] {
  return birthdays
    .map((b) => ({ b, days: daysUntilBirthday(b.birthDate, now) ?? Infinity }))
    .sort((x, y) => x.days - y.days || x.b.firstName.localeCompare(y.b.firstName) || x.b.lastName.localeCompare(y.b.lastName))
    .slice(0, limit)
    .map((x) => x.b);
}

export function filterBirthdays(
  birthdays: Birthday[],
  filter: { month: number | null; classId: string | null },
): Birthday[] {
  return birthdays.filter((b) => {
    if (filter.classId && b.classId !== filter.classId) return false;
    if (filter.month !== null) {
      const parts = birthdayParts(b.birthDate);
      if (!parts || parts.month !== filter.month) return false;
    }
    return true;
  });
}

/** Classes that appear in the list, once each, in the order they're first seen. */
export function classesIn(birthdays: Birthday[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const b of birthdays) {
    if (b.classId && b.class && !seen.has(b.classId)) seen.set(b.classId, b.class.name);
  }
  return [...seen].map(([id, name]) => ({ id, name }));
}

/** The short text a birthday row reads, e.g. "Mar 14 · turns 7". */
export function birthdayCaption(birthDate: string, now: Date): string {
  const year = now.getUTCFullYear();
  const age = ageInYear(birthDate, year);
  const day = formatBirthdayDay(birthDate);
  if (isToday(birthDate, now)) return `Today · turns ${age}`;
  return age === null ? day : `${day} · turns ${age}`;
}
