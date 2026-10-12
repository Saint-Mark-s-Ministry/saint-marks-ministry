import { describe, expect, it } from "vitest";
import type { SundaySchoolClass, SundaySchoolDashboard } from "@stmark/contracts";
import { ministryAccess, validDate } from "../../apps/mobile/src/data/ministry";

function dashboard(standing: SundaySchoolDashboard["standing"], groups: SundaySchoolDashboard["ageGroups"] = [], servants = false): SundaySchoolDashboard {
  return { standing, ageGroups: groups, attendanceTrend: { canViewServantAttendance: servants } } as SundaySchoolDashboard;
}
describe("native ministry permissions", () => {
  it("fails closed while the server's permissions are unavailable", () => {
    const access = ministryAccess();
    expect(access.admin).toBe(false); expect(access.readOnly).toBe(true);
    expect(access.canAddChild).toBe(false); expect(access.createLevels).toEqual([]);
    expect(access.canTakeServantAttendance).toBe(false);
  });
  it("keeps priests read-only even when classes are visible", () => {
    const access = ministryAccess(dashboard({ isAdmin: false, readOnly: true, coordinatesAnyAgeGroup: false }, [], true), [{ canServe: false, canViewServantAttendance: true }] as SundaySchoolClass[]);
    expect(access.canAddChild).toBe(false); expect(access.createLevels).toEqual([]);
    expect(access.canTakeServantAttendance).toBe(false);
    expect(access.canViewServantAttendance).toBe(true);
  });
  it("allows ordinary servants to manage children but not create classes", () => {
    const access = ministryAccess(dashboard({ isAdmin: false, readOnly: false, coordinatesAnyAgeGroup: false }), [{ canServe: true }] as SundaySchoolClass[]);
    expect(access.canAddChild).toBe(true); expect(access.admin).toBe(false); expect(access.createLevels).toEqual([]);
  });
  it("restricts age-group coordinators to server-returned grade scopes", () => {
    const access = ministryAccess(dashboard({ isAdmin: false, readOnly: false, coordinatesAnyAgeGroup: true }, [
      { id: "elementary", name: "Elementary", levels: ["GRADE_1", "GRADE_2"], canCoordinate: true },
      { id: "middle", name: "Middle", levels: ["GRADE_7"], canCoordinate: false },
    ], true));
    expect(access.createLevels).toEqual(["GRADE_1", "GRADE_2"]);
    expect(access.canTakeServantAttendance).toBe(true); expect(access.admin).toBe(false);
  });
  it("gives super-admins the full class creation interface", () => {
    const access = ministryAccess(dashboard({ isAdmin: true, readOnly: false, coordinatesAnyAgeGroup: false }, [], true));
    expect(access.canAddChild).toBe(true); expect(access.admin).toBe(true);
    expect(access.createLevels).toContain("PRE_K"); expect(access.createLevels).toContain("GRADE_12");
  });
});
describe("native date validation", () => {
  it.each(["2026-09-23", "2024-02-29"])("accepts an exact UTC calendar day: %s", date => expect(validDate(date)).toBe(true));
  it.each(["2026-02-29", "2026-02-30", "2026-13-01", "2026-9-2", "", "not a date", "2026-09-23T00:00:00Z"])("rejects invalid or ambiguous dates: %s", date => expect(validDate(date)).toBe(false));
});
