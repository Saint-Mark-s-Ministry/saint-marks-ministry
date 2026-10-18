import { describe, expect, it } from "vitest";
import { formatPercent } from "../../apps/mobile/src/data/format-percent";

describe("percentage display", () => {
  it("limits repeating attendance and exam percentages to two decimal places", () => {
    expect(formatPercent(31.41025641025641)).toBe("31.41%");
    expect(formatPercent(48.333333333333336)).toBe("48.33%");
  });
  it("rounds the display without changing the underlying value or padding zeros", () => {
    const value = 74.999;
    expect(formatPercent(value)).toBe("75%");
    expect(value).toBe(74.999);
    expect(formatPercent(74.2)).toBe("74.2%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(100)).toBe("100%");
  });
  it("keeps missing and invalid data distinct from zero", () => {
    for (const value of [null, undefined, NaN, Infinity]) expect(formatPercent(value)).toBe("—");
  });
});
