import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_FEEDBACK_FILTERS,
  activeFilterCount,
  clearFeedbackFilters,
  emptyComposerDraft,
  feedbackCapabilities,
  feedbackLoadMessage,
  filterFeedback,
  forgetBoard,
  hasActiveFilters,
  ideaCapabilities,
  ideaFootnote,
  isComposerDraftDirty,
  isResolved,
  matchesSearch,
  nextVote,
  recallBoard,
  rememberBoard,
  replyDraftKey,
  roadmapColumns,
  roadmapEmptyMessage,
  sortFeedbackIdeas,
  statusLabel,
  submittedLabel,
  typeLabel,
  validateFeedbackResponseDraft,
  validateFeedbackTitle,
  type FeedbackFilters,
} from "../../apps/mobile/src/data/sunday-school-feedback";

const base = {
  type: "IDEA" as const,
  description: null,
  teamResponse: null,
  createdAt: "2026-09-20T00:00:00.000Z",
  upvotes: 0,
  downvotes: 0,
};

describe("sortFeedbackIdeas", () => {
  it("ranks OPEN before PLANNED/IN_PROGRESS before DECLINED before COMPLETED, ties by votes (happy path)", () => {
    const ideas = [
      { ...base, id: "completed", status: "COMPLETED" as const, title: "c", upvotes: 100 },
      { ...base, id: "open-low", status: "OPEN" as const, title: "a", upvotes: 1 },
      { ...base, id: "open-high", status: "OPEN" as const, title: "b", upvotes: 5 },
      { ...base, id: "declined", status: "DECLINED" as const, title: "d", upvotes: 50 },
    ];
    const sorted = sortFeedbackIdeas(ideas, "TOP");
    expect(sorted.map((i) => i.id)).toEqual(["open-high", "open-low", "declined", "completed"]);
  });

  it("never lets a high-vote resolved item outrank an open one, even sorted NEWEST (highest-risk path)", () => {
    const ideas = [
      { ...base, id: "completed", status: "COMPLETED" as const, title: "c", upvotes: 999, createdAt: "2026-09-25T00:00:00.000Z" },
      { ...base, id: "open", status: "OPEN" as const, title: "a", upvotes: 0, createdAt: "2026-09-01T00:00:00.000Z" },
    ];
    expect(sortFeedbackIdeas(ideas, "NEWEST").map((i) => i.id)).toEqual(["open", "completed"]);
  });
});

const person = (id: string, name = id) => ({ id, name, profileImageUrl: null });
const post = (id: string, extra: Record<string, unknown> = {}) => ({
  ...base,
  id,
  status: "OPEN" as const,
  title: id,
  submitter: person("them", "Them"),
  ...extra,
});
const filters = (patch: Partial<FeedbackFilters> = {}): FeedbackFilters => ({ ...DEFAULT_FEEDBACK_FILTERS, ...patch });

describe("filterFeedback", () => {
  const ideas = [
    post("print-roster", { description: "Print the roster", upvotes: 2 }),
    post("save-button", { type: "PROBLEM" as const, description: "hidden on SMALL phones", upvotes: 9, submitter: person("me", "Me") }),
    post("planned-sync", { status: "PLANNED" as const, teamResponse: "We will sync calendars", upvotes: 4 }),
    post("done", { status: "COMPLETED" as const, upvotes: 50, submitter: person("me", "Me") }),
  ];

  it("filters by type, status and search, all together (happy path)", () => {
    expect(filterFeedback(ideas, filters({ type: "PROBLEM" }), "board", "me").map((i) => i.id)).toEqual(["save-button"]);
    expect(filterFeedback(ideas, filters({ status: "PLANNED" }), "board", "me").map((i) => i.id)).toEqual(["planned-sync"]);
    expect(filterFeedback(ideas, filters({ search: "small phones" }), "board", "me").map((i) => i.id)).toEqual(["save-button"]);
  });

  it("searches the team's reply and the author's name as well as the post, as the web board does", () => {
    expect(filterFeedback(ideas, filters({ search: "sync calendars" }), "board", "me").map((i) => i.id)).toEqual(["planned-sync"]);
    expect(filterFeedback(ideas, filters({ search: "THEM" }), "board", "me")).toHaveLength(2);
  });

  it("'My posts' keeps only the viewer's own, and nothing when there is no signed-in person (highest-risk path)", () => {
    expect(filterFeedback(ideas, filters({ mine: true }), "board", "me").map((i) => i.id)).toEqual(["save-button", "done"]);
    expect(filterFeedback(ideas, filters({ mine: true }), "board", undefined)).toEqual([]);
    expect(filterFeedback(ideas, filters({ mine: true }), "board", "nobody")).toEqual([]);
  });

  it("the roadmap ignores the status filter, because the stages are the status", () => {
    expect(filterFeedback(ideas, filters({ status: "OPEN" }), "roadmap", "me")).toHaveLength(4);
    expect(filterFeedback(ideas, filters({ status: "OPEN" }), "board", "me")).toHaveLength(2);
  });

  it("sorts by votes or by newest, keeping the server's status ordering", () => {
    expect(filterFeedback(ideas, filters({ sort: "TOP" }), "board", "me").map((i) => i.id)).toEqual(["save-button", "print-roster", "planned-sync", "done"]);
  });

  it("an empty search and 'ALL' drop nothing (highest-risk path)", () => {
    expect(filterFeedback(ideas, filters(), "board", "me")).toHaveLength(4);
    expect(matchesSearch({ title: "x", description: null }, "   ")).toBe(true);
    expect(matchesSearch({ title: "x", description: null }, "nope")).toBe(false);
  });
});

