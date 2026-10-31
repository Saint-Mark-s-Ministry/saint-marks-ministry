import { describe, expect, it } from "vitest";
import type { SundaySchoolVisitationClass } from "@stmark/contracts";
import {
  PRIORITY_FAILURE_MESSAGE,
  applyPriorityOverrides,
  canEditPriority,
  failureNeedsRefresh,
  filterByPriority,
  priorityCount,
  priorityFailure,
  priorityRequest,
  priorityToggleLabel,
} from "../../apps/mobile/src/data/visitation-priority";

const child = (id: string, visitationPriority: boolean, done = false) => ({
  id, firstName: id, lastName: "Test", visitationPriority,
  visitations: done ? [{ id: `${id}-v`, status: "DONE" as const, visitedAt: "2026-10-01T00:00:00.000Z", notes: null, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", recorder: null }] : [],
  phoneCalls: [],
});
const classes = [
  { id: "c1", name: "Grade 2", level: "GRADE_2", canEdit: true, children: [child("a", true, true), child("b", false)] },
] as unknown as SundaySchoolVisitationClass[];

describe("visitation priority", () => {
  it("builds the PATCH body the route expects", () => {
    expect(priorityRequest("kid-1", true)).toEqual({ childId: "kid-1", priority: true });
    expect(priorityRequest("kid-1", false)).toEqual({ childId: "kid-1", priority: false });
  });

  it("follows the response's permission flag, and View as is read-only", () => {
    expect(canEditPriority({ classCanEdit: true, viewingAs: false })).toBe(true);
    expect(canEditPriority({ classCanEdit: false, viewingAs: false })).toBe(false);
    expect(canEditPriority({ classCanEdit: true, viewingAs: true })).toBe(false);
  });

  it("lays a pending choice over the server's answer without mutating it", () => {
    const next = applyPriorityOverrides(classes, { b: true, a: false });
    expect(next[0].children.map((c) => c.visitationPriority)).toEqual([false, true]);
    expect(classes[0].children.map((c) => c.visitationPriority)).toEqual([true, false]);
    expect(applyPriorityOverrides(classes, {})).toBe(classes);
  });

  it("filters to priority children and counts them; a completed visit keeps its star", () => {
    const rows = classes[0].children.map((c) => ({ child: c }));
    expect(filterByPriority(rows, true).map((r) => r.child.id)).toEqual(["a"]);
    expect(filterByPriority(rows, false)).toHaveLength(2);
    expect(priorityCount(rows)).toBe(1);
    // `a` has a DONE visit and is still a priority: status and priority are independent.
    expect(rows[0].child.visitations[0].status).toBe("DONE");
    expect(rows[0].child.visitationPriority).toBe(true);
  });

  it("explains refusals, a changed roster, a missing child and a plain failure", () => {
    expect(priorityFailure(403)).toBe("denied");
    expect(priorityFailure(409)).toBe("changed");
    expect(priorityFailure(404)).toBe("gone");
    expect(priorityFailure(500)).toBe("retry");
    expect(priorityFailure(undefined)).toBe("retry");
    expect(PRIORITY_FAILURE_MESSAGE.changed).toMatch(/roster changed/i);
    expect(failureNeedsRefresh("changed")).toBe(true);
    expect(failureNeedsRefresh("denied")).toBe(true);
    expect(failureNeedsRefresh("retry")).toBe(false);
  });

  it("labels the star for a screen reader by state", () => {
    expect(priorityToggleLabel("Mina Mark", false)).toBe("Add Mina Mark to priority visits");
    expect(priorityToggleLabel("Mina Mark", true)).toBe("Remove Mina Mark from priority visits");
  });
});
