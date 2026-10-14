import { describe, expect, it } from "vitest";
import {
  ROTATION_LEVELS,
  assignmentFormStatus,
  buildReviewBody,
  canReviewRotationForms,
  canSeeAsyncRotations,
  decisionBlocker,
  nextRotationLevel,
  orderReviewQueue,
  progressCurrentLabel,
  queueSignature,
  reviewBlocker,
  reviewErrorMessage,
  reviewOutcomeMessage,
  rotationPlace,
  sortAssignments,
  studentProgress,
  type PrepRotationAssignmentRow,
  type RotationFormReviewRow,
} from "../../apps/mobile/src/data/async-rotations";

function row(overrides: Partial<PrepRotationAssignmentRow> & { name?: string; level?: string } = {}): PrepRotationAssignmentRow {
  const { name = "Ava", level, ...rest } = overrides;
  return {
    id: `${name}-${level ?? "none"}`,
    studentId: `s-${name}`,
    student: { id: `s-${name}`, name, email: `${name.toLowerCase()}@example.com` },
    grade: "GRADE_2",
    classId: level ? `c-${level}` : null,
    class: level ? { id: `c-${level}`, name: `${level} class`, level } : null,
    academicYearId: "y1",
    startDate: "2026-10-04T00:00:00.000Z",
    totalWeeks: 4,
    presentCount: 0,
    totalLogged: 0,
    isActive: true,
    rotationForm: null,
    ...rest,
  };
}

function formRow(overrides: Partial<RotationFormReviewRow> = {}): RotationFormReviewRow {
  return {
    id: "f1",
    level: "GRADE_2" as never,
    fileUrl: "https://blob.example/f1",
    filename: "form.jpg",
    version: 3,
    status: "PENDING",
    reviewNotes: null,
    createdAt: "2026-10-26T00:00:00.000Z",
    assignment: {
      id: "a1",
      studentId: "student-1",
      student: { id: "student-1", name: "Ava" },
      class: { id: "c1", name: "Grade 2 Girls", level: "GRADE_2" as never },
      grade: "GRADE_2",
      startDate: "2026-10-04T00:00:00.000Z",
      isActive: true,
    },
    ...overrides,
  };
}

describe("assignment sorting", () => {
  it("defaults to student name A–Z, naturally, ignoring case (happy path)", () => {
    const rows = [row({ name: "ben" }), row({ name: "Cy" }), row({ name: "Ava" }), row({ name: "Student 10" }), row({ name: "Student 2" })];
    expect(sortAssignments(rows, "name").map((r) => r.student.name)).toEqual(["Ava", "ben", "Cy", "Student 2", "Student 10"]);
  });

  it("orders by the assigned class's actual level, then alphabetizes within a grade (highest-risk path)", () => {
    const rows = [
      row({ name: "Zed", level: "GRADE_1" }),
      row({ name: "Amy", level: "GRADE_5" }),
      row({ name: "Bea", level: "GRADE_1" }),
      row({ name: "Cal", level: "PRE_K" }),
    ];
    expect(sortAssignments(rows, "grade").map((r) => r.student.name)).toEqual(["Cal", "Bea", "Zed", "Amy"]);
  });

  it("keeps grades 6, 7 and 8 distinct instead of collapsing them to Grade 6+", () => {
    const rows = [
      row({ name: "A", level: "GRADE_8" }),
      row({ name: "B", level: "GRADE_6" }),
      row({ name: "C", level: "GRADE_7" }),
    ];
    expect(sortAssignments(rows, "grade").map((r) => r.class?.level)).toEqual(["GRADE_6", "GRADE_7", "GRADE_8"]);
  });

  it("places a legacy Grade 6+ rotation with no class after 6th grade's slot, and unknown grades last", () => {
    const legacy = row({ name: "Old", grade: "GRADE_6_PLUS", class: null });
    const unknown = row({ name: "Odd", grade: "SOMETHING", class: null });
    const seventh = row({ name: "New", level: "GRADE_7" });
    const first = row({ name: "Kid", level: "GRADE_1" });
    const names = sortAssignments([unknown, legacy, seventh, first], "grade").map((r) => r.student.name);
    expect(names).toEqual(["Kid", "Old", "New", "Odd"]);
  });

  it("does not mutate the list it is given, so a refresh keeps the chosen order", () => {
    const rows = [row({ name: "Zed" }), row({ name: "Amy" })];
    sortAssignments(rows, "name");
    expect(rows.map((r) => r.student.name)).toEqual(["Zed", "Amy"]);
  });

  it("shows the class name, falling back to the grade for older rotations", () => {
    expect(rotationPlace(row({ level: "GRADE_3" }))).toBe("GRADE_3 class");
    expect(rotationPlace(row({ grade: "GRADE_6_PLUS", class: null }))).toBe("6th Grade+");
  });
});

