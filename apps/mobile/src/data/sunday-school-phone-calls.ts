/**
 * Pure logic for the Sunday School phone-call follow-up flow (SMM-76).
 *
 * The real model (SundaySchoolPhoneCall) is deliberately separate from
 * SundaySchoolVisitation — confirmed against the real POST
 * /api/sunday-school/phone-calls route and Prisma schema — so saving a call
 * never creates or completes a visitation. This module mirrors that route's
 * own validation exactly, so the sheet fails fast before a request.
 */

import type { SundaySchoolPhoneCallOutcome, SundaySchoolPhoneCallRecord } from "@stmark/contracts";
import { shortMonthDay } from "./sunday-school-classes";

export const CALL_NOTE_MAX_LENGTH = 500;

export const CALL_OUTCOMES: SundaySchoolPhoneCallOutcome[] = ["CONNECTED", "LEFT_VOICEMAIL", "NO_ANSWER", "OTHER"];

export function callOutcomeLabel(outcome: SundaySchoolPhoneCallOutcome): string {
  if (outcome === "CONNECTED") return "Connected";
  if (outcome === "LEFT_VOICEMAIL") return "Left voicemail";
  if (outcome === "NO_ANSWER") return "No answer";
  return "Other";
}

export function callRowSubtitle(call: SundaySchoolPhoneCallRecord): string {
  return `${callOutcomeLabel(call.outcome)} · ${shortMonthDay(call.calledAt)} · ${call.callerName}`;
}

export type CallDraft = {
  calledAt: string;
  outcome: SundaySchoolPhoneCallOutcome | "";
  note: string;
};

export function emptyCallDraft(today: string): CallDraft {
  return { calledAt: today, outcome: "", note: "" };
}

/** Mirrors app/api/sunday-school/phone-calls/route.ts's own checks exactly. */
export function validateCallDraft(draft: CallDraft, today: string): string | null {
  if (!draft.calledAt) return "Enter a valid call date.";
  if (draft.calledAt > today) return "A call cannot be dated in the future.";
  if (!draft.outcome) return "Choose a call outcome.";
  const note = draft.note.trim();
  if (!note || note.length > CALL_NOTE_MAX_LENGTH) return `Enter a note of ${CALL_NOTE_MAX_LENGTH} characters or fewer.`;
  return null;
}

export function isCallDraftDirty(draft: CallDraft, blank: CallDraft): boolean {
  return draft.calledAt !== blank.calledAt || draft.outcome !== blank.outcome || draft.note.trim() !== blank.note.trim();
}
