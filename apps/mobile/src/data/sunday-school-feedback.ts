/**
 * Pure logic for the Sunday School Feedback list and response sheet (SMM-57).
 *
 * `sortFeedbackIdeas` mirrors `lib/sunday-school-feedback.ts`'s own status
 * ordering exactly (PR #134) — this ticket's own "Feedback response
 * attribution" note requires the same status ordering as the web flow, so
 * this is a port, not a reinterpretation.
 */

import type {
  SundaySchoolFeedbackIdea,
  SundaySchoolFeedbackResponse,
  SundaySchoolFeedbackStatus,
  SundaySchoolFeedbackType,
  SundaySchoolFeedbackVoteType,
} from "@stmark/contracts";

export const DEVELOPMENT_TEAM_LABEL = "Development Team";
export const FEEDBACK_RESPONSE_MAX_LENGTH = 2000;

export type FeedbackCategory = "ALL" | SundaySchoolFeedbackType;
export type FeedbackStatusFilter = "ALL" | SundaySchoolFeedbackStatus;
export type FeedbackSort = "TOP" | "NEWEST";
/** The board lists everything; the roadmap groups ideas by where they are in the plan. */
export type BoardMode = "board" | "roadmap";

export const FEEDBACK_TITLE_MIN_LENGTH = 3;
export const FEEDBACK_TITLE_MAX_LENGTH = 120;
export const FEEDBACK_DESCRIPTION_MAX_LENGTH = 2000;

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

export const FEEDBACK_STATUSES: SundaySchoolFeedbackStatus[] = ["OPEN", "PLANNED", "IN_PROGRESS", "COMPLETED", "DECLINED"];

export interface FeedbackFilters {
  search: string;
  type: FeedbackCategory;
  /** Board only: the roadmap already groups by status, so it ignores this. */
  status: FeedbackStatusFilter;
  sort: FeedbackSort;
  /** Only the viewer's own posts. */
  mine: boolean;
}

export const DEFAULT_FEEDBACK_FILTERS: FeedbackFilters = { search: "", type: "ALL", status: "ALL", sort: "TOP", mine: false };

/** Same fields the web board searches: the post, the team's reply and who wrote it. */
export function matchesSearch<T extends Pick<SundaySchoolFeedbackIdea, "title" | "description"> & Partial<Pick<SundaySchoolFeedbackIdea, "teamResponse" | "submitter">>>(idea: T, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [idea.title, idea.description, idea.teamResponse, idea.submitter?.name].some((value) => value?.toLowerCase().includes(q));
}

/** Whether "Clear filters" has anything to clear. The status filter counts only where it applies. */
export function hasActiveFilters(filters: FeedbackFilters, mode: BoardMode): boolean {
  return !!filters.search.trim() || filters.type !== "ALL" || filters.mine || (mode === "board" && filters.status !== "ALL");
}

/** How many of the menu-held filters (type, status, mine) are set, for the badge on the filter control. */
export function activeFilterCount(filters: FeedbackFilters, mode: BoardMode): number {
  return (filters.type !== "ALL" ? 1 : 0) + (filters.mine ? 1 : 0) + (mode === "board" && filters.status !== "ALL" ? 1 : 0);
}

/** Clearing keeps the chosen sort: it is an ordering, not a filter. */
export function clearFeedbackFilters(filters: FeedbackFilters): FeedbackFilters {
  return { ...DEFAULT_FEEDBACK_FILTERS, sort: filters.sort };
}

type Filterable = Pick<SundaySchoolFeedbackIdea, "type" | "status" | "title" | "description" | "teamResponse" | "submitter" | "createdAt" | "upvotes" | "downvotes">;

export function filterFeedback<T extends Filterable>(ideas: T[], filters: FeedbackFilters, mode: BoardMode, viewerId: string | undefined): T[] {
  const matching = ideas.filter(
    (idea) =>
      (filters.type === "ALL" || idea.type === filters.type) &&
      (mode === "roadmap" || filters.status === "ALL" || idea.status === filters.status) &&
      (!filters.mine || (!!viewerId && idea.submitter?.id === viewerId)) &&
      matchesSearch(idea, filters.search),
  );
  return sortFeedbackIdeas(matching, filters.sort);
}

export const ROADMAP_STAGES: { status: SundaySchoolFeedbackStatus; description: string }[] = [
  { status: "PLANNED", description: "On the horizon" },
  { status: "IN_PROGRESS", description: "Being worked on" },
  { status: "COMPLETED", description: "Ready to use" },
];

export interface RoadmapColumn<T> {
  status: SundaySchoolFeedbackStatus;
  label: string;
  description: string;
  ideas: T[];
}

/** The roadmap's three stages, each with its (already filtered and sorted) ideas. Open and declined ideas are not on the roadmap. */
export function roadmapColumns<T extends Pick<SundaySchoolFeedbackIdea, "status">>(ideas: T[]): RoadmapColumn<T>[] {
  return ROADMAP_STAGES.map((stage) => ({
    ...stage,
    label: statusLabel(stage.status),
    ideas: ideas.filter((idea) => idea.status === stage.status),
  }));
}

