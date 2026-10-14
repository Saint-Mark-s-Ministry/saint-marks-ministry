/**
 * Pure logic for the public Servant sign-up screen (SMM-61).
 * Mirrors app/api/servant-applications/submit/route.ts's own checks exactly.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ServantSignupDraft = {
  fullName: string;
  email: string;
  phone: string;
  currentGrade: string;
};

export function emptyServantSignupDraft(): ServantSignupDraft {
  return { fullName: "", email: "", phone: "", currentGrade: "" };
}

export function isServantSignupDraftDirty(draft: ServantSignupDraft, blank: ServantSignupDraft): boolean {
  return (
    draft.fullName.trim() !== blank.fullName.trim() ||
    draft.email.trim() !== blank.email.trim() ||
    draft.phone.trim() !== blank.phone.trim() ||
    draft.currentGrade.trim() !== blank.currentGrade.trim()
  );
}

export function validateServantSignup(draft: ServantSignupDraft): string | null {
  if (!draft.fullName.trim()) return "Enter your full name.";
  if (!EMAIL_PATTERN.test(draft.email.trim())) return "Enter a valid email address.";
  if (!draft.phone.trim()) return "Enter a phone number.";
  if (!draft.currentGrade.trim()) return "Enter the grade you serve.";
  return null;
}

/** The real route's own duplicate messages — matched exactly, so the UI can offer "Sign in instead" rather than a dead-end error. */
export function isDuplicateApplicationError(message: string): boolean {
  return message === "An application with this email is already pending or approved" || message === "A user with this email already exists";
}
