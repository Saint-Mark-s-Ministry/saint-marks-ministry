/**
 * Pure logic for the public Parent sign-up screen (SMM-61).
 * Mirrors app/api/auth/signup/parent/route.ts's own checks exactly, so the
 * form fails fast before a request — including the one real duplicate-
 * account case that route itself already detects (an existing user with
 * that email), so this screen can preserve the typed form and offer
 * "Sign in instead" rather than losing the draft to a vague server error.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PARENT_PASSWORD_MIN_LENGTH = 8;

export type ParentSignupDraft = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

export function emptyParentSignupDraft(): ParentSignupDraft {
  return { fullName: "", email: "", phone: "", password: "", confirmPassword: "" };
}

export function isParentSignupDraftDirty(draft: ParentSignupDraft, blank: ParentSignupDraft): boolean {
  return (
    draft.fullName.trim() !== blank.fullName.trim() ||
    draft.email.trim() !== blank.email.trim() ||
    draft.phone.trim() !== blank.phone.trim() ||
    draft.password !== blank.password ||
    draft.confirmPassword !== blank.confirmPassword
  );
}

export function validateParentSignup(draft: ParentSignupDraft): string | null {
  if (!draft.fullName.trim()) return "Enter your full name.";
  if (!EMAIL_PATTERN.test(draft.email.trim())) return "Enter a valid email address.";
  if (draft.password.length < PARENT_PASSWORD_MIN_LENGTH) return `Password must be at least ${PARENT_PASSWORD_MIN_LENGTH} characters`;
  if (draft.password !== draft.confirmPassword) return "Passwords do not match";
  return null;
}

/** The real route's own duplicate-account message — matched exactly, so the UI can offer "Sign in instead" rather than a dead-end error. */
export function isDuplicateAccountError(message: string): boolean {
  return message === "An account with this email already exists";
}
