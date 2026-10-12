import { describe, expect, it } from "vitest";
import type { SundaySchoolWeeklyLesson } from "@stmark/contracts";
import {
  canOpenEditor,
  isLessonDraftDirty,
  lessonSubtitle,
  lessonTitle,
  localDateKey,
  missingSummary,
  missingSummaryLabel,
  readiness,
  resourceSubtitle,
  scheduleLessons,
  validateLinkDraft,
} from "../../apps/mobile/src/data/sunday-school-lessons";

function lesson(overrides: Partial<SundaySchoolWeeklyLesson> = {}): SundaySchoolWeeklyLesson {
  return {
    id: "l1",
    classId: "c1",
    sundayDate: "2026-10-04T00:00:00.000Z",
    title: null,
    ownerId: null,
    assignedById: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    class: { id: "c1", name: "Grade 3 Girls", level: "GRADE_3" as never },
    owner: null,
    resources: [],
    status: "UNASSIGNED",
    canEdit: false,
    canAssignOwner: false,
    eligibleOwners: [],
    ...overrides,
  };
}

describe("localDateKey", () => {
  it("reads the device's own local calendar day, zero-padded (happy path)", () => {
    expect(localDateKey(new Date(2026, 9, 6))).toBe("2026-10-06"); // October is month index 9
  });

  it("pads single-digit months and days (highest-risk path)", () => {
    expect(localDateKey(new Date(2026, 0, 2))).toBe("2026-01-02");
  });
});

describe("scheduleLessons", () => {
  const today = "2026-10-06";
  const past = lesson({ id: "past", sundayDate: "2026-09-27T00:00:00.000Z", class: { id: "c1", name: "A", level: "GRADE_3" as never } });
  const onToday = lesson({ id: "today", sundayDate: "2026-10-06T00:00:00.000Z", class: { id: "c1", name: "A", level: "GRADE_3" as never } });
  const future = lesson({ id: "future", sundayDate: "2026-10-13T00:00:00.000Z", class: { id: "c1", name: "A", level: "GRADE_3" as never }, ownerId: "u1" });

  it("treats today as upcoming and sorts soonest first (happy path)", () => {
    const result = scheduleLessons([future, past, onToday], "upcoming", today);
    expect(result.map((l) => l.id)).toEqual(["today", "future"]);
  });

  it("sorts past lessons most-recent-first and excludes today (highest-risk path)", () => {
    const olderPast = lesson({ id: "older", sundayDate: "2026-09-20T00:00:00.000Z" });
    const result = scheduleLessons([past, onToday, olderPast], "past", today);
    expect(result.map((l) => l.id)).toEqual(["past", "older"]);
  });

  it("filters to the signed-in user's own lessons when ownership is 'mine'", () => {
    const mine = scheduleLessons([future, onToday], "upcoming", today, "mine", "u1");
    expect(mine.map((l) => l.id)).toEqual(["future"]);
  });

  it("never matches 'mine' lessons for a signed-out user (highest-risk path)", () => {
    const mine = scheduleLessons([future], "upcoming", today, "mine", undefined);
    expect(mine).toHaveLength(0);
  });
});

describe("readiness", () => {
  it("maps every real status to a label and tone", () => {
    expect(readiness("READY")).toEqual({ label: "Ready", tone: "ready" });
    expect(readiness("NEEDS_LINKS")).toEqual({ label: "Needs links", tone: "needsLinks" });
    expect(readiness("UNASSIGNED")).toEqual({ label: "Unassigned", tone: "unassigned" });
  });
});

describe("lessonTitle", () => {
  it("uses the real title when one is set (happy path)", () => {
    expect(lessonTitle(lesson({ title: "The Good Samaritan", status: "READY" }))).toBe("The Good Samaritan");
  });

  it("falls back to this app's own term for an untitled-but-assigned lesson, and to 'Not assigned' only when unassigned (highest-risk path)", () => {
    expect(lessonTitle(lesson({ title: null, status: "NEEDS_LINKS" }))).toBe("Weekly lesson");
    expect(lessonTitle(lesson({ title: "  ", status: "UNASSIGNED" }))).toBe("Not assigned");
  });
});

