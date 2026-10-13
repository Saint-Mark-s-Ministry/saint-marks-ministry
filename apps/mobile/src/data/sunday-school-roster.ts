/**
 * Pure logic for the Sunday School Roster list and Child detail screens
 * (SMM-51). Mirrors the real fields on `SundaySchoolChild` exactly — no
 * "child cell number", "father of confession", or "health flag" exists
 * anywhere in that model or on `SundaySchoolFamily`, so none of those appear
 * here despite being named in the ticket's own boilerplate scope text.
 *
 * Birth dates are calendar values stored at midnight UTC, same convention as
 * lib/sunday-school-birthdays.ts — every read uses UTC parts so a device's
 * time zone never shifts the displayed day.
 */

import { MONTHS, birthdayParts } from "./sunday-school-birthdays";
import { dialablePhone } from "./contact-book";

export type AttendanceRecordStatus = "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";

/** "Mariam A." — first name plus last-initial, the roster's own list-row and header convention. */
export function truncatedName(firstName: string, lastName: string): string {
  const initial = lastName.trim().slice(0, 1);
  return initial ? `${firstName} ${initial}.` : firstName;
}

/** "Mar 2018" — month and year only, for the roster list row. */
export function birthMonthYear(birthDate: string): string | null {
  const parts = birthdayParts(birthDate);
  if (!parts) return null;
  return `${MONTHS[parts.month - 1].slice(0, 3)} ${parts.year}`;
}

/** "Mar 14, 2018" — the full date, for the child detail header. */
export function fullBirthDate(birthDate: string): string | null {
  const parts = birthdayParts(birthDate);
  if (!parts) return null;
  return `${MONTHS[parts.month - 1].slice(0, 3)} ${parts.day}, ${parts.year}`;
}

export function genderLabel(gender: "MALE" | "FEMALE" | null): string | null {
  if (gender === "MALE") return "Boy";
  if (gender === "FEMALE") return "Girl";
  return null;
}

/**
 * Mirrors calculateAttendanceStats's own formula (lib/attendance.ts): present
 * counts as 1, late as 0.5, absent as 0, excused is excluded entirely. Null
 * (not 0%) when there is nothing to compute from, so "no data yet" never
 * reads as "0% attendance".
 */
export function attendancePercentage(records: { status: AttendanceRecordStatus }[]): number | null {
  const counted = records.filter((r) => r.status !== "EXCUSED");
  if (!counted.length) return null;
  const effectivePresent = counted.reduce(
    (sum, r) => sum + (r.status === "PRESENT" ? 1 : r.status === "LATE" ? 0.5 : 0),
    0,
  );
  return Math.round((effectivePresent / counted.length) * 1000) / 10;
}

export type FamilyRef = {
  motherName: string | null;
  motherPhone: string | null;
  fatherName: string | null;
  fatherPhone: string | null;
  homeAddress: string | null;
} | null;

export type GuardianRef = {
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
};

export type ContactTarget = { label: string; phone: string } | null;

/**
 * The one phone number the header's Call/Message buttons use: the family's
 * mother, then father, then the guardian fallback — the same order the
 * contact card itself lists them in. Null hides both buttons rather than
 * disabling them against nothing.
 */
export function primaryContact(family: FamilyRef, guardian: GuardianRef): ContactTarget {
  if (family?.motherPhone) return { label: family.motherName || "Mother", phone: family.motherPhone };
  if (family?.fatherPhone) return { label: family.fatherName || "Father", phone: family.fatherPhone };
  if (guardian.guardianPhone) return { label: guardian.guardianName || "Guardian", phone: guardian.guardianPhone };
  return null;
}

export type AbsenceContact = {
  /** The raw number as stored, for display. */
  phone: string;
  /** Who it rings: the child's first name, or the parent's name/role. */
  who: string;
  relation: "child" | "parent";
} | null;

/**
 * Who to call or text when a child is absent: the child's own number if they
 * have one, otherwise a parent — mother, then father, then the guardian on the
 * child's record. Numbers that can't be dialled (blank, punctuation only) are
 * skipped, so a stray "-" never hides a real parent number behind it.
 */
export function absenceContact(
  child: { firstName: string; cellPhone?: string | null; guardianName?: string | null; guardianPhone?: string | null },
  family: FamilyRef,
): AbsenceContact {
  if (dialablePhone(child.cellPhone)) {
    return { phone: child.cellPhone as string, who: child.firstName, relation: "child" };
  }
  if (dialablePhone(family?.motherPhone)) {
    return { phone: family!.motherPhone as string, who: family?.motherName || "Mother", relation: "parent" };
  }
  if (dialablePhone(family?.fatherPhone)) {
    return { phone: family!.fatherPhone as string, who: family?.fatherName || "Father", relation: "parent" };
  }
  if (dialablePhone(child.guardianPhone)) {
    return { phone: child.guardianPhone as string, who: child.guardianName || "Guardian", relation: "parent" };
  }
  return null;
}

/** A family record with nothing in it is the same as no family, for display purposes. */
export function hasFamilyContact(family: FamilyRef): boolean {
  return Boolean(family && (family.motherName || family.motherPhone || family.fatherName || family.fatherPhone || family.homeAddress));
}

/**
 * Whether the signed-in account can edit this child: admin, or a servant/
 * coordinator of the child's own class. An unassigned child (no class) is
 * admin-only — mirrors the server's own loadChildForUser rule exactly.
 */
export function canEditChild(
  child: { classId: string | null },
  classes: { id: string; canServe?: boolean }[],
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  if (!child.classId) return false;
  return classes.some((c) => c.id === child.classId && c.canServe === true);
}