/** The empty-stage sentence: a filter explains the gap, otherwise nothing has reached the stage yet. */
export function roadmapEmptyMessage(status: SundaySchoolFeedbackStatus, filtered: boolean): string {
  return filtered ? "No matching feedback in this stage." : `No ${statusLabel(status).toLowerCase()} feedback yet.`;
}

// ── Filters survive leaving and returning to the board ──────────────────────

interface RememberedBoard {
  userId: string;
  mode: BoardMode;
  filters: FeedbackFilters;
}
let remembered: RememberedBoard | null = null;

/** Keeps the board's view and filters for this session, for this person only. */
export function rememberBoard(userId: string, mode: BoardMode, filters: FeedbackFilters): void {
  remembered = { userId, mode, filters };
}

/** What this person last had on the board, or the defaults. Another person's choices are never returned. */
export function recallBoard(userId: string | undefined): { mode: BoardMode; filters: FeedbackFilters } {
  return remembered && userId && remembered.userId === userId
    ? { mode: remembered.mode, filters: remembered.filters }
    : { mode: "board", filters: DEFAULT_FEEDBACK_FILTERS };
}

export function forgetBoard(): void {
  remembered = null;
}

// ── What this person may do ─────────────────────────────────────────────────

type Viewer = SundaySchoolFeedbackResponse["viewer"];

export interface FeedbackCapabilities {
  canRead: boolean;
  canSubmit: boolean;
  canModerate: boolean;
  /** View As is a read-only preview, whatever the previewed account could do. */
  previewing: boolean;
}

/**
 * The server's `viewer` flags, narrowed by View As. The app grants nothing of its own: a missing viewer (still
 * loading, or refused) can do nothing, and an explicit `canRead: false` closes the board. The deployed route
 * answers 403 instead of sending `canRead: false`, which the screen treats the same way.
 */
export function feedbackCapabilities(viewer: Partial<Viewer> | undefined, viewingAs: boolean): FeedbackCapabilities {
  const canRead = !!viewer && viewer.canRead !== false;
  return {
    canRead,
    canSubmit: canRead && viewer?.canSubmit === true && !viewingAs,
    canModerate: canRead && viewer?.canModerate === true && !viewingAs,
    previewing: viewingAs,
  };
}

export interface IdeaCapabilities {
  canVote: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canReply: boolean;
  canChangeStatus: boolean;
}

/** Per-post actions: the server's per-idea flags and the moderator flag, all off in a preview. */
export function ideaCapabilities(idea: Pick<SundaySchoolFeedbackIdea, "canVote" | "canEdit" | "canDelete">, caps: FeedbackCapabilities): IdeaCapabilities {
  const live = caps.canRead && !caps.previewing;
  return {
    canVote: live && idea.canVote,
    canEdit: live && idea.canEdit,
    canDelete: live && idea.canDelete,
    canReply: caps.canModerate,
    canChangeStatus: caps.canModerate,
  };
}

/** Choosing the vote you already have takes it back, as on the web. */
export function nextVote(current: SundaySchoolFeedbackVoteType | null, requested: SundaySchoolFeedbackVoteType): SundaySchoolFeedbackVoteType | null {
  return current === requested ? null : requested;
}

/** The small print under a post: whose it is, and why voting is closed. */
export function ideaFootnote(idea: Pick<SundaySchoolFeedbackIdea, "submitter" | "createdAt" | "status">, viewerId: string | undefined): string {
  const parts = [submittedLabel(idea)];
  if (viewerId && idea.submitter?.id === viewerId) parts.push("Your idea");
  if (isResolved(idea.status)) parts.push("Voting closed");
  return parts.join(" · ");
}

/** Why the board could not be shown, in the person's terms. */
export function feedbackLoadMessage(status: number | undefined, fallback: string | undefined): string | undefined {
  if (status === 403) return "Feedback isn't available for this account. If you expected access, ask an administrator.";
  return fallback;
}

/** The title is required, 3 to 120 characters, once trimmed (the server's rule). */
export function validateFeedbackTitle(value: string): string | null {
  const length = value.trim().length;
  if (length < FEEDBACK_TITLE_MIN_LENGTH) return `Title must be at least ${FEEDBACK_TITLE_MIN_LENGTH} characters.`;
  if (length > FEEDBACK_TITLE_MAX_LENGTH) return `Title must be ${FEEDBACK_TITLE_MAX_LENGTH} characters or fewer.`;
  return null;
}


/** "Oct 14, 2026" (the board shows the year, as the web does). */
export function postedDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
  const name = idea.submitter?.name ?? "Former user";
  return `${name} · ${postedDate(idea.createdAt)}`;
}

/** Where an unpublished reply is kept on this device, per person and post. */
export function replyDraftKey(userId: string, ideaId: string): string {
  return `stmark.feedback-response-draft.${userId}.${ideaId}`;
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
