import { describe, expect, it } from "vitest";
import {
  attendancePercentage,
  birthMonthYear,
  canEditChild,
  fullBirthDate,
  genderLabel,
  hasFamilyContact,
  primaryContact,
  truncatedName,
} from "../../apps/mobile/src/data/sunday-school-roster";

describe("truncatedName", () => {
  it("keeps the first name and truncates the last to an initial (happy path)", () => {
    expect(truncatedName("Mariam", "Azmy")).toBe("Mariam A.");
  });

  it("falls back to the first name alone when there's no last name (highest-risk path)", () => {
    expect(truncatedName("Mariam", "")).toBe("Mariam");
  });
});

describe("birthMonthYear / fullBirthDate", () => {
  it("reads UTC calendar parts, not local time (happy path)", () => {
    expect(birthMonthYear("2018-03-14T00:00:00.000Z")).toBe("Mar 2018");
    expect(fullBirthDate("2018-03-14T00:00:00.000Z")).toBe("Mar 14, 2018");
  });

  it("returns null for an unreadable date rather than throwing (highest-risk path)", () => {
    expect(birthMonthYear("not-a-date")).toBeNull();
    expect(fullBirthDate("not-a-date")).toBeNull();
  });
});

describe("genderLabel", () => {
  it("maps both real values and passes null through", () => {
    expect(genderLabel("MALE")).toBe("Boy");
    expect(genderLabel("FEMALE")).toBe("Girl");
    expect(genderLabel(null)).toBeNull();
  });
});

describe("attendancePercentage", () => {
  it("counts present as 1 and late as half, excluding excused (happy path)", () => {
    const records = [
      { status: "PRESENT" as const },
      { status: "LATE" as const },
      { status: "ABSENT" as const },
      { status: "EXCUSED" as const },
    ];
    // (1 + 0.5) / 3 counted (excused dropped) = 50%
    expect(attendancePercentage(records)).toBe(50);
  });

  it("is null, not 0, when there's nothing recorded yet (highest-risk path)", () => {
    expect(attendancePercentage([])).toBeNull();
    expect(attendancePercentage([{ status: "EXCUSED" }])).toBeNull();
  });
});

describe("primaryContact / hasFamilyContact", () => {
  const guardian = { guardianName: "Aunt Mary", guardianPhone: "555-0001", guardianEmail: null };

  it("prefers the mother, then father, then the guardian fallback (happy path)", () => {
    expect(primaryContact({ motherName: "Mona", motherPhone: "555-0100", fatherName: null, fatherPhone: null, homeAddress: null }, guardian))
      .toEqual({ label: "Mona", phone: "555-0100" });
    expect(primaryContact({ motherName: null, motherPhone: null, fatherName: "Samir", fatherPhone: "555-0200", homeAddress: null }, guardian))
      .toEqual({ label: "Samir", phone: "555-0200" });
    expect(primaryContact(null, guardian)).toEqual({ label: "Aunt Mary", phone: "555-0001" });
  });

  it("is null when there is truly no phone anywhere, rather than a dead button (highest-risk path)", () => {
    expect(primaryContact(null, { guardianName: null, guardianPhone: null, guardianEmail: null })).toBeNull();
  });

  it("treats an all-empty family record the same as no family", () => {
    expect(hasFamilyContact({ motherName: null, motherPhone: null, fatherName: null, fatherPhone: null, homeAddress: null })).toBe(false);
    expect(hasFamilyContact(null)).toBe(false);
    expect(hasFamilyContact({ motherName: null, motherPhone: null, fatherName: null, fatherPhone: null, homeAddress: "123 Main St" })).toBe(true);
  });
});

describe("canEditChild", () => {
  const classes = [{ id: "c1", canServe: true }, { id: "c2", canServe: false }];

  it("lets an admin edit any child, including an unassigned one (happy path)", () => {
    expect(canEditChild({ classId: null }, classes, true)).toBe(true);
    expect(canEditChild({ classId: "c2" }, classes, true)).toBe(true);
  });

  it("restricts a non-admin to classes they actually serve, and blocks unassigned children (highest-risk path)", () => {
    expect(canEditChild({ classId: "c1" }, classes, false)).toBe(true);
    expect(canEditChild({ classId: "c2" }, classes, false)).toBe(false);
    expect(canEditChild({ classId: null }, classes, false)).toBe(false);
  });
});
