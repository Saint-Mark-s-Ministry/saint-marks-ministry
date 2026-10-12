import { describe, expect, it } from "vitest";
import {
  completionLabel,
  completionTone,
  defaultWeekId,
  draftFromWeek,
  familyHomework,
  homeworkHistory,
  isHomeworkDraftDirty,
  statusFor,
  validateHomeworkDraft,
} from "../../apps/mobile/src/data/sunday-school-homework";

function week(overrides: Record<string, unknown> = {}) {
  return {
    weeklyLessonId: "w1",
    assignedDate: "2026-09-13T00:00:00.000Z",
    dueDate: "2026-09-20T00:00:00.000Z",
    class: { id: "c1", name: "Grade 2", level: "GRADE_2" as never },
    homework: null,
    ...overrides,
  };
}

describe("completionLabel / completionTone", () => {
  it("reads every status naturally (happy path)", () => {
    expect(completionLabel("COMPLETED")).toBe("Completed");
    expect(completionTone("COMPLETED")).toBe("success");
    expect(completionLabel("NOT_COMPLETED")).toBe("Not completed");
    expect(completionTone("NOT_COMPLETED")).toBe("danger");
  });

  it("never claims a child's homework is done or not done when nothing was ever recorded (highest-risk path)", () => {
    expect(completionLabel("NOT_RECORDED")).toBe("Not recorded");
    expect(completionTone("NOT_RECORDED")).toBe("neutral");
  });
});

describe("statusFor", () => {
  it("finds the matching child's status (happy path)", () => {
    const completions = [{ childId: "a", child: { id: "a", firstName: "A", lastName: "B" }, status: "COMPLETED" as const, updatedAt: "" }];
    expect(statusFor("a", completions)).toBe("COMPLETED");
  });

  it("reads an unrecorded child as NOT_RECORDED rather than throwing or guessing (highest-risk path)", () => {
    expect(statusFor("missing", [])).toBe("NOT_RECORDED");
  });
});

describe("defaultWeekId", () => {
  const today = "2026-09-20";

  it("picks the most recently assigned week that has already happened (happy path)", () => {
    const weeks = [
      week({ weeklyLessonId: "future", assignedDate: "2026-09-27" }),
      week({ weeklyLessonId: "past", assignedDate: "2026-09-13" }),
    ];
    expect(defaultWeekId(weeks, today)).toBe("past");
  });

  it("falls back to the last week when every week is in the future, and returns null for no weeks at all (highest-risk path)", () => {
    const weeks = [week({ weeklyLessonId: "only", assignedDate: "2026-09-27" })];
    expect(defaultWeekId(weeks, today)).toBe("only");
    expect(defaultWeekId([], today)).toBeNull();
  });
});

describe("draftFromWeek / validateHomeworkDraft / isHomeworkDraftDirty", () => {
  it("loads an existing homework's fields, and a complete draft validates (happy path)", () => {
    const withHomework = week({
      homework: {
        id: "h1",
        title: "Memory verse",
        instructions: "Practice at home",
        archivedAt: null,
        resources: [{ id: "r1", title: "Worksheet", url: "https://example.com/w.pdf", sortOrder: 0 }],
        completions: [],
        summary: { completed: 0, notCompleted: 0, notRecorded: 0, completionRate: null },
      },
    });
    const draft = draftFromWeek(withHomework as never);
    expect(draft).toEqual({ title: "Memory verse", instructions: "Practice at home", links: [{ title: "Worksheet", url: "https://example.com/w.pdf" }] });
    expect(validateHomeworkDraft(draft)).toBeNull();
  });

  it("requires a title and rejects a non-http(s) link, and a reconstructed-but-unchanged draft is never dirty (highest-risk path)", () => {
    expect(validateHomeworkDraft({ title: "", instructions: "", links: [] })).toMatch(/title/i);
    expect(validateHomeworkDraft({ title: "x", instructions: "", links: [{ title: "bad", url: "ftp://x" }] })).toMatch(/http/i);

    const original = { title: "x", instructions: "y", links: [] };
    expect(isHomeworkDraftDirty({ ...original }, original)).toBe(false);
    expect(isHomeworkDraftDirty({ ...original, title: "z" }, original)).toBe(true);
  });
});