describe("rotation grades", () => {
  it("has the ten grades Pre-K through 8th", () => {
    expect(ROTATION_LEVELS).toHaveLength(10);
    expect(ROTATION_LEVELS[0]).toBe("PRE_K");
    expect(ROTATION_LEVELS[9]).toBe("GRADE_8");
  });

  it("advances one grade and wraps after eighth grade", () => {
    expect(nextRotationLevel("GRADE_2")).toBe("GRADE_3");
    expect(nextRotationLevel("GRADE_8")).toBe("PRE_K");
    expect(nextRotationLevel("GRADE_6_PLUS")).toBeNull();
  });
});

describe("review capabilities", () => {
  it("lets Super Admins and Servants Prep servants review; priests and others are read-only (highest-risk path)", () => {
    expect(canReviewRotationForms("SUPER_ADMIN")).toBe(true);
    expect(canReviewRotationForms("SERVANT_PREP")).toBe(true);
    for (const role of ["PRIEST", "MENTOR", "STUDENT", "SERVANT", undefined]) {
      expect(canReviewRotationForms(role)).toBe(false);
    }
    expect(canSeeAsyncRotations("PRIEST")).toBe(true);
    expect(canSeeAsyncRotations("STUDENT")).toBe(false);
  });

  it("offers review for a pending form on an active rotation, and says why not otherwise", () => {
    const viewer = { id: "reviewer", role: "SERVANT_PREP" };
    expect(reviewBlocker(formRow(), viewer).kind).toBe("ready");
    expect(reviewBlocker(formRow(), { id: "p", role: "PRIEST" }).kind).toBe("read-only");
    expect(reviewBlocker(formRow({ status: "APPROVED" }), viewer).kind).toBe("not-pending");
    expect(reviewBlocker(formRow({ status: "REJECTED" }), viewer).kind).toBe("not-pending");
    expect(reviewBlocker(formRow({ assignment: { ...formRow().assignment, isActive: false } }), viewer).kind).toBe("inactive");
  });

  it("never lets a servant review their own form (highest-risk path)", () => {
    const own = reviewBlocker(formRow(), { id: "student-1", role: "SERVANT_PREP" });
    expect(own.kind).toBe("own-form");
  });
});

describe("the review request", () => {
  it("requires all four weeks confirmed for approval, and notes for a return (highest-risk path)", () => {
    expect(decisionBlocker("APPROVED", { confirmed: false, notes: "" })).toMatch(/four weeks/i);
    expect(decisionBlocker("APPROVED", { confirmed: true, notes: "" })).toBeNull();
    expect(decisionBlocker("REJECTED", { confirmed: true, notes: "   " })).toMatch(/correct/i);
    expect(decisionBlocker("REJECTED", { confirmed: false, notes: "Week 3 unsigned" })).toBeNull();
  });

  it("sends status, the form's current version, trimmed notes, and confirmedWeeks=4 only on approval", () => {
    expect(buildReviewBody("APPROVED", { version: 3 }, "  Looks good ")).toEqual({
      status: "APPROVED",
      version: 3,
      notes: "Looks good",
      confirmedWeeks: 4,
    });
    const returned = buildReviewBody("REJECTED", { version: 3 }, "Week 3 is unsigned");
    expect(returned).toEqual({ status: "REJECTED", version: 3, notes: "Week 3 is unsigned" });
    expect("confirmedWeeks" in returned).toBe(false);
  });
});

