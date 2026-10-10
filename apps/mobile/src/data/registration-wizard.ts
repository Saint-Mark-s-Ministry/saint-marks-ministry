/**
 * Pure logic for the public Servants Prep Registration wizard (SMM-61).
 * Field set and every validation rule mirrors
 * app/api/registration/submit/route.ts exactly — confirmed against the
 * real route before building. `mentorName`/`mentorPhone`/`mentorEmail` are
 * real columns on RegistrationSubmission but are always null at this stage
 * (confirmed in the route's own create call) — mentor info is collected
 * later, not part of this form. "Start in Year 1" on the artboard has no
 * corresponding field in the real submit payload at all; every new
 * application starts Year 1 by definition, so it's shown as a fixed,
 * non-editable fact rather than inventing a selectable field with nothing
 * behind it.
 */

export const GRADE_OPTIONS = [
  "GRADE_9",
  "GRADE_10",
  "GRADE_11",
  "GRADE_12",
  "COLLEGE_FRESHMAN",
  "COLLEGE_SOPHOMORE",
  "COLLEGE_JUNIOR",
  "COLLEGE_SENIOR",
  "POST_COLLEGE",
  "OTHER",
] as const;
export type StudentGrade = (typeof GRADE_OPTIONS)[number];

const GRADE_LABELS: Record<StudentGrade, string> = {
  GRADE_9: "9th Grade",
  GRADE_10: "10th Grade",
  GRADE_11: "11th Grade",
  GRADE_12: "12th Grade",
  COLLEGE_FRESHMAN: "College Freshman",
  COLLEGE_SOPHOMORE: "College Sophomore",
  COLLEGE_JUNIOR: "College Junior",
  COLLEGE_SENIOR: "College Senior",
  POST_COLLEGE: "Post-College",
  OTHER: "Other",
};
export function gradeLabel(grade: string): string {
  return GRADE_LABELS[grade as StudentGrade] ?? grade;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RegistrationDraft = {
  inviteCode: string;
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string; // YYYY-MM-DD
  grade: StudentGrade | "";
  previouslyServed: boolean | null;
  previousServiceLocation: string;
  currentlyServing: boolean | null;
  previouslyAttendedPrep: boolean | null;
  previousPrepLocation: string;
  profileImageUrl: string;
  profileImageFilename: string;
};

export function emptyRegistrationDraft(inviteCode = ""): RegistrationDraft {
  return {
    inviteCode,
    fullName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    grade: "",
    previouslyServed: null,
    previousServiceLocation: "",
    currentlyServing: null,
    previouslyAttendedPrep: null,
    previousPrepLocation: "",
    profileImageUrl: "",
    profileImageFilename: "",
  };
}

export const WIZARD_STEPS = ["code", "personal", "history", "photo"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];
export const STEP_LABELS: Record<WizardStep, string> = {
  code: "Invite code",
  personal: "Personal information",
  history: "Service history",
  photo: "Profile picture",
};

export function canAdvanceFromStep(step: WizardStep, draft: RegistrationDraft, today: string): boolean {
  if (step === "code") return draft.inviteCode.trim().length > 0;
  if (step === "personal") {
    return (
      !!draft.fullName.trim() &&
      EMAIL_PATTERN.test(draft.email.trim()) &&
      !!draft.phone.trim() &&
      !!draft.dateOfBirth &&
      draft.dateOfBirth <= today &&
      !!draft.grade
    );
  }
  if (step === "history") {
    if (draft.previouslyServed === null || draft.currentlyServing === null || draft.previouslyAttendedPrep === null) return false;
    if (draft.previouslyServed && !draft.previousServiceLocation.trim()) return false;
    if (draft.previouslyAttendedPrep && !draft.previousPrepLocation.trim()) return false;
    return true;
  }
  return !!draft.profileImageUrl;
}

/** Final mirror of the server's own required-field + format checks, run once more right before submit. */
export function validateRegistrationDraft(draft: RegistrationDraft, today: string): string | null {
  if (!draft.inviteCode.trim()) return "Enter your invite code.";
  if (!draft.fullName.trim()) return "Enter your full name.";
  if (!EMAIL_PATTERN.test(draft.email.trim())) return "Enter a valid email address.";
  if (!draft.phone.trim()) return "Enter a phone number.";
  if (!draft.dateOfBirth || draft.dateOfBirth > today) return "Enter a valid date of birth.";
  if (!draft.grade) return "Choose a grade.";
  if (draft.previouslyServed === null || draft.currentlyServing === null || draft.previouslyAttendedPrep === null) {
    return "Answer every service-history question.";
  }
  if (draft.previouslyServed && !draft.previousServiceLocation.trim()) return "Enter where you previously served.";
  if (draft.previouslyAttendedPrep && !draft.previousPrepLocation.trim()) return "Enter where you previously attended.";
  if (!draft.profileImageUrl) return "Add a profile picture.";
  return null;
}

export function isRegistrationDraftDirty(draft: RegistrationDraft, blank: RegistrationDraft): boolean {
  return JSON.stringify(draft) !== JSON.stringify(blank);
}

// The real upload route's own limits (app/api/registration/upload/route.ts).
export const PROFILE_IMAGE_MAX_BYTES = 4.5 * 1024 * 1024;
export const PROFILE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif"];

export function validateProfileImage(file: { mimeType: string | null; size: number | null }): string | null {
  if (!file.mimeType || !PROFILE_IMAGE_TYPES.includes(file.mimeType)) {
    return "Choose a PNG, JPEG, or GIF image.";
  }
  if (file.size !== null && file.size > PROFILE_IMAGE_MAX_BYTES) {
    return `Image must be ${PROFILE_IMAGE_MAX_BYTES / 1024 / 1024} MB or smaller.`;
  }
  return null;
}

/** The real submit route's own duplicate-registration messages — matched exactly. */
const DUPLICATE_MESSAGES = [
  "An account with this email already exists. Please sign in; registration is only for new applicants.",
  "A registration with this email is already pending review",
  "A registration with this email has already been approved",
];
export function isDuplicateRegistrationError(message: string): boolean {
  return DUPLICATE_MESSAGES.includes(message);
}