describe("homeworkHistory", () => {
  const roster = [{ id: "a", firstName: "Alice", lastName: "Z" }];

  it("counts completed/not-completed and computes a rate excluding not-recorded weeks (happy path)", () => {
    const weeks = [
      week({
        weeklyLessonId: "w1",
        homework: {
          id: "h1", title: "x", instructions: null, archivedAt: null, resources: [],
          completions: [{ childId: "a", child: roster[0], status: "COMPLETED" as const, updatedAt: "" }],
          summary: { completed: 1, notCompleted: 0, notRecorded: 0, completionRate: 100 },
        },
      }),
      week({
        weeklyLessonId: "w2",
        homework: {
          id: "h2", title: "y", instructions: null, archivedAt: null, resources: [],
          completions: [{ childId: "a", child: roster[0], status: "NOT_COMPLETED" as const, updatedAt: "" }],
          summary: { completed: 0, notCompleted: 1, notRecorded: 0, completionRate: 0 },
        },
      }),
    ];
    const history = homeworkHistory(roster, weeks as never);
    expect(history).toEqual([{ id: "a", firstName: "Alice", lastName: "Z", completed: 1, notCompleted: 1, notRecorded: 0, rate: 50 }]);
  });

  it("never divides by zero — a child with every week unrecorded gets a null rate, not NaN (highest-risk path)", () => {
    const weeks = [week({ weeklyLessonId: "w1", homework: { id: "h1", title: "x", instructions: null, archivedAt: null, resources: [], completions: [], summary: { completed: 0, notCompleted: 0, notRecorded: 1, completionRate: null } } })];
    const history = homeworkHistory(roster, weeks as never);
    expect(history[0].rate).toBeNull();
    expect(Number.isNaN(history[0].rate)).toBe(false);
  });
});

describe("familyHomework", () => {
  const published = (id: string, classId: string, completions: unknown[] = [], archivedAt: string | null = null) =>
    week({
      weeklyLessonId: `w-${id}`,
      class: { id: classId, name: `Class ${classId}`, level: "GRADE_2" as never },
      homework: {
        id,
        title: `Homework ${id}`,
        instructions: null,
        archivedAt,
        resources: [{ id: `r-${id}`, title: "Worksheet", url: "https://example.com/w.pdf", sortOrder: 0 }],
        completions,
        summary: { completed: 0, notCompleted: 0, notRecorded: 0, completionRate: null },
      },
    });
  const completion = (childId: string, status: "COMPLETED" | "NOT_COMPLETED") => ({
    childId,
    child: { id: childId, firstName: "X", lastName: "Y" },
    status,
    updatedAt: "",
  });

  it("pairs each published week with the viewer's own child's outcome (happy path)", () => {
    const items = familyHomework({
      roster: [{ id: "kid", firstName: "Mina", lastName: "G", classId: "c1" }],
      weeks: [published("h1", "c1", [completion("kid", "COMPLETED")]), week()] as never,
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ homeworkId: "h1", title: "Homework h1", className: "Class c1" });
    expect(items[0].children).toEqual([{ id: "kid", firstName: "Mina", status: "COMPLETED" }]);
    expect(items[0].resources).toEqual([{ id: "r-h1", title: "Worksheet", url: "https://example.com/w.pdf" }]);
  });

  it("shows only the children in each homework's own class, and NOT_RECORDED when none was saved (highest-risk path)", () => {
    const items = familyHomework({
      roster: [
        { id: "a", firstName: "Ava", lastName: "G", classId: "c1" },
        { id: "b", firstName: "Ben", lastName: "G", classId: "c2" },
      ],
      weeks: [published("h1", "c1", [completion("b", "COMPLETED")]), published("h2", "c2")] as never,
    });
    expect(items[0].children).toEqual([{ id: "a", firstName: "Ava", status: "NOT_RECORDED" }]);
    expect(items[1].children).toEqual([{ id: "b", firstName: "Ben", status: "NOT_RECORDED" }]);
  });

  it("never lists archived homework to a family, even if the server sent it (highest-risk path)", () => {
    const items = familyHomework({
      roster: [{ id: "kid", firstName: "Mina", lastName: "G", classId: "c1" }],
      weeks: [published("h1", "c1", [], "2026-10-01T00:00:00.000Z")] as never,
    });
    expect(items).toEqual([]);
  });

  it("returns nothing for a family with no weeks (empty state)", () => {
    expect(familyHomework({ roster: [], weeks: [] })).toEqual([]);
  });
});
