import { describe, expect, it } from "vitest";
import {
  academicYearRangeLabel,
  academicYearStanding,
  meetsMinimumLength,
  ministryAccessSummary,
  passwordStrength,
  roleLabel,
  sortAcademicYears,
  validAcademicYearDraft,
  validatePasswordChange,
} from "../../apps/mobile/src/data/account";

describe("roleLabel / ministryAccessSummary", () => {
  it("reads known roles naturally and summarizes real ministry access (happy path)", () => {
    expect(roleLabel("SUPER_ADMIN")).toBe("Super Admin");
    expect(
      ministryAccessSummary({ role: "SERVANT", sundaySchool: { hasAccess: true, isCoordinator: true } }),
    ).toBe("Servants Prep · Sunday School (Coordinator)");
  });

  it("never claims Servants Prep access for a PARENT, and never invents access with none (highest-risk path)", () => {
    expect(
      ministryAccessSummary({ role: "PARENT", sundaySchool: { hasAccess: false, isCoordinator: false } }),
    ).toBe("No ministry access yet");
  });
});

describe("academicYearStanding / sortAcademicYears", () => {
  const now = new Date("2026-10-10T00:00:00.000Z");

  it("active always wins, and dates place the rest correctly (happy path)", () => {
    expect(academicYearStanding({ id: "1", name: "a", startDate: "2020-01-01", endDate: "2020-12-31", isActive: true }, now)).toBe("active");
    expect(academicYearStanding({ id: "2", name: "b", startDate: "2027-01-01", endDate: "2027-12-31", isActive: false }, now)).toBe("upcoming");
    expect(academicYearStanding({ id: "3", name: "c", startDate: "2020-01-01", endDate: "2020-12-31", isActive: false }, now)).toBe("archived");
  });

  it("a year straddling today with isActive false reads as 'inactive', never silently 'active' (highest-risk path)", () => {
    expect(academicYearStanding({ id: "4", name: "d", startDate: "2026-01-01", endDate: "2026-12-31", isActive: false }, now)).toBe("inactive");
  });

  it("sorts newest start date first", () => {
    const years = [
      { id: "1", name: "old", startDate: "2020-01-01", endDate: "2020-12-31", isActive: false },
      { id: "2", name: "new", startDate: "2026-01-01", endDate: "2026-12-31", isActive: true },
    ];
    expect(sortAcademicYears(years).map((y) => y.id)).toEqual(["2", "1"]);
  });
});

describe("academicYearRangeLabel", () => {
  it("formats both ends readably", () => {
    expect(
      academicYearRangeLabel({ id: "1", name: "x", startDate: "2026-09-01T00:00:00.000Z", endDate: "2027-06-30T00:00:00.000Z", isActive: false }),
    ).toBe("Sep 1, 2026 – Jun 30, 2027");
  });
});

describe("validAcademicYearDraft", () => {
  it("accepts a real name with start before end (happy path)", () => {
    expect(validAcademicYearDraft("2026–2027", "2026-09-01", "2027-06-30")).toBe(true);
  });

  it("rejects a blank name, a malformed date, and an end date before start (highest-risk path)", () => {
    expect(validAcademicYearDraft("", "2026-09-01", "2027-06-30")).toBe(false);
    expect(validAcademicYearDraft("Year", "not-a-date", "2027-06-30")).toBe(false);
    expect(validAcademicYearDraft("Year", "2027-06-30", "2026-09-01")).toBe(false);
  });
});

describe("meetsMinimumLength / passwordStrength", () => {
  it("rates a long, varied password as strong (happy path)", () => {
    expect(meetsMinimumLength("Correct1!")).toBe(true);
    expect(passwordStrength("Str0ng!Passw0rd")).toBe("strong");
  });

  it("never rates a too-short password above 'weak', regardless of character variety (highest-risk path)", () => {
    expect(passwordStrength("Aa1!")).toBe("weak");
    expect(meetsMinimumLength("Aa1!")).toBe(false);
  });
});

describe("validatePasswordChange", () => {
  it("passes a well-formed change (happy path)", () => {
    expect(validatePasswordChange("oldpass1", "newpassword1", "newpassword1")).toEqual({});
  });

  it("catches a missing current password, a too-short new one, and a mismatch — mirroring the server's own checks (highest-risk path)", () => {
    expect(validatePasswordChange("", "newpassword1", "newpassword1").error).toMatch(/current password/i);
    expect(validatePasswordChange("oldpass1", "short1", "short1").error).toMatch(/8 characters/);
    expect(validatePasswordChange("oldpass1", "newpassword1", "different1").error).toMatch(/do not match/i);
  });
});