describe("filter state", () => {
  it("counts only the filters that apply to the current view", () => {
    const f = filters({ type: "IDEA", status: "OPEN", mine: true, sort: "NEWEST" });
    expect(activeFilterCount(f, "board")).toBe(3);
    expect(activeFilterCount(f, "roadmap")).toBe(2);
    expect(hasActiveFilters(filters({ status: "OPEN" }), "roadmap")).toBe(false);
    expect(hasActiveFilters(filters({ status: "OPEN" }), "board")).toBe(true);
    expect(hasActiveFilters(filters({ search: "  " }), "board")).toBe(false);
    expect(hasActiveFilters(filters({ search: "a" }), "roadmap")).toBe(true);
  });

  it("clearing resets every filter but keeps the chosen ordering", () => {
    expect(clearFeedbackFilters(filters({ type: "IDEA", search: "x", mine: true, sort: "NEWEST" }))).toEqual({ ...DEFAULT_FEEDBACK_FILTERS, sort: "NEWEST" });
  });
});

describe("remembered board", () => {
  beforeEach(() => forgetBoard());

  it("brings back the view and filters this person left, for this person only (happy path)", () => {
    const f = filters({ type: "PROBLEM", search: "photo", status: "PLANNED" });
    rememberBoard("me", "roadmap", f);
    expect(recallBoard("me")).toEqual({ mode: "roadmap", filters: f });
  });

  it("never hands one person's search or view to another, or to nobody (highest-risk path)", () => {
    rememberBoard("me", "roadmap", filters({ search: "private" }));
    expect(recallBoard("someone-else")).toEqual({ mode: "board", filters: DEFAULT_FEEDBACK_FILTERS });
    expect(recallBoard(undefined)).toEqual({ mode: "board", filters: DEFAULT_FEEDBACK_FILTERS });
  });
});

describe("roadmapColumns", () => {
  it("groups ideas into Planned, In progress and Completed in that order (happy path)", () => {
    const columns = roadmapColumns([
      post("a", { status: "COMPLETED" as const }),
      post("b", { status: "PLANNED" as const }),
      post("c", { status: "IN_PROGRESS" as const }),
      post("d", { status: "PLANNED" as const }),
    ]);
    expect(columns.map((c) => [c.label, c.description, c.ideas.map((i) => i.id)])).toEqual([
      ["Planned", "On the horizon", ["b", "d"]],
      ["In progress", "Being worked on", ["c"]],
      ["Completed", "Ready to use", ["a"]],
    ]);
  });

  it("leaves open and declined ideas off the roadmap, and keeps an empty stage (highest-risk path)", () => {
    const columns = roadmapColumns([post("open"), post("no", { status: "DECLINED" as const })]);
    expect(columns).toHaveLength(3);
    expect(columns.every((c) => c.ideas.length === 0)).toBe(true);
  });

  it("explains an empty stage by whether a filter is hiding things", () => {
    expect(roadmapEmptyMessage("IN_PROGRESS", false)).toBe("No in progress feedback yet.");
    expect(roadmapEmptyMessage("PLANNED", true)).toBe("No matching feedback in this stage.");
  });
});

