/**
 * Pure logic for the student "Application" screen (SMM-49). Mirrors
 * GET/PATCH /api/registration/application and POST .../upload exactly, so
 * nothing here invents a rule the server doesn't already enforce.
 *
 * The screen only ever shows the signed-in student's own application — no
 * guardian, family, or other-student data ever passes through this module.
 */

export type ApplicationDetails = {
  fatherOfConfessionName: string | null;
  approvalFormUrl: string | null;
  approvalFormFilename: string | null;
  mentorName: string | null;
  mentorPhone: string | null;
  mentorEmail: string | null;
};

export type AcademicYearRef = { id: string; name: string } | null;

/** The annual mentor form's review state, as the server reports it (null when no annual confirmation applies). */
export type MentorReviewStatus = "UPDATE_REQUIRED" | "PENDING_REVIEW" | "REVIEWED";

export type ApplicationState = {
  application: ApplicationDetails;
  mentorReviewStatus?: MentorReviewStatus | null;
  showChurchInformation: boolean;
  showApprovalForm: boolean;
  annualMentorRequired: boolean;
  academicYear: AcademicYearRef;
  missingDetails: string[];
  complete: boolean;
};

export function canViewOwnApplication(role?: string | null): boolean {
  return role === "STUDENT";
}

export type SectionId = "mentor" | "church" | "approvalForm";

/** Which sections the server actually wants shown — never assumed, always read from its own flags. */
export function visibleSections(
  state: Pick<ApplicationState, "showChurchInformation" | "showApprovalForm">,
): SectionId[] {
  return [
    "mentor",
    ...(state.showChurchInformation ? (["church"] as const) : []),
    ...(state.showApprovalForm ? (["approvalForm"] as const) : []),
  ];
}

/**
 * "X of N done", built from the server's own `missingDetails` keys — real
 * counts for whatever sections are actually visible, not the artboard's
 * illustrative "2 of 4".
 */
export function applicationProgress(
  state: Pick<ApplicationState, "showChurchInformation" | "showApprovalForm" | "missingDetails">,
): { done: number; total: number } {
  const total = visibleSections(state).length;
  const missingSections = new Set<SectionId>();
  for (const key of state.missingDetails) {
    if (key === "fatherOfConfession") missingSections.add("church");
    else if (key === "approvalForm") missingSections.add("approvalForm");
    else if (key === "mentorInformation") missingSections.add("mentor");
  }
  return { done: total - missingSections.size, total };
}

