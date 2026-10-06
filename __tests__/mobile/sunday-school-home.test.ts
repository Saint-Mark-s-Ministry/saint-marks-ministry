import { describe, expect, it } from "vitest";
import type { SundaySchoolWeeklyLesson } from "@stmark/contracts";
import { ageGroupDestination, nearestLesson } from "../../apps/mobile/src/data/sunday-school-home";

function lesson(overrides: Partial<SundaySchoolWeeklyLesson> & { sundayDate: string; className: string }): SundaySchoolWeeklyLesson {
  const { className, ...rest } = overrides;
  return {
    id: `lesson-${overrides.sundayDate}-${className}`,
    classId: "c1",
    title: null,
    ownerId: null,
    assignedById: null,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
    class: { id: "c1", name: className, level: "GRADE_1" },
    owner: null,
    resources: [],
    status: "ASSIGNED",
    canEdit: false,
    canAssignOwner: false,
    eligibleOwners: [],
    ...rest,
  } as SundaySchoolWeeklyLesson;
}

describe("nearestLesson", () => {
  it("picks the lesson with the soonest date (happy path)", () => {
    const lessons = [
      lesson({ sundayDate: "2026-10-18T12:00:00.000Z", className: "Far" }),
      lesson({ sundayDate: "2026-10-11T12:00:00.000Z", className: "Near" }),
    ];

    expect(nearestLesson(lessons)?.class.name).toBe("Near");
  });

  it("breaks a tie by class name, and returns null for an empty list (highest-risk path)", () => {
    const lessons = [
      lesson({ sundayDate: "2026-10-11T12:00:00.000Z", className: "Zebra" }),
      lesson({ sundayDate: "2026-10-11T12:00:00.000Z", className: "Alpha" }),
    ];

    expect(nearestLesson(lessons)?.class.name).toBe("Alpha");
    expect(nearestLesson([])).toBeNull();
  });
});

describe("ageGroupDestination", () => {
  it("routes an admin, or a coordinator, to Age groups (happy path)", () => {
    expect(ageGroupDestination({ isAdmin: true, coordinatesAnyAgeGroup: false })).toBe("/age-groups");
    expect(ageGroupDestination({ isAdmin: false, coordinatesAnyAgeGroup: true })).toBe("/age-groups");
  });

  it("routes a plain servant to the Classes tab, not a screen they cannot use (highest-risk path)", () => {
    expect(ageGroupDestination({ isAdmin: false, coordinatesAnyAgeGroup: false })).toBe("/(tabs)/classes");
  });
});
