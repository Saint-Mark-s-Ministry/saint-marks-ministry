/**
 * Who a Servants Prep student's mentor and father of confession are, and how to
 * reach them. Pure: no network, no React.
 *
 * Mirrors lib/mentor-contact.ts, lib/student-mentor-contact.ts and
 * lib/mentor-eligibility.ts on the server (web PR #243). The rules the screens
 * follow:
 *  - The mentor shown is the server's resolved `mentorContact`, which prefers the
 *    student's confirmed annual mentor details over the raw enrollment and
 *    account fields. The raw `mentor` is a fallback only when the server did not
 *    send `mentorContact` at all (an older server). A `mentorContact` of null is
 *    the server saying there is no current mentor, and is never papered over
 *    with a stale raw one.
 *  - A missing value reads "Not provided", never a blank or a guess.
 *  - Mentor candidates come from /api/mentor-options. The app never filters them
 *    by role: an enabled Sunday School servant with an eligible tag is a valid
 *    mentor even when the account's legacy primary role differs.
 *  - Being a candidate, or being assigned, grants no Servants Prep authority.
 *    Every permission here is still the signed-in user's own role.
 */

import type { PrepEnrollmentPeople, PrepFatherOfConfession, PrepMentorContact, PrepMentorOption } from "@stmark/contracts";
import { isAdminLike } from "./prep-home";

export type { PrepEnrollmentPeople, PrepFatherOfConfession, PrepMentorContact, PrepMentorOption };

export const NOT_PROVIDED = "Not provided";

const clean = (value: string | null | undefined): string | null => {
  const text = value?.trim();
  return text ? text : null;
};

// ── The mentor ──────────────────────────────────────────────────────────────

export type MentorState = "assigned" | "awaiting-confirmation" | "none";

export interface MentorSummary {
  state: MentorState;
  name: string | null;
  email: string | null;
  phone: string | null;
}

/**
 * The mentor to show for an enrollment. `mentorContact` (resolved by the server,
 * confirmed annual details first) wins; the raw assigned account is used only
 * when `mentorContact` is absent altogether.
 */
export function mentorSummary(enrollment: PrepEnrollmentPeople): MentorSummary {
  const resolved = enrollment.mentorContact;
  if (resolved !== undefined) {
    if (resolved && clean(resolved.name)) {
      return { state: "assigned", name: clean(resolved.name), email: clean(resolved.email), phone: clean(resolved.phone) };
    }
    return { state: enrollment.mentorForm?.status === "REQUIRED" ? "awaiting-confirmation" : "none", name: null, email: null, phone: null };
  }
  const raw = enrollment.mentor;
  if (raw && clean(raw.name)) {
    return { state: "assigned", name: clean(raw.name), email: clean(raw.email), phone: clean(raw.phone) };
  }
  return { state: "none", name: null, email: null, phone: null };
}

/**
 * The assigned account's name when the contact shown is someone else's: the student's
 * confirmed annual details win over the assigned account, so after a reassignment the
 * card would otherwise look unchanged. Null when they agree or there is no assigned account.
 */
export function assignedMentorNote(enrollment: PrepEnrollmentPeople): string | null {
  const shown = mentorSummary(enrollment);
  const assigned = clean(enrollment.mentor?.name);
  if (!shown.name || !assigned || assigned.toLowerCase() === shown.name.toLowerCase()) return null;
  return `Assigned mentor account: ${assigned}. The student's confirmed details are shown.`;
}

/** "Mentor Abouna Peter", or why there is none. Always names the field, so a row never shows a bare gap. */
export function mentorLine(enrollment: PrepEnrollmentPeople): string {
  const mentor = mentorSummary(enrollment);
  if (mentor.name) return `Mentor ${mentor.name}`;
  return mentor.state === "awaiting-confirmation" ? "Mentor awaiting this year's confirmation" : `Mentor ${NOT_PROVIDED}`;
}

export function fatherSummary(enrollment: PrepEnrollmentPeople): { name: string | null; church: string | null; phone: string | null } {
  const father = enrollment.fatherOfConfession;
  if (!father || !clean(father.name)) return { name: null, church: null, phone: null };
  return { name: clean(father.name), church: clean(father.church), phone: clean(father.phone) };
}