export type MentorFields = { mentorName: string; mentorPhone: string; mentorEmail: string };
export type FieldKey = "mentorName" | "mentorPhone" | "mentorEmail" | "fatherOfConfessionName";
export type FieldProblem = { field: FieldKey; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Mirrors the server's own PATCH checks, field by field, in the order a form
 * reads top to bottom — so the first problem found is also the first field
 * to focus.
 */
export function validateMentorFields(fields: MentorFields): FieldProblem | null {
  if (!fields.mentorName.trim())
    return { field: "mentorName", message: "Mentor servant's name is required." };
  if (!fields.mentorPhone.trim())
    return { field: "mentorPhone", message: "Mentor servant's phone number is required." };
  if (!fields.mentorEmail.trim())
    return { field: "mentorEmail", message: "Mentor servant's email address is required." };
  if (!EMAIL_RE.test(fields.mentorEmail.trim()))
    return { field: "mentorEmail", message: "Enter a valid email address." };
  return null;
}

/** Only required when the Church section is actually shown (an approved application exists). */
export function validateFatherOfConfession(name: string, required: boolean): FieldProblem | null {
  if (required && !name.trim())
    return { field: "fatherOfConfessionName", message: "Father of confession is required." };
  return null;
}

/** Runs the Church check (if shown) before the Mentor check, matching the screen's top-to-bottom order. */
export function firstFieldProblem(
  state: Pick<ApplicationState, "showChurchInformation">,
  fatherOfConfessionName: string,
  mentor: MentorFields,
): FieldProblem | null {
  return (
    validateFatherOfConfession(fatherOfConfessionName, state.showChurchInformation) ??
    validateMentorFields(mentor)
  );
}

const ALLOWED_FILE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif", "application/pdf"];
const MAX_FILE_SIZE = 4.5 * 1024 * 1024;

/** Mirrors the upload route's own type and size checks, so a bad pick never has to round-trip to be caught. */
export function validateApprovalFile(file: { mimeType: string | null; size: number | null }): string | null {
  if (!file.mimeType || !ALLOWED_FILE_TYPES.includes(file.mimeType))
    return "Please choose a PNG, JPG, GIF, or PDF file.";
  if (file.size !== null && file.size > MAX_FILE_SIZE) return "File size exceeds 4.5 MB limit.";
  return null;
}

/** An unsaved value always wins over what the server last had — that's the whole point of a draft. */
export function fieldWithDraft(serverValue: string | null, draftValue: string | null): string {
  return draftValue ?? serverValue ?? "";
}

// --- Async parity (matches the corrected web Application page) ---

const OFFLINE_MESSAGE = "Could not reach the server. Check your connection and try again.";
const NOT_FOUND_MESSAGE = "Application information not found";

export type LoadFailure = { title: string; body: string };

/**
 * What to show when the application can't be loaded. Every case is retryable
 * and none of them claims a registration was or wasn't approved: an async
 * student has no registration or cohort year, so the absence of one is never
 * the reason a screen is unavailable.
 */
export function describeLoadFailure(message: string | null | undefined): LoadFailure {
  if (message === OFFLINE_MESSAGE) {
    return {
      title: "You're offline",
      body: "Couldn't reach the server. Check your connection and try again.",
    };
  }
  if (message === NOT_FOUND_MESSAGE) {
    return {
      title: "Application unavailable",
      body:
        "There is nothing to complete on this account right now. If you were asked to confirm your mentor or finish your application, ask a Servants Prep servant to check that your enrollment is active, then try again.",
    };
  }
  return {
    title: "Application unavailable",
    body: message?.trim() || "Application information is unavailable for this account.",
  };
}

/** The screen heading for the two experiences, mirroring the web page. */
export function applicationHeading(
  state: Pick<ApplicationState, "annualMentorRequired" | "academicYear"> | null | undefined,
): { title: string; subtitle: string } {
  if (state?.annualMentorRequired) {
    return {
      title: "Confirm your mentor",
      subtitle: `Confirm your mentor servant's contact information for ${state.academicYear?.name ?? "the current academic year"}`,
    };
  }
  return { title: "Application", subtitle: "Complete the rest of your Servants Prep application" };
}

/** The confirmation after a successful save, in the web page's words. An annual form goes to an admin for review. */
export function saveSuccessMessage(state: Pick<ApplicationState, "annualMentorRequired" | "complete">): string {
  if (state.annualMentorRequired) return "Mentor information submitted for admin review";
  return state.complete ? "Application completed" : "Application details saved";
}

/** A save the API refused, in words that say what to do. View As is read-only on the server. */
export function saveErrorMessage(serverMessage: string | null | undefined): string {
  const text = serverMessage?.trim() ?? "";
  if (/ViewAsReadOnly/i.test(text)) return "You're viewing as this student, so changes are read-only.";
  return text || "Unable to save application. Please try again.";
}

/** The badge beside "Mentor servant" for an annual confirmation, from the server's own status; null when none applies. */
export function reviewBadge(
  state: Pick<ApplicationState, "annualMentorRequired" | "mentorReviewStatus"> | null | undefined,
): { label: string; tone: "warning" | "info" | "success" } | null {
  if (!state?.annualMentorRequired) return null;
  switch (state.mentorReviewStatus) {
    case "REVIEWED": return { label: "Confirmed", tone: "success" };
    case "PENDING_REVIEW": return { label: "Awaiting admin review", tone: "info" };
    default: return { label: "Update required", tone: "warning" };
  }
}

/**
 * Cache scope for the application read. Under View As the effective student is not the signed-in person, so the key carries
 * both: one account's application can never be shown from, or written into, another's cache entry.
 */
export function applicationScope(userId: string | undefined, viewingAsOriginalId?: string | null): string | undefined {
  if (!userId) return undefined;
  return `application:${viewingAsOriginalId ? `${viewingAsOriginalId}>` : ""}${userId}`;
}

/**
 * Where an unsaved draft lives. A View As session is read-only and must never write to, or restore from, the viewed student's
 * draft, so it has no draft at all.
 */
export function draftStorageKey(userId: string | undefined, viewingAs: boolean): string | null {
  return userId && !viewingAs ? `stmark.application-draft.${userId}` : null;
}

export const VIEW_AS_APPLICATION_NOTE =
  "You're viewing this student's application. It is read-only: nothing can be typed, saved or uploaded.";
