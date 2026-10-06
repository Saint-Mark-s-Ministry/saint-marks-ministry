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

export type ApplicationState = {
  application: ApplicationDetails;
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
