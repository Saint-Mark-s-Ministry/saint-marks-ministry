/**
 * Pure logic for the Sunday School Child registrations queue (SMM-56).
 */

import type {
  SundaySchoolLevel,
  SundaySchoolRegistrationDetail,
  SundaySchoolRegistrationDuplicateSignal,
  SundaySchoolRegistrationStatus,
  SundaySchoolRegistrationSummary,
} from "@stmark/contracts";
import { getLevelDisplayName } from "@stmark/domain";
import { shortMonthDay } from "./sunday-school-classes";

type Registration = SundaySchoolRegistrationSummary | SundaySchoolRegistrationDetail;

export const STATUS_FILTERS: { value: SundaySchoolRegistrationStatus; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "CHANGES_REQUESTED", label: "Changes requested" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

export function statusTone(status: SundaySchoolRegistrationStatus): "warning" | "success" | "danger" | "info" {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "danger";
  if (status === "CHANGES_REQUESTED") return "info";
  return "warning";
}

export function statusLabel(status: SundaySchoolRegistrationStatus): string {
  if (status === "CHANGES_REQUESTED") return "Changes requested";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function genderLabel(gender: "MALE" | "FEMALE" | null): string {
  if (gender === "MALE") return "Boy";
  if (gender === "FEMALE") return "Girl";
  return "Gender not specified";
}

export function submittedLabel(createdAt: string): string {
  return `Submitted ${shortMonthDay(createdAt)}`;
}

/**
 * Every required field (name, birth date, intended level, guardian name +
 * phone) is already enforced at submission by the real POST route — so a
 * pending request is never missing those. The only genuinely optional
 * identity fields are gender and a guardian email; "completeness" here means
 * whether those were filled in too, not a fabricated score.
 */
export function completenessLabel(registration: Pick<Registration, "gender"> & { hasGuardianEmail?: boolean; guardianEmail?: string | null }): string {
  const hasEmail = "hasGuardianEmail" in registration ? !!registration.hasGuardianEmail : !!registration.guardianEmail;
  const missing: string[] = [];
  if (!registration.gender) missing.push("gender");
  if (!hasEmail) missing.push("email");
  if (!missing.length) return "All details provided";
  return `Missing guardian ${missing.join(" & ")}`;
}

export function duplicateCaption(signal: SundaySchoolRegistrationDuplicateSignal | undefined): string | null {
  if (!signal || signal.matchCount === 0) return null;
  const existing = signal.matches.filter((m) => m.type === "existing_child").length;
  const pending = signal.matches.filter((m) => m.type === "pending_request").length;
  const parts: string[] = [];
  if (existing) parts.push(`${existing} existing ${existing === 1 ? "child" : "children"}`);
  if (pending) parts.push(`${pending} other ${pending === 1 ? "request" : "requests"}`);
  return `Possible duplicate — matches ${parts.join(" and ")}`;
}

/** Only a pending or changes-requested request can still be acted on. */
export function isReviewable(status: SundaySchoolRegistrationStatus): boolean {
  return status === "PENDING" || status === "CHANGES_REQUESTED";
}

export function levelAndBirthLine(intendedLevel: SundaySchoolLevel, birthDate: string): string {
  return `${getLevelDisplayName(intendedLevel)} · Born ${shortMonthDay(birthDate)}`;
}

/** Guardian name plus whatever contact context is safe to show in this view. */
export function guardianLine(registration: { guardianName: string; guardianPhone: string }): string {
  return `Guardian ${registration.guardianName} · ${registration.guardianPhone}`;
}

export function reviewValidationError(action: "approve" | "reject" | "request_changes", classId: string, note: string): string | null {
  if (action === "approve" && !classId) return "Choose a class to place this child in.";
  if (action === "request_changes" && !note.trim()) return "Add a note so the family knows what to change.";
  return null;
}
