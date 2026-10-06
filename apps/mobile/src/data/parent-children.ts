import { LEVEL_ORDER } from "@stmark/domain";

/**
 * Pure logic for the parent "My children" and "Register a child" screens
 * (SMM-47): the registration form's validation, its required-field progress,
 * the saved draft, and status wording.
 *
 * The date and phone rules mirror lib/parent-registration.ts on the server.
 * Keep the two in step. The server is still the final check.
 */

/** The same ordered list the server validates against, from the shared domain package. */
export const LEVELS = LEVEL_ORDER;
export type Level = (typeof LEVEL_ORDER)[number];

export { getLevelDisplayName as levelLabel } from "@stmark/domain";

export const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "", label: "Prefer not to say" },
];

export type RegistrationForm = {
  firstName: string;
  lastName: string;
  birthDate: string; // YYYY-MM-DD
  level: string;
  gender: string; // "MALE" | "FEMALE" | ""
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  notes: string;
};

export const EMPTY_FORM: RegistrationForm = {
  firstName: "",
  lastName: "",
  birthDate: "",
  level: "",
  gender: "",
  guardianName: "",
  guardianPhone: "",
  guardianEmail: "",
  notes: "",
};

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const EARLIEST_BIRTH_YEAR = 1950;

/** Mirrors parseBirthDate on the server: a real calendar day, not in the future, not before 1950. */
export function parseBirthDate(value: string, today: Date): Date | null {
  const match = DATE_PATTERN.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < EARLIEST_BIRTH_YEAR) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (date.getTime() > todayUtc) return null;
  return date;
}

/** Mirrors normalizePhone on the server: digits with an optional leading +, 7 to 15 digits. */
export function normalizePhone(value: string): string | null {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[\s\-.()]/g, "").replace(/^\+/, "");
  if (!/^\d{7,15}$/.test(digits)) return null;
  return `${hasPlus ? "+" : ""}${digits}`;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The day as YYYY-MM-DD in the device's own calendar, for the form field. */
export function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export type FormErrors = Partial<Record<keyof RegistrationForm, string>>;

/**
 * Every field's problem, if any. Empty means the form can be sent. Each message
 * says what to fix, so the student or parent knows the next step.
 */
export function validateRegistration(form: RegistrationForm, today: Date): FormErrors {
  const errors: FormErrors = {};
  if (!form.firstName.trim()) errors.firstName = "Enter the child's first name.";
  if (!form.lastName.trim()) errors.lastName = "Enter the child's last name.";
  if (!form.birthDate.trim()) errors.birthDate = "Choose the child's birth date.";
  else if (!parseBirthDate(form.birthDate, today)) errors.birthDate = "Choose a real birth date that isn't in the future.";
  if (!form.level) errors.level = "Choose the grade the child will join.";
  if (!form.guardianName.trim()) errors.guardianName = "Enter your name.";
  if (!form.guardianPhone.trim()) errors.guardianPhone = "Enter a phone number we can reach you on.";
  else if (!normalizePhone(form.guardianPhone)) errors.guardianPhone = "Enter a phone number with 7 to 15 digits.";
  if (form.guardianEmail.trim() && !EMAIL_PATTERN.test(form.guardianEmail.trim())) {
    errors.guardianEmail = "Enter an email address like name@example.com, or leave it blank.";
  }
  return errors;
}

const REQUIRED: (keyof RegistrationForm)[] = ["firstName", "lastName", "birthDate", "level", "guardianName", "guardianPhone"];

/** How much of the required part is filled in, so the form can show progress. */
export function requiredProgress(form: RegistrationForm): { done: number; total: number } {
  const done = REQUIRED.filter((key) => form[key].trim() !== "").length;
  return { done, total: REQUIRED.length };
}

/** Saved drafts are checked field by field, so a damaged or old draft can't break the form. */
export function parseDraft(raw: string | null): RegistrationForm | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const draft = { ...EMPTY_FORM };
    for (const key of Object.keys(EMPTY_FORM) as (keyof RegistrationForm)[]) {
      const field = (value as Record<string, unknown>)[key];
      if (typeof field !== "string") return null;
      draft[key] = field;
    }
    return draft;
  } catch {
    return null;
  }
}

export function serializeDraft(form: RegistrationForm): string {
  return JSON.stringify(form);
}

export const DRAFT_KEY = "stmark.parent.registrationDraft";

export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";
export function requestLabel(status: RequestStatus): { label: string; tone: "warning" | "success" | "danger" } {
  if (status === "APPROVED") return { label: "Approved", tone: "success" };
  if (status === "REJECTED") return { label: "Not approved", tone: "danger" };
  return { label: "Waiting for review", tone: "warning" };
}

/** Where a child sits: their class name, or a plain "not placed yet" until a coordinator places them. */
export function placementLabel(placement: { name: string } | null | undefined): string {
  return placement?.name ?? "Not placed in a class yet";
}

/** Only parents can open their family's screens. The server enforces the same rule, and each child is read only through the parent's own guardian link. */
export function canViewFamily(role?: string | null): boolean {
  return role === "PARENT";
}