describe("feedbackCapabilities", () => {
  const viewer = { canSubmit: true, canModerate: false };

  it("follows the server's flags (happy path)", () => {
    expect(feedbackCapabilities(viewer, false)).toEqual({ canRead: true, canSubmit: true, canModerate: false, previewing: false });
    expect(feedbackCapabilities({ canSubmit: true, canModerate: true }, false).canModerate).toBe(true);
  });

  it("grants nothing before the board has loaded, and honours an explicit canRead: false (highest-risk path)", () => {
    expect(feedbackCapabilities(undefined, false)).toEqual({ canRead: false, canSubmit: false, canModerate: false, previewing: false });
    expect(feedbackCapabilities({ canRead: false, canSubmit: true, canModerate: true }, false)).toMatchObject({ canRead: false, canSubmit: false, canModerate: false });
  });

  it("View as can read but never post, vote, reply or move status, whatever the previewed account could", () => {
    const caps = feedbackCapabilities({ canSubmit: true, canModerate: true }, true);
    expect(caps).toEqual({ canRead: true, canSubmit: false, canModerate: false, previewing: true });
    const mine = { canVote: true, canEdit: true, canDelete: true };
    expect(ideaCapabilities(mine, caps)).toEqual({ canVote: false, canEdit: false, canDelete: false, canReply: false, canChangeStatus: false });
  });

  it("per-post actions need both the post's flag and the viewer's", () => {
    const caps = feedbackCapabilities({ canSubmit: true, canModerate: false }, false);
    expect(ideaCapabilities({ canVote: true, canEdit: false, canDelete: false }, caps)).toEqual({ canVote: true, canEdit: false, canDelete: false, canReply: false, canChangeStatus: false });
    const admin = feedbackCapabilities({ canSubmit: true, canModerate: true }, false);
    expect(ideaCapabilities({ canVote: false, canEdit: false, canDelete: true }, admin)).toMatchObject({ canDelete: true, canReply: true, canChangeStatus: true, canVote: false });
  });

  it("choosing the vote you have takes it back, otherwise it replaces it", () => {
    expect(nextVote("UP", "UP")).toBeNull();
    expect(nextVote("UP", "DOWN")).toBe("DOWN");
    expect(nextVote(null, "UP")).toBe("UP");
  });

  it("explains a refusal in the person's terms", () => {
    expect(feedbackLoadMessage(403, "Forbidden")).toMatch(/isn't available for this account/);
    expect(feedbackLoadMessage(500, "Something went wrong")).toBe("Something went wrong");
    expect(feedbackLoadMessage(undefined, undefined)).toBeUndefined();
  });
});

describe("typeLabel / statusLabel / isResolved", () => {
  it("reads naturally (happy path)", () => {
    expect(typeLabel("PROBLEM")).toBe("Problem");
    expect(statusLabel("IN_PROGRESS")).toBe("In progress");
    expect(isResolved("COMPLETED")).toBe(true);
    expect(isResolved("DECLINED")).toBe(true);
  });

  it("OPEN/PLANNED are never treated as resolved (highest-risk path)", () => {
    expect(isResolved("OPEN")).toBe(false);
    expect(isResolved("PLANNED")).toBe(false);
  });
});

describe("submittedLabel / ideaFootnote", () => {
  const when = "2026-09-26T12:00:00.000Z";

  it("names the real submitter and shows the year (happy path)", () => {
    expect(submittedLabel({ submitter: person("1", "Mina"), createdAt: when })).toBe("Mina · Sep 26, 2026");
  });

  it("falls back for a deleted account rather than showing blank/null (highest-risk path)", () => {
    expect(submittedLabel({ submitter: null, createdAt: when })).toBe("Former user · Sep 26, 2026");
  });

  it("marks the viewer's own post and a closed vote", () => {
    expect(ideaFootnote({ submitter: person("me", "Me"), createdAt: when, status: "OPEN" }, "me")).toBe("Me · Sep 26, 2026 · Your idea");
    expect(ideaFootnote({ submitter: person("x", "X"), createdAt: when, status: "COMPLETED" }, "me")).toBe("X · Sep 26, 2026 · Voting closed");
    expect(ideaFootnote({ submitter: person("x", "X"), createdAt: when, status: "OPEN" }, undefined)).toBe("X · Sep 26, 2026");
  });
});

describe("validateFeedbackTitle", () => {
  it("accepts 3 to 120 trimmed characters, as the server does", () => {
    expect(validateFeedbackTitle("abc")).toBeNull();
    expect(validateFeedbackTitle("a".repeat(120))).toBeNull();
  });

  it("rejects a short or over-long title (highest-risk path)", () => {
    expect(validateFeedbackTitle("  ab  ")).toMatch(/at least 3/);
    expect(validateFeedbackTitle("a".repeat(121))).toMatch(/120 characters or fewer/);
  });
});

describe("validateFeedbackResponseDraft", () => {
  it("accepts a trimmed, in-range response (happy path)", () => {
    expect(validateFeedbackResponseDraft("  Good catch, fixing it.  ")).toBe("Good catch, fixing it.");
  });

  it("rejects empty/whitespace-only and over-length text, mirroring the server's own rule exactly (highest-risk path)", () => {
    expect(validateFeedbackResponseDraft("   ")).toBeNull();
    expect(validateFeedbackResponseDraft("a".repeat(2001))).toBeNull();
    expect(validateFeedbackResponseDraft("a".repeat(2000))).not.toBeNull();
  });
});

describe("isComposerDraftDirty", () => {
  it("is dirty once any field changes from the original (happy path)", () => {
    const original = emptyComposerDraft();
    expect(isComposerDraftDirty({ ...original, title: "New" }, original)).toBe(true);
  });

  it("is never dirty for an unchanged draft, even after being reconstructed (highest-risk path)", () => {
    const original = { type: "PROBLEM" as const, title: "x", description: "y" };
    expect(isComposerDraftDirty({ ...original }, original)).toBe(false);
  });
});

describe("reply drafts", () => {
  it("are kept per person and per post, so one cannot overwrite or leak into another", () => {
    expect(replyDraftKey("u1", "i1")).not.toBe(replyDraftKey("u2", "i1"));
    expect(replyDraftKey("u1", "i1")).not.toBe(replyDraftKey("u1", "i2"));
  });
});

describe("the shared board's wiring", () => {
  const src = (file: string) => readFileSync(join(__dirname, "../../apps/mobile/src", file), "utf8");
  const code = (file: string) => src(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("is one screen, fed by one endpoint, scoped to the viewer", () => {
    expect(code("app/feedback.tsx")).toContain('endpoint("feedback")');
    expect(code("app/feedback.tsx")).toContain("feedback:${user.id}");
    expect(code("app/feedback.tsx")).not.toContain("MinistryTintProvider");
  });

  it("has no separate detail screen, and the notification links open the board", () => {
    expect(() => src("app/feedback/[id].tsx")).toThrow();
    expect(src("data/route-access.ts")).not.toContain("feedback/[id]");
    expect(src("data/notification-routes.ts")).toContain("/feedback?idea=");
    expect(src("data/notification-routes.ts")).toContain('"admin/feedback"');
  });

  it("is reachable from Servants Prep and from Sunday School", () => {
    expect(src("app/(prep)/ministry/index.tsx")).toContain('href: "/feedback"');
    expect(src("app/(tabs)/ministry/index.tsx")).toContain('href: "/feedback"');
  });

  it("renders the full text and the reply in place, never truncated", () => {
    const parts = code("components/feedback-board-parts.tsx");
    expect(parts).not.toMatch(/numberOfLines/);
    expect(parts).toContain("idea.description");
    expect(parts).toContain("idea.teamResponse");
  });

  it("attributes replies to the Development Team and never reads a responder", () => {
    for (const file of ["app/feedback.tsx", "components/feedback-board-parts.tsx", "components/feedback-reply-sheet.tsx", "data/sunday-school-feedback.ts"]) {
      expect(code(file)).not.toMatch(/teamRespondedBy|respondedBy|responder/i);
    }
    expect(code("components/feedback-board-parts.tsx")).toContain("DEVELOPMENT_TEAM_LABEL");
    expect(code("components/feedback-reply-sheet.tsx")).toContain("Your name is not shown");
  });

  it("locks each post's controls while a request is in flight, and keeps a draft through a failure", () => {
    expect(code("components/feedback-board-parts.tsx")).toContain("useAction()");
    expect(code("components/feedback-board-parts.tsx")).toContain("action.busy");
    expect(code("components/feedback-reply-sheet.tsx")).toContain("SecureStore.setItemAsync");
    expect(code("components/feedback-composer-sheet.tsx")).toContain("if (blocked) return");
  });
});
