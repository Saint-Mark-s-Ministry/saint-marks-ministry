/**
 * Pure logic for My Account, Academic Years, and Change Password (SMM-58).
 */

import type { PortalUser } from "./api-client";

// ============================================
// Ministry access / roles summary (My Account)
// ============================================

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  PRIEST: "Priest",
  SERVANT_PREP: "Servants Prep Admin",
  MENTOR: "Mentor",
  STUDENT: "Student",
  SERVANT: "Servant",
  PARENT: "Parent",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role.replaceAll("_", " ");
}

/**
 * A one-line summary of which ministries this account participates in and
 * with what authority — built only from fields the real session already
 * sends (`role`, `sundaySchool`), never a fabricated "assignments" list.
 */
export function ministryAccessSummary(user: Pick<PortalUser, "role" | "sundaySchool">): string {
  const parts: string[] = [];
  if (user.role !== "PARENT") parts.push("Servants Prep");
  if (user.sundaySchool.hasAccess) {
    parts.push(user.sundaySchool.isCoordinator ? "Sunday School (Coordinator)" : "Sunday School");
  }
  return parts.length ? parts.join(" · ") : "No ministry access yet";
}

// ============================================
// Academic years
// ============================================

export interface AcademicYearLike {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export type AcademicYearStanding = "active" | "upcoming" | "archived" | "inactive";

/**
 * Current/archived/upcoming, derived only from real fields (isActive,
 * start/end dates) — there is no separate status column in the schema.
 * "active" always wins (the server's own flag), "upcoming"/"archived" are
 * purely date-relative for every other year, and a year that straddles
 * today without being flagged active reads as "inactive" rather than
 * silently claiming it's the current one.
 */
export function academicYearStanding(year: AcademicYearLike, now: Date = new Date()): AcademicYearStanding {
  if (year.isActive) return "active";
  if (new Date(year.startDate).getTime() > now.getTime()) return "upcoming";
  if (new Date(year.endDate).getTime() < now.getTime()) return "archived";
  return "inactive";
}

export function sortAcademicYears<T extends AcademicYearLike>(years: T[]): T[] {
  return [...years].sort((a, b) => b.startDate.localeCompare(a.startDate));
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// A calendar date must stay the same day everywhere, so this reads the
// date's own UTC fields rather than `toLocaleDateString`, which formats in
// the caller's local timezone and can silently shift a UTC-midnight date
// back a day west of UTC.
export function academicYearRangeLabel(year: AcademicYearLike): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  };
  return `${fmt(year.startDate)} – ${fmt(year.endDate)}`;
}

export function validAcademicYearDraft(name: string, startDate: string, endDate: string): boolean {
  return !!name.trim() && validDateInput(startDate) && validDateInput(endDate) && startDate < endDate;
}

function validDateInput(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

// ============================================
// Change password
// ============================================

export const PASSWORD_MIN_LENGTH = 8;

/** The only requirement the server actually enforces. */
export function meetsMinimumLength(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH;
}

export type PasswordStrength = "weak" | "fair" | "good" | "strong";

/**
 * Purely informational — the server has no complexity policy beyond length
 * (app/api/auth/change-password/route.ts). This never gates submission; it
 * only suggests a stronger password, labeled as a tip, not a requirement.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (!meetsMinimumLength(password)) return "weak";
  let score = password.length >= 12 ? 1 : 0;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (score >= 3) return "strong";
  if (score === 2) return "good";
  return "fair";
}

export interface PasswordChangeValidation {
  error?: string;
}

/** Mirrors the server's own checks exactly, so the form fails fast with the same message it would get back anyway. */
export function validatePasswordChange(
  currentPassword: string,
  newPassword: string,
  confirmation: string,
): PasswordChangeValidation {
  if (!currentPassword) return { error: "Enter your current password." };
  if (!meetsMinimumLength(newPassword)) return { error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` };
  if (newPassword !== confirmation) return { error: "The new passwords do not match." };
  return {};
}
