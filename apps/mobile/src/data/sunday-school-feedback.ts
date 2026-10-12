/**
 * Pure logic for the Sunday School Feedback list and response sheet (SMM-57).
 *
 * `sortFeedbackIdeas` mirrors `lib/sunday-school-feedback.ts`'s own status
 * ordering exactly (PR #134) — this ticket's own "Feedback response
 * attribution" note requires the same status ordering as the web flow, so
 * this is a port, not a reinterpretation.
 */

import type { SundaySchoolFeedbackIdea, SundaySchoolFeedbackStatus, SundaySchoolFeedbackType } from "@stmark/contracts";
import { shortMonthDay } from "./sunday-school-classes";

export const DEVELOPMENT_TEAM_LABEL = "Development Team";
export const FEEDBACK_RESPONSE_MAX_LENGTH = 2000;

export type FeedbackView = "top" | "newest" | "mine";
export type FeedbackCategory = "ALL" | SundaySchoolFeedbackType;

const STATUS_SORT_ORDER: Record<SundaySchoolFeedbackStatus, number> = {
  OPEN: 0,
  IN_PROGRESS: 1,
  PLANNED: 1,
  DECLINED: 2,
  COMPLETED: 3,
};

/** Exactly mirrors the server's own `sortFeedbackIdeas` (lib/sunday-school-feedback.ts). */
export function sortFeedbackIdeas<T extends Pick<SundaySchoolFeedbackIdea, "status" | "createdAt" | "upvotes" | "downvotes">>(
  ideas: T[],
  sort: "TOP" | "NEWEST",
): T[] {
  return [...ideas].sort((a, b) => {
    const statusDifference = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
    if (statusDifference !== 0) return statusDifference;

    const createdDifference = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sort === "NEWEST") return createdDifference;

    if (b.upvotes !== a.upvotes) return b.upvotes - a.upvotes;
    if (a.downvotes !== b.downvotes) return a.downvotes - b.downvotes;
    return createdDifference;
  });
}

/**
 * The list screen's three-way Top/Newest/Mine control. "Mine" is a client-
 * side ownership filter (no server status/sort value covers it) over
 * whichever ideas the server already sent — then still sorted by TOP so
 * "Mine" isn't a random order.
 */
export function applyFeedbackView<T extends Pick<SundaySchoolFeedbackIdea, "status" | "createdAt" | "upvotes" | "downvotes" | "submitter">>(
  ideas: T[],
  view: FeedbackView,
  viewerId: string | undefined,
): T[] {
  const scoped = view === "mine" ? ideas.filter((idea) => idea.submitter?.id === viewerId) : ideas;
  return sortFeedbackIdeas(scoped, view === "newest" ? "NEWEST" : "TOP");
}

export function filterByCategory<T extends Pick<SundaySchoolFeedbackIdea, "type">>(ideas: T[], category: FeedbackCategory): T[] {
  if (category === "ALL") return ideas;
  return ideas.filter((idea) => idea.type === category);
}

export function matchesSearch<T extends Pick<SundaySchoolFeedbackIdea, "title" | "description">>(idea: T, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return idea.title.toLowerCase().includes(q) || !!idea.description?.toLowerCase().includes(q);
}

export function typeLabel(type: SundaySchoolFeedbackType): string {
  return type === "PROBLEM" ? "Problem" : "Idea";
}

export function statusLabel(status: SundaySchoolFeedbackStatus): string {
  if (status === "IN_PROGRESS") return "In progress";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function isResolved(status: SundaySchoolFeedbackStatus): boolean {
  return status === "COMPLETED" || status === "DECLINED";
}

export function submittedLabel(idea: Pick<SundaySchoolFeedbackIdea, "submitter" | "createdAt">): string {
  const name = idea.submitter?.name ?? "Former member";
  return `${name} · ${shortMonthDay(idea.createdAt)}`;
}

/** A one-line list preview of the public reply, so the queue doesn't need the full text. */
export function responsePreview(idea: Pick<SundaySchoolFeedbackIdea, "teamResponse">): string | null {
  if (!idea.teamResponse) return null;
  const text = idea.teamResponse.trim();
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

/** Mirrors the server's own validateFeedbackTeamResponse exactly (1–2000 trimmed chars). */
export function validateFeedbackResponseDraft(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= FEEDBACK_RESPONSE_MAX_LENGTH ? trimmed : null;
}

export interface FeedbackComposerDraft {
  type: SundaySchoolFeedbackType;
  title: string;
  description: string;
}

export function emptyComposerDraft(): FeedbackComposerDraft {
  return { type: "IDEA", title: "", description: "" };
}

export function isComposerDraftDirty(draft: FeedbackComposerDraft, original: FeedbackComposerDraft): boolean {
  return draft.type !== original.type || draft.title !== original.title || draft.description !== original.description;
}
