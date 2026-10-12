/**
 * Pure logic for the student's four-week rotation form workflow (SMM-90),
 * replacing the weekly serving-code screen.
 *
 * Mirrors lib/rotation-forms.ts on the server. The calendar convention is the
 * server's: every date is a UTC calendar day, and the fourth week's date is
 * when the form may first be uploaded. Never derive these from local time, or
 * a student west of UTC would see the wrong day.
 */

import type { RotationAssignment, RotationFormStatus, RotationFormSummary } from "@stmark/contracts";

export type { RotationAssignment, RotationFormStatus, RotationFormSummary };

export const ROTATION_WEEKS = 4;
export const ROTATION_FORM_MAX_BYTES = 4.5 * 1024 * 1024;
export const ROTATION_FORM_FILE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];

/** Same arithmetic as the server: week N starts (N-1) weeks after the start, at UTC midnight. */
export function rotationWeekDate(startDate: string | Date, weekNumber: number): Date {
  const date = new Date(startDate);
  date.setUTCDate(date.getUTCDate() + (weekNumber - 1) * 7);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

/** The form can be uploaded once the fourth week's date has arrived. */
export function rotationCanSubmit(startDate: string | Date, now: Date = new Date()): boolean {
  return now.getTime() >= rotationWeekDate(startDate, ROTATION_WEEKS).getTime();
}

function formatUtc(date: Date, options: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

/** "Oct 4, 2026 – Oct 25, 2026": the first Sunday through the fourth, as the web card shows it. */
export function rotationRange(startDate: string, totalWeeks: number = ROTATION_WEEKS): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return `${formatUtc(new Date(startDate), opts)} – ${formatUtc(rotationWeekDate(startDate, totalWeeks), opts)}`;
}

/** "October 25, 2026": when upload opens. */
export function uploadOpensOn(startDate: string): string {
  return formatUtc(rotationWeekDate(startDate, ROTATION_WEEKS), { month: "long", day: "numeric", year: "numeric" });
}

export type FormStatusTone = "success" | "warning" | "danger" | "neutral";

/** The single status each card shows. No per-week boxes, no attendance percentages. */
export function formStatus(form: Pick<RotationFormSummary, "status"> | null | undefined): { label: string; tone: FormStatusTone } {
  if (form?.status === "APPROVED") return { label: "Approved", tone: "success" };
  if (form?.status === "REJECTED") return { label: "Changes requested", tone: "danger" };
  if (form?.status === "PENDING") return { label: "Awaiting review", tone: "warning" };
  return { label: "Not submitted", tone: "neutral" };
}

export type UploadBlocker =
  | { kind: "open" }
  | { kind: "approved" }
  | { kind: "inactive" }
  | { kind: "not-four-weeks" }
  | { kind: "not-yet"; opensOn: string };

/** Why upload is unavailable, or "open". Checked in the order the server enforces it. */
export function uploadBlocker(assignment: RotationAssignment, now: Date = new Date()): UploadBlocker {
  if (assignment.rotationForm?.status === "APPROVED") return { kind: "approved" };
  if (!assignment.isActive) return { kind: "inactive" };
  if (assignment.totalWeeks !== ROTATION_WEEKS) return { kind: "not-four-weeks" };
  if (!rotationCanSubmit(assignment.startDate, now)) return { kind: "not-yet", opensOn: uploadOpensOn(assignment.startDate) };
  return { kind: "open" };
}

export function uploadBlockerMessage(blocker: UploadBlocker): string | null {
  switch (blocker.kind) {
    case "not-yet":
      return `Upload opens on ${blocker.opensOn}, after you complete all four weeks and collect all four signatures.`;
    case "not-four-weeks":
      return "Ask your Servants Prep servant to set this rotation to four weeks.";
    case "inactive":
      return "This rotation is no longer active.";
    default:
      return null;
  }
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
};

/** The picker's mime type when it gives one; otherwise inferred from the file name. */
export function resolveMimeType(mimeType: string | null | undefined, name: string | null | undefined): string | null {
  if (mimeType) return mimeType.toLowerCase();
  const extension = name?.split(".").pop()?.toLowerCase();
  return (extension && MIME_BY_EXTENSION[extension]) || null;
}

export function isImageFile(mimeType: string | null | undefined, name?: string | null): boolean {
  return !!resolveMimeType(mimeType, name)?.startsWith("image/");
}

function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/** Checked before any upload so the student gets a next step, not a server rejection. */
export function validateRotationFile(file: {
  mimeType?: string | null;
  size?: number | null;
  name?: string | null;
}): string | null {
  const type = resolveMimeType(file.mimeType, file.name);
  if (!type || !ROTATION_FORM_FILE_TYPES.includes(type)) {
    return "Choose a photo (JPEG, PNG, WebP, or GIF) or a PDF. Photos saved as HEIC need to be taken again with Take photo.";
  }
  if (file.size === 0) return "That file is empty. Choose or take it again.";
  if (typeof file.size === "number" && file.size > ROTATION_FORM_MAX_BYTES) {
    return `That file is ${megabytes(file.size)} MB. The limit is 4.5 MB. Take a new photo from a little further back, or choose a smaller file.`;
  }
  return null;
}

/** What to tell the student when the upload fails. Server text is kept when it already says what to do. */
export function uploadErrorMessage(status: number | null, serverMessage?: string): string {
  if (status === null) return "Couldn't reach the server. Your form is still selected. Upload again once you're connected.";
  if (status === 413) return "That file is too large. The limit is 4.5 MB. Take a new photo or choose a smaller file.";
  if (status === 401) return "Your session expired. Sign in again to upload.";
  if (status === 403 && !serverMessage) return "Only active async students can upload rotation forms.";
  if (serverMessage && status >= 400 && status < 500) return serverMessage;
  return "Something went wrong uploading the form. Your form is still selected. Try again.";
}

/** "3 of 10 grade levels approved". */
export function progressLabel(completed: number, required: number): string {
  return `${completed} of ${required} grade levels approved`;
}

export function progressSegments(completed: number, required: number): boolean[] {
  return Array.from({ length: Math.max(0, required) }, (_, index) => index < completed);
}

/** The form text a student sees under a card's status. */
export function formNote(form: RotationFormSummary | null): string | null {
  if (!form) return null;
  if (form.status === "PENDING") return "Awaiting review. You remain in this class until all four weeks are approved.";
  if (form.status === "APPROVED") return "Four weeks approved.";
  return "Changes requested. Correct the form and upload it again.";
}

/**
 * A cheap fingerprint of everything that changes what the student's classes
 * and lessons look like, so a review result refreshes them without a relaunch.
 */
export function rotationSignature(progress: {
  completedRotations: number;
  assignments: RotationAssignment[];
}): string {
  const active = progress.assignments.find((assignment) => assignment.isActive);
  return [
    progress.completedRotations,
    active?.assignmentId ?? "none",
    active?.class?.id ?? "none",
    active?.rotationForm ? `${active.rotationForm.status}:${active.rotationForm.version}` : "no-form",
  ].join("|");
}

export function canViewOwnRotation(role?: string | null): boolean {
  return role === "STUDENT";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/**
 * The corrected Servants Prep Rotations Form, as printed on the web
 * (app/dashboard/student/attendance-slip/page.tsx): two copies per page, each
 * with name and grade lines and four signed-week rows. It is paper in both
 * appearances, so the colors are fixed.
 */
export function rotationFormHtml(): string {
  const copy = (index: number) => `
    <section>
      <h1>Servants Prep Rotations Form</h1>
      <p class="row"><span>Attendee Name: ____________________________</span><span>Grade Attended: ______________</span></p>
      <p class="note">*Only sign if the attendee was present at the beginning of class and attended for its entirety.</p>
      <table aria-label="${escapeHtml(`Rotations form ${index + 1}`)}">
        <thead><tr><th class="week">Week</th><th class="date">Date</th><th>Servant name (Print)</th><th>Servant Signature</th></tr></thead>
        <tbody>${[1, 2, 3, 4].map((week) => `<tr><th class="week" scope="row">${week}</th><td></td><td></td><td></td></tr>`).join("")}</tbody>
      </table>
    </section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { margin: 0.6in; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1B1817; background: #fff; }
  section { page-break-inside: avoid; margin-bottom: 36px; }
  h1 { text-align: center; font-size: 20px; margin: 0 0 16px; }
  .row { display: flex; justify-content: space-between; gap: 16px; font-size: 14px; margin: 0 0 12px; }
  .note { font-size: 12px; font-style: italic; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { border: 1px solid #000; padding: 8px; text-align: left; height: 34px; }
  th.week { width: 56px; font-weight: normal; }
  th.date { width: 112px; }
  thead th { font-weight: 600; }
</style></head><body>${[0, 1].map(copy).join("")}</body></html>`;
}
