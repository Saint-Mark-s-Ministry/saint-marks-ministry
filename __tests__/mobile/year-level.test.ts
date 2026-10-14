import { describe, expect, it } from "vitest";
import { yearLevelLabel } from "../../apps/mobile/src/data/year-level";

describe("yearLevelLabel", () => {
  it("names the two Servants Prep cohort years (happy path)", () => {
    expect(yearLevelLabel("YEAR_1")).toBe("Year 1");
    expect(yearLevelLabel("YEAR_2")).toBe("Year 2");
  });

  it("never turns a missing cohort year into 'Year 1' or the text 'null' (highest-risk path)", () => {
    for (const value of [null, undefined, ""]) {
      expect(yearLevelLabel(value)).toBe("No cohort year");
    }
  });

  it("passes an unrecognised value through rather than guessing", () => {
    expect(yearLevelLabel("YEAR_3")).toBe("YEAR_3");
  });
});
