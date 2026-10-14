import { describe, expect, it } from "vitest";
import type {
  SundaySchoolClass,
  SundaySchoolDashboard,
} from "@stmark/contracts";
import {
  filterSearchTools,
  searchTools,
} from "../../apps/mobile/src/data/search-tools";

const servantDashboard = {
  standing: {
    isAdmin: false,
    readOnly: false,
    coordinatesAnyAgeGroup: false,
  },
  ageGroups: [],
  attendanceTrend: { canViewServantAttendance: false },
} as unknown as SundaySchoolDashboard;

describe("mobile universal search tools", () => {
  it("uses the servant's primary class for attendance and roster shortcuts", () => {
    const tools = searchTools(servantDashboard, [
      { id: "class-1", name: "Third Grade", canServe: true },
    ] as SundaySchoolClass[]);
    expect(tools.find((tool) => tool.id === "attendance")?.href).toBe(
      "/attendance/class-1",
    );
    expect(tools.find((tool) => tool.id === "roster")?.href).toContain(
      "classId=class-1",
    );
    expect(tools.some((tool) => tool.id === "applications")).toBe(false);
  });

  it("only exposes administrative tools to super admins", () => {
    const admin = {
      ...servantDashboard,
      standing: { ...servantDashboard.standing, isAdmin: true },
    } as SundaySchoolDashboard;
    expect(searchTools(admin).map((tool) => tool.id)).toEqual(
      expect.arrayContaining(["applications", "people", "activity"]),
    );
  });

  it("matches tool titles and descriptions using every query term", () => {
    const tools = searchTools(servantDashboard);
    expect(filterSearchTools(tools, "attendance report").map((tool) => tool.id)).toEqual([
      "reports",
    ]);
  });
});