describe("review outcomes and failures", () => {
  it("reports exactly what the server says happened", () => {
    expect(reviewOutcomeMessage({ status: "REJECTED" })).toContain("stays in the current class");
    expect(reviewOutcomeMessage({ status: "APPROVED", nextAssignment: { class: { name: "Grade 3 Boys" } } })).toBe(
      "Rotation approved. Next class: Grade 3 Boys.",
    );
    expect(reviewOutcomeMessage({ status: "APPROVED", nextAssignment: null, rotationsComplete: true })).toContain(
      "All ten grade rotations are complete",
    );
  });

  it("treats a stale or already-reviewed form as unchanged and asks for a refresh (highest-risk path)", () => {
    const stale = reviewErrorMessage(409, "The uploaded form changed. Refresh before reviewing it");
    expect(stale.refresh).toBe(true);
    expect(stale.message).toContain("Nothing was changed");
    expect(reviewErrorMessage(409, "This form has already been reviewed").refresh).toBe(true);
  });

  it("explains a missing next class without implying approval (highest-risk path)", () => {
    const failure = reviewErrorMessage(400, "An active class for the next grade and academic year is required");
    expect(failure.message).toMatch(/^Not approved\./);
    expect(failure.message).toContain("stays in the current class");
    expect(failure.refresh).toBe(false);
  });

  it("handles permission, session, offline and unexpected failures plainly", () => {
    expect(reviewErrorMessage(403, "A different Servants Prep servant must review this form").message).toContain("different");
    expect(reviewErrorMessage(403).message).toBe("You can't review this form.");
    expect(reviewErrorMessage(401).message).toContain("Sign in");
    expect(reviewErrorMessage(null).message).toContain("Nothing was changed");
    expect(reviewErrorMessage(500).message).toContain("Nothing was changed");
  });
});

describe("queue and progress", () => {
  it("puts forms needing review first, then returned, then approved, oldest first", () => {
    const forms = [
      formRow({ id: "approved", status: "APPROVED", createdAt: "2026-10-01T00:00:00.000Z" }),
      formRow({ id: "later", status: "PENDING", createdAt: "2026-10-27T00:00:00.000Z" }),
      formRow({ id: "returned", status: "REJECTED", createdAt: "2026-10-02T00:00:00.000Z" }),
      formRow({ id: "earlier", status: "PENDING", createdAt: "2026-10-26T00:00:00.000Z" }),
    ];
    expect(orderReviewQueue(forms).map((f) => f.id)).toEqual(["earlier", "later", "returned", "approved"]);
  });

  it("shows one form status per assignment and 'Not submitted' when there is none", () => {
    expect(assignmentFormStatus(row()).label).toBe("Not submitted");
    expect(assignmentFormStatus(row({ rotationForm: { status: "PENDING" } })).label).toBe("Awaiting review");
    expect(assignmentFormStatus(row({ rotationForm: { status: "REJECTED" } })).label).toBe("Changes requested");
    expect(assignmentFormStatus(row({ rotationForm: { status: "APPROVED" } })).label).toBe("Approved");
  });

  it("counts only approved distinct grades, so three weeks or a pending form add nothing (highest-risk path)", () => {
    const history = [
      row({ name: "Ava", level: "GRADE_2", isActive: false, rotationForm: { status: "APPROVED" } }),
      row({ name: "Ava", level: "GRADE_2", isActive: false, rotationForm: { status: "APPROVED" } }), // a repeat of the same grade
      row({ name: "Ava", level: "GRADE_3", isActive: false, rotationForm: { status: "REJECTED" } }),
      row({ name: "Ava", level: "GRADE_4", isActive: true, rotationForm: { status: "PENDING" }, presentCount: 3 }),
    ];
    const [ava] = studentProgress(history);
    expect(ava.completed).toBe(1);
    expect(ava.current).toBe("GRADE_4 class");
    expect(progressCurrentLabel(ava)).toBe("GRADE_4 class");
  });

  it("reports completion with no new assignment after the tenth approved grade", () => {
    const history = ROTATION_LEVELS.map((level) =>
      row({ name: "Ava", level, isActive: false, rotationForm: { status: "APPROVED" } }),
    );
    const [ava] = studentProgress(history);
    expect(ava.completed).toBe(10);
    expect(ava.allComplete).toBe(true);
    expect(ava.current).toBeNull();
    expect(progressCurrentLabel(ava)).toBe("All rotations complete");
  });

  it("labels a student with no active rotation and incomplete progress", () => {
    const [ava] = studentProgress([row({ name: "Ava", level: "GRADE_2", isActive: false, rotationForm: { status: "APPROVED" } })]);
    expect(progressCurrentLabel(ava)).toBe("No active rotation");
  });

  it("changes the queue signature when a form is decided or replaced", () => {
    const before = queueSignature([formRow()]);
    expect(queueSignature([formRow({ status: "APPROVED", version: 4 })])).not.toBe(before);
    expect(queueSignature([formRow()])).toBe(before);
  });
});
