import { describe, expect, it } from "vitest";
import type { SundaySchoolVisitationChild, SundaySchoolVisitationClass } from "@stmark/contracts";
import {
  confidentialNotesCaption,
  emptyEntryDraft,
  filterByStatus,
  flattenVisitationChildren,
  isEntryDraftDirty,
  latestVisitation,
  matchesSearch,
  rowSubtitle,
  sortFlatChildren,
  validateEntryDraft,
  visitationSummary,
  visitationTone,
} from "../../apps/mobile/src/data/sunday-school-visitations";

function record(overrides: Partial<SundaySchoolVisitationChild["visitations"][number]> = {}): SundaySchoolVisitationChild["visitations"][number] {
  return { id: "v1", status: "DONE", visitedAt: "2026-09-12", notes: null, createdAt: "2026-09-12T00:00:00.000Z", updatedAt: "2026-09-12T00:00:00.000Z", recorder: null, ...overrides };
}
function child(overrides: Partial<SundaySchoolVisitationChild> = {}): SundaySchoolVisitationChild {
  return { id: "c1", firstName: "Mariam", lastName: "A", visitations: [], phoneCalls: [], ...overrides };
}
function cls(overrides: Partial<SundaySchoolVisitationClass> = {}): SundaySchoolVisitationClass {
  return { id: "cls1", name: "Grade 3 Girls", level: "GRADE_3" as never, canEdit: true, children: [], ...overrides };
}

describe("flattenVisitationChildren", () => {
  it("carries each class's own name/canEdit onto every one of its children (happy path)", () => {
    const rows = flattenVisitationChildren([cls({ children: [child(), child({ id: "c2" })] })]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ classId: "cls1", className: "Grade 3 Girls", canEdit: true });
  });

  it("never drops a class with zero children (highest-risk path)", () => {
    expect(flattenVisitationChildren([cls({ children: [] }), cls({ id: "cls2", children: [child()] })])).toHaveLength(1);
  });
});

describe("latestVisitation / visitationTone", () => {
  it("reads the server's own newest-first ordering as the latest (happy path)", () => {
    const c = child({ visitations: [record({ id: "newest" }), record({ id: "older" })] });
    expect(latestVisitation(c)?.id).toBe("newest");
    expect(visitationTone(c)).toBe("done");
  });

  it("treats a never-visited child the same as 'not done', not a separate bucket (highest-risk path)", () => {
    expect(visitationTone(child({ visitations: [] }))).toBe("notDone");
    expect(visitationTone(child({ visitations: [record({ status: "NOT_DONE" })] }))).toBe("notDone");
  });
});

describe("visitationSummary", () => {
  it("counts done vs. not-done (happy path)", () => {
    const children = [child({ visitations: [record()] }), child({ id: "c2", visitations: [] })];
    expect(visitationSummary(children)).toEqual({ total: 2, done: 1, notDone: 1 });
  });
});

describe("filterByStatus", () => {
  const rows = [{ child: child({ visitations: [record()] }) }, { child: child({ id: "c2", visitations: [] }) }];
  it("passes everything through for 'all' (happy path)", () => {
    expect(filterByStatus(rows, "all")).toHaveLength(2);
  });
  it("excludes the done child under the notDone filter (highest-risk path)", () => {
    expect(filterByStatus(rows, "notDone")).toHaveLength(1);
    expect(filterByStatus(rows, "notDone")[0].child.id).toBe("c2");
  });
});

describe("matchesSearch", () => {
  it("matches case-insensitively on the full name (happy path)", () => {
    expect(matchesSearch(child(), "mariam")).toBe(true);
  });
  it("an empty query matches everyone, rather than nobody (highest-risk path)", () => {
    expect(matchesSearch(child(), "")).toBe(true);
    expect(matchesSearch(child(), "zzz")).toBe(false);
  });
});

describe("sortFlatChildren", () => {
  const notDone = { child: child({ id: "nd", firstName: "Zara", visitations: [] }) };
  const doneOld = { child: child({ id: "old", firstName: "Amy", visitations: [record({ visitedAt: "2026-01-01" })] }) };
  const doneNew = { child: child({ id: "new", firstName: "Bea", visitations: [record({ visitedAt: "2026-09-01" })] }) };

  it("'due' puts every not-done child ahead of done children, regardless of name (happy path)", () => {
    const sorted = sortFlatChildren([doneNew, notDone, doneOld], "due");
    expect(sorted[0].child.id).toBe("nd");
  });

  it("'recent' orders by most recent visit date, most recent first (highest-risk path)", () => {
    const sorted = sortFlatChildren([doneOld, doneNew, notDone], "recent");
    expect(sorted.map((r) => r.child.id)).toEqual(["new", "old", "nd"]);
  });

  it("'name' sorts by last name regardless of visitation state", () => {
    const sorted = sortFlatChildren([doneNew, doneOld], "name");
    expect(sorted.map((r) => r.child.id)).toEqual(["old", "new"]);
  });
});

describe("rowSubtitle", () => {
  it("shows the last visit date once one exists (happy path)", () => {
    expect(rowSubtitle(child({ visitations: [record({ visitedAt: "2026-09-12" })] }), "Grade 3 Girls")).toBe("Last visit 2026-09-12");
  });
  it("falls back to the class name, not a blank line, when there's no completed visit (highest-risk path)", () => {
    expect(rowSubtitle(child({ visitations: [] }), "Grade 3 Girls")).toBe("Grade 3 Girls");
    expect(rowSubtitle(child({ visitations: [record({ status: "NOT_DONE", visitedAt: null })] }), "Grade 3 Girls")).toBe("Grade 3 Girls");
  });
});

describe("confidentialNotesCaption", () => {
  it("tells a priest they see every note, and everyone else the real, narrower rule", () => {
    expect(confidentialNotesCaption(true)).toMatch(/every confidential note/);
    expect(confidentialNotesCaption(false)).toMatch(/author can read/);
  });
});

describe("validateEntryDraft", () => {
  const today = "2026-10-09";
  it("accepts a same-day completed visit with both notes under the limit (happy path)", () => {
    expect(validateEntryDraft({ status: "DONE", visitedAt: today, notes: "ok", privateNote: "" }, today)).toBeNull();
  });
  it("rejects a future visit date — the same rule the real POST route enforces (highest-risk path)", () => {
    expect(validateEntryDraft({ status: "DONE", visitedAt: "2026-10-10", notes: "", privateNote: "" }, today)).toMatch(/cannot be in the future/);
  });
  it("doesn't require a date for a not-done entry", () => {
    expect(validateEntryDraft({ status: "NOT_DONE", visitedAt: "", notes: "", privateNote: "" }, today)).toBeNull();
  });
  it("rejects an oversized note", () => {
    expect(validateEntryDraft({ status: "NOT_DONE", visitedAt: "", notes: "x".repeat(5001), privateNote: "" }, today)).toMatch(/5,000 characters/);
  });
});

describe("isEntryDraftDirty", () => {
  it("is false for an untouched draft (happy path)", () => {
    const blank = emptyEntryDraft("2026-10-09");
    expect(isEntryDraftDirty(blank, blank)).toBe(false);
  });
  it("ignores surrounding whitespace in notes, but not a real change (highest-risk path)", () => {
    const blank = emptyEntryDraft("2026-10-09");
    expect(isEntryDraftDirty({ ...blank, notes: "  " }, blank)).toBe(false);
    expect(isEntryDraftDirty({ ...blank, notes: "visited" }, blank)).toBe(true);
  });
});
