/**
 * Pure logic for the Registration review queue, Registration detail, and
 * Servant application sheet (SMM-40), pulled out of the screen components
 * so role gating, duplicate/incomplete detection, invite-code status, and
 * grade formatting are unit-testable without rendering native UI.
 */

export { isAdminLike as canViewRegistrations } from "./prep-home";
export { canManageAttendance as canReviewRegistrations } from "./prep-attendance";
export { canManageAttendance as canManageInviteCodes } from "./prep-attendance";

/**
 * Servant accounts are never SERVANT_PREP-created — approving a servant
 * application creates a Sunday School `User{role: SERVANT}`, which is
 * outside Prep leadership's authority. Mirrors the web's
 * canReviewServantApplications exactly (SUPER_ADMIN only, also the single
 * gate for just viewing the queue).
 */
export function canReviewServantApplications(role?: string | null): boolean {
  return role === "SUPER_ADMIN";
}

export type RegistrationStatus = "PENDING" | "APPROVED" | "REJECTED";
export type StatusFilter = RegistrationStatus | "ALL";

export type Submission = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  grade: string;
  fatherOfConfessionName: string | null;
  currentlyServing: boolean;
  previouslyServed: boolean;
  previousServiceLocation: string | null;
  previouslyAttendedPrep: boolean;
  previousPrepLocation: string | null;
  approvalFormUrl: string | null;
  profileImageUrl: string | null;
  mentorName: string | null;
  mentorPhone: string | null;
  mentorEmail: string | null;
  status: RegistrationStatus;
  reviewNote: string | null;
  reviewer: { name: string | null } | null;
  createdAt: string;
};

const GRADE_LABELS: Record<string, string> = {
  GRADE_9: "9th grade",
  GRADE_10: "10th grade",
  GRADE_11: "11th grade",
  GRADE_12: "12th grade",
  COLLEGE_FRESHMAN: "College freshman",
  COLLEGE_SOPHOMORE: "College sophomore",
  COLLEGE_JUNIOR: "College junior",
  COLLEGE_SENIOR: "College senior",
  POST_COLLEGE: "Post-college",
  OTHER: "Other",
};

/** The real `grade` enum, formatted for display — the design source's own sample text ("Year 1") doesn't match any real field on this model. */
export function formatGrade(grade: string): string {
  return GRADE_LABELS[grade] ?? grade;
}

/** Same-email submissions (case-insensitive) — a likely duplicate application, independent of status. */
export function duplicateEmails(submissions: { email: string }[]): Set<string> {
  const counts = new Map<string, number>();
  for (const s of submissions) {
    const key = s.email.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const dupes = new Set<string>();
  for (const [key, count] of counts) if (count > 1) dupes.add(key);
  return dupes;
}

export function isDuplicate(submission: { email: string }, dupes: Set<string>): boolean {
  return dupes.has(submission.email.trim().toLowerCase());
}

/**
 * Missing any of the optional-but-expected fields the approval path itself
 * flags via a REGISTRATION_INCOMPLETE notification (father of confession,
 * approval form, full mentor info) — reusing the server's own definition of
 * "incomplete" rather than inventing a stricter client-side one.
 */
export function isIncomplete(s: {
  fatherOfConfessionName: string | null;
  approvalFormUrl: string | null;
  mentorName: string | null;
  mentorPhone: string | null;
  mentorEmail: string | null;
}): boolean {
  const hasMentorInfo = !!(s.mentorName && s.mentorPhone && s.mentorEmail);
  return !s.fatherOfConfessionName || !s.approvalFormUrl || !hasMentorInfo;
}

export function filterByStatus<T extends { status: RegistrationStatus }>(
  rows: T[],
  status: StatusFilter,
): T[] {
  if (status === "ALL") return rows;
  return rows.filter((r) => r.status === status);
}

/**
 * The server accepts an empty reject note (note || null) — this is a
 * client-side UX guard only, matching the design source's "Required to
 * reject" placeholder, not a server-enforced rule.
 */
export function canSubmitReview(decision: "approve" | "reject", note: string): boolean {
  if (decision === "reject") return note.trim().length > 0;
  return true;
}

export type InviteCode = {
  id: string;
  code: string;
  label: string | null;
  maxUses: number;
  usageCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { registrations: number };
};

export type InviteCodeStatus = "active" | "expired" | "exhausted" | "revoked";

/** Mirrors the web admin page's getCodeStatusBadge exactly (revoked > expired > exhausted > active). */
export function inviteCodeStatus(code: InviteCode, now: Date = new Date()): InviteCodeStatus {
  if (!code.isActive) return "revoked";
  if (code.expiresAt && new Date(code.expiresAt) < now) return "expired";
  if (code.maxUses > 0 && code.usageCount >= code.maxUses) return "exhausted";
  return "active";
}

export function inviteCodeSubtitle(code: InviteCode, now: Date = new Date()): string {
  const parts: string[] = [];
  if (code.label) parts.push(code.label);
  parts.push(code.maxUses > 0 ? `${code.usageCount}/${code.maxUses} uses` : `${code.usageCount} uses`);
  if (code.expiresAt) {
    const expired = new Date(code.expiresAt) < now;
    parts.push(`${expired ? "expired" : "expires"} ${new Date(code.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
  }
  return parts.join(" · ");
}

export type ServantApplicationListItem = {
  id: string;
  status: RegistrationStatus;
  email: string;
  fullName: string;
  phone: string;
  currentGrade: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  reviewer: { name: string | null } | null;
};
