import { describe, expect, it } from "vitest";
import {
  classHeading,
  classLessonsView,
  isOpenableUrl,
  lessonLabel,
  lessonStatusLabel,
  lessonTitle,
  servingClassSummary,
  viewMessage,
  viewTitle,
  type ClassLessonsResponse,
} from "../../apps/mobile/src/data/class-lessons";

const kindergarten = { id: "c1", name: "Kindergarten - 2", level: "KINDERGARTEN" as never };

function lesson(overrides: Record<string, unknown> = {}) {
  return {
    id: "l1",
    classId: "c1",
    sundayDate: "2026-10-25T00:00:00.000Z",
    title: "The Good Samaritan",
    ownerId: null,
    assignedById: null,
    createdAt: "",
    updatedAt: "",
    class: kindergarten,
    owner: null,
    resources: [],
    status: "READY" as const,
    canEdit: false,
    canAssignOwner: false,
    eligibleOwners: [],
    ...overrides,
  };
}

const response = (overrides: Partial<ClassLessonsResponse> = {}): ClassLessonsResponse =>
  ({ lessons: [], ...overrides }) as ClassLessonsResponse;

describe("class lessons state", () => {
  it("shows upcoming lessons for the assigned class (happy path)", () => {
    const view = classLessonsView(response({ classes: [kindergarten], lessons: [lesson()] as never }), true);
    expect(view.kind).toBe("lessons");
    expect(viewTitle(view)).toBeNull();
  });

  it("keeps the class visible when there are no upcoming lessons (highest-risk path)", () => {
    const view = classLessonsView(response({ classes: [kindergarten], lessons: [] }), true);
    expect(view).toEqual({ kind: "no-lessons", classes: [kindergarten] });
    expect(viewTitle(view)).toBe("No upcoming class lessons");
    expect(viewMessage(view)).toContain("no upcoming lessons");
  });

  it("tells an unassigned async student apart from one with a class but no lessons", () => {
    const unassigned = classLessonsView(response({ classes: [], lessons: [], completedRotations: 2, requiredRotations: 10 }), true);
    expect(unassigned.kind).toBe("unassigned");
    expect(viewTitle(unassigned)).toBe("No serving class assigned");
    expect(viewMessage(unassigned)).toContain("Servants Prep servant");
    expect(unassigned.kind).not.toBe("no-lessons");
  });

  it("reports completion after all ten rotations, not 'unassigned'", () => {
    const view = classLessonsView(response({ classes: [], lessons: [], completedRotations: 10, requiredRotations: 10 }), true);
    expect(view.kind).toBe("complete");
    expect(viewTitle(view)).toBe("All ten rotations complete");
  });

  it("keeps the existing child-linked behavior for other students", () => {
    const linked = classLessonsView(response({ classes: [kindergarten], lessons: [lesson()] as never }), false);
    expect(linked.kind).toBe("lessons");
    expect(classHeading(false)).toBe("Your class");
    const unlinked = classLessonsView(response({ classes: [], lessons: [] }), false);
    expect(unlinked.kind).toBe("unlinked");
    expect(viewMessage(unlinked)).toContain("child record");
    expect(classHeading(true)).toBe("Your serving class");
  });

  it("never invents a class: with no `classes` and no lessons there is nothing to show but a state", () => {
    const view = classLessonsView(response({}), true);
    expect("classes" in view).toBe(false);
  });
});

describe("lesson presentation", () => {
  it("labels the stored calendar day, not a time-zone-shifted one", () => {
    expect(lessonLabel(lesson({ sundayDate: "2026-10-25T00:00:00.000Z" }) as never)).toBe("Sun, Oct 25 · Kindergarten - 2");
  });

  it("falls back to a generic title and names readiness", () => {
    expect(lessonTitle({ title: null })).toBe("Upcoming lesson");
    expect(lessonTitle({ title: "  " })).toBe("Upcoming lesson");
    expect(lessonTitle({ title: "Parables" })).toBe("Parables");
    expect(lessonStatusLabel("READY")).toEqual({ label: "Ready", ready: true });
    expect(lessonStatusLabel("NEEDS_LINKS")).toEqual({ label: "Needs links", ready: false });
    expect(lessonStatusLabel("UNASSIGNED")).toEqual({ label: "Needs links", ready: false });
  });

  it("opens only web links from a lesson", () => {
    expect(isOpenableUrl("https://slides.example.com/deck")).toBe(true);
    expect(isOpenableUrl("http://example.com")).toBe(true);
    for (const url of ["javascript:alert(1)", "tel:5550100", "file:///etc/passwd", "not a url", ""]) {
      expect(isOpenableUrl(url)).toBe(false);
    }
  });
});

describe("serving class on the Sunday School screen", () => {
  const assignment = (overrides: Record<string, unknown> = {}) => ({ isActive: true, class: { name: "Kindergarten - 2" }, ...overrides });

  it("shows the current explicit assignment's class (happy path)", () => {
    expect(
      servingClassSummary({ completedRotations: 1, requiredRotations: 10, assignments: [assignment({ isActive: false, class: { name: "Pre-K - 1" } }), assignment()] }),
    ).toEqual({ kind: "assigned", name: "Kindergarten - 2" });
  });

  it("does not show a past rotation as the current class", () => {
    expect(
      servingClassSummary({ completedRotations: 1, requiredRotations: 10, assignments: [assignment({ isActive: false })] }),
    ).toEqual({ kind: "unassigned" });
  });

  it("does not infer a class from a grade when the assignment has none (highest-risk path)", () => {
    expect(
      servingClassSummary({ completedRotations: 0, requiredRotations: 10, assignments: [assignment({ class: null })] }),
    ).toEqual({ kind: "unassigned" });
  });

  it("reports completion with no new assignment after the tenth rotation", () => {
    expect(servingClassSummary({ completedRotations: 10, requiredRotations: 10, assignments: [] })).toEqual({ kind: "complete" });
  });
});