/** "Father of confession Fr. Mark", or "Father of confession Not provided". */
export function fatherLine(enrollment: PrepEnrollmentPeople): string {
  return `Father of confession ${fatherSummary(enrollment).name ?? NOT_PROVIDED}`;
}

// ── Native contact actions ──────────────────────────────────────────────────

export type ContactKind = "email" | "call" | "message";

export interface ContactAction {
  kind: ContactKind;
  label: string;
  url: string;
}

/** Digits and a leading plus only: what a dialer needs. Null when there is nothing to dial. */
export function dialable(phone: string | null | undefined): string | null {
  const text = clean(phone);
  if (!text) return null;
  const digits = text.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  return /\d/.test(digits) ? digits : null;
}

export function validEmail(email: string | null | undefined): string | null {
  const text = clean(email);
  return text && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : null;
}

/** The actions available for what is on file: Call and Message for a phone, Email for an address. */
export function contactActions(contact: { email?: string | null; phone?: string | null }): ContactAction[] {
  const actions: ContactAction[] = [];
  const phone = dialable(contact.phone);
  const email = validEmail(contact.email);
  if (phone) {
    actions.push({ kind: "call", label: "Call", url: `tel:${phone}` });
    actions.push({ kind: "message", label: "Message", url: `sms:${phone}` });
  }
  if (email) actions.push({ kind: "email", label: "Email", url: `mailto:${email}` });
  return actions;
}

/** A father of confession has a phone and a church, never an email on file. */
export function fatherActions(father: { phone?: string | null }): ContactAction[] {
  return contactActions({ phone: father.phone }).filter((action) => action.kind === "call");
}

export const CONTACT_LABEL: Record<ContactKind, string> = { call: "Call", message: "Message", email: "Email" };

// ── Assigning a mentor ──────────────────────────────────────────────────────

export const MENTOR_OPTIONS_PATH = "/api/mentor-options";

/** Same set as the server's canAssignMentors: Super Admins, priests and Servants Prep servants. The API still decides. */
export function canAssignMentors(role?: string | null): boolean {
  return isAdminLike(role);
}

export function enrollmentPath(enrollmentId: string): string {
  return `/api/enrollments/${encodeURIComponent(enrollmentId)}`;
}

/** The PATCH body: a mentor's id, or `null` to remove the mentor. Nothing else changes. */
export function mentorAssignmentBody(mentorId: string | null): { mentorId: string | null } {
  return { mentorId: mentorId || null };
}

/** Options in the server's order (by name), the current mentor flagged. Never filtered by role. */
export function mentorChoices(
  options: readonly PrepMentorOption[],
  currentMentorId: string | null | undefined,
  query = "",
): { option: PrepMentorOption; current: boolean }[] {
  const q = query.trim().toLowerCase();
  return options
    .filter((option) => !q || option.name.toLowerCase().includes(q) || option.email.toLowerCase().includes(q))
    .map((option) => ({ option, current: option.id === currentMentorId }));
}

export const MENTOR_ELIGIBILITY_NOTE =
  "Anyone listed here can be assigned as a mentor. Being listed or assigned doesn't give Servants Prep access.";

export function mentorChangedMessage(name: string | null): string {
  return name ? `Mentor changed to ${name}.` : "Mentor removed.";
}

/** Why an assignment failed, in words the person can act on. Nothing is shown as saved. */
export function mentorAssignmentError(status: number | null, serverMessage?: string): string {
  if (status === null) return "Couldn't reach the server. The mentor was not changed. Try again once you're connected.";
  const text = serverMessage?.trim() ?? "";
  if (/cannot be assigned as a mentor/i.test(text)) {
    return "That account can no longer be assigned as a mentor. The list was refreshed; choose again.";
  }
  if (/Year 2 mentor form/i.test(text)) {
    return "This Year 2 student hasn't confirmed this year's mentor details yet, so a mentor can't be assigned until they do.";
  }
  if (status === 403) return "Only Servants Prep administrators can assign mentors.";
  if (status === 404) return "This enrollment is no longer available.";
  if (status === 401) return "Your session expired. Sign in again to change the mentor.";
  return text && status >= 400 && status < 500 ? text : "Something went wrong. The mentor was not changed. Try again.";
}