describe("lessonSubtitle", () => {
  it("lists resource titles for a ready lesson (happy path)", () => {
    const l = lesson({
      status: "READY",
      resources: [
        { id: "r1", weeklyLessonId: "l1", title: "Slides", url: "https://x", sortOrder: 0, createdAt: "", updatedAt: "" },
        { id: "r2", weeklyLessonId: "l1", title: "Coloring page", url: "https://y", sortOrder: 1, createdAt: "", updatedAt: "" },
      ],
    });
    expect(lessonSubtitle(l)).toBe("Slides · Coloring page");
  });

  it("never says 'Choose a lesson' for an unassigned lesson, since there is no lesson-picking step in this model (highest-risk path)", () => {
    expect(lessonSubtitle(lesson({ status: "UNASSIGNED" }))).toBe("No teacher assigned");
    expect(lessonSubtitle(lesson({ status: "NEEDS_LINKS" }))).toBe("No links yet");
  });
});

describe("missingSummary / missingSummaryLabel", () => {
  it("counts and phrases both kinds of gap (happy path)", () => {
    const summary = missingSummary([
      lesson({ status: "NEEDS_LINKS" }),
      lesson({ status: "NEEDS_LINKS" }),
      lesson({ status: "UNASSIGNED" }),
      lesson({ status: "READY" }),
    ]);
    expect(summary).toEqual({ needsLinks: 2, unassigned: 1 });
    expect(missingSummaryLabel(summary)).toBe("2 need links · 1 without a teacher");
  });

  it("returns null, not an empty string, when nothing is missing (highest-risk path)", () => {
    expect(missingSummaryLabel(missingSummary([lesson({ status: "READY" })]))).toBeNull();
  });
});

describe("canOpenEditor", () => {
  it("allows editing when either server flag is true", () => {
    expect(canOpenEditor({ canEdit: true, canAssignOwner: false })).toBe(true);
    expect(canOpenEditor({ canEdit: false, canAssignOwner: true })).toBe(true);
  });

  it("refuses when the server granted neither (highest-risk path: never widen past what the server allows)", () => {
    expect(canOpenEditor({ canEdit: false, canAssignOwner: false })).toBe(false);
  });
});

describe("resourceSubtitle", () => {
  it("joins the resource kind and host (happy path)", () => {
    expect(resourceSubtitle({ url: "https://docs.google.com/slides-link" })).toBe("Link · docs.google.com");
  });

  it("drops the host for an unparsable or unsafe URL instead of throwing (highest-risk path)", () => {
    expect(resourceSubtitle({ url: "javascript:alert(1)" })).toBe("Link");
  });
});

describe("validateLinkDraft", () => {
  it("passes a fully filled, http(s) draft (happy path)", () => {
    expect(validateLinkDraft([{ title: "Slides", url: "https://x.com/s" }])).toBeNull();
  });

  it("rejects a non-http(s) URL even when both fields are non-empty (highest-risk path)", () => {
    expect(validateLinkDraft([{ title: "Slides", url: "javascript:alert(1)" }])).toMatch(/https:\/\/ or http:\/\//);
    expect(validateLinkDraft([{ title: "", url: "https://x.com" }])).toMatch(/name and a web address/);
  });
});

describe("isLessonDraftDirty", () => {
  const base = { title: "Topic", ownerId: "u1", links: [{ title: "Slides", url: "https://x" }] };

  it("is false when nothing changed (happy path)", () => {
    expect(isLessonDraftDirty(base, { ...base, links: [...base.links] })).toBe(false);
  });

  it("detects a change buried inside the links array, not just the top-level fields (highest-risk path)", () => {
    expect(isLessonDraftDirty(base, { ...base, links: [{ title: "Slides", url: "https://x/changed" }] })).toBe(true);
  });
});
