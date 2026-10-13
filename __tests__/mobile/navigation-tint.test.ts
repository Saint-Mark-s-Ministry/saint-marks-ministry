import { describe, expect, it } from "vitest";
import { ministryForSegments } from "../../apps/mobile/src/data/navigation";

describe("which ministry a route is drawn in", () => {
  it("follows the tab group and the route name (happy path)", () => {
    expect(ministryForSegments(["(tabs)", "home"], "prep")).toBe("sundaySchool");
    expect(ministryForSegments(["(prep)", "home"], "sundaySchool")).toBe("prep");
    expect(ministryForSegments(["prep-files"], "sundaySchool")).toBe("prep");
    expect(ministryForSegments(["prep-lesson", "[id]"], "sundaySchool")).toBe("prep");
    expect(ministryForSegments(["roster"], "prep")).toBe("sundaySchool");
    expect(ministryForSegments(["attendance", "[classId]"], "prep")).toBe("sundaySchool");
  });

  it("keeps the ministry you came from on shared screens (highest-risk path)", () => {
    for (const shared of ["account", "notifications", "readings", "calendar-day", "profile", "contact-book"]) {
      expect(ministryForSegments([shared], "prep")).toBe("prep");
      expect(ministryForSegments([shared], "sundaySchool")).toBe("sundaySchool");
    }
  });

  it("holds the previous ministry while the route is not known yet", () => {
    expect(ministryForSegments([], "prep")).toBe("prep");
  });
});
