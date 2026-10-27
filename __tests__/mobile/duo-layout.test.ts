import { describe, expect, it } from "vitest";
import type { DuoState } from "../../apps/mobile/modules/duo-layout/src/types";
import { WIDE_MIN_WIDTH, crease, describeDuo, foldX, halves, isWide, paneWidths, panesAtFold, posture } from "../../apps/mobile/src/data/duo-layout";

const region = (r: { x: number; y: number; width: number; height: number }) => ({ ...r, active: true, margins: { top: 0, left: 0, bottom: 0, right: 0 } });
const base: DuoState = { supported: true, hinge: "open", angle: Math.PI, verticalBarEdge: "trailing", insets: { top: 0, left: 0, bottom: 34, right: 84 }, occlusions: [], divisions: [] };

describe("foldable layout helpers", () => {
  it("treats any non-foldable device, or an unreadable hinge, as the ordinary layout", () => {
    expect(posture({ supported: false, hinge: "unavailable" })).toBe("standard");
    expect(posture({ supported: true, hinge: "unavailable" })).toBe("standard");
    expect(posture({ supported: true, hinge: "unknown" })).toBe("standard");
  });
  it("reads closed and fully open as one screen, and partly open as two halves", () => {
    expect(posture({ supported: true, hinge: "open" })).toBe("flat");
    expect(posture({ supported: true, hinge: "closed" })).toBe("flat");
    expect(posture({ supported: true, hinge: "partial" })).toBe("folded");
  });
  it("splits the height around an active crease, and refuses a missing or degenerate one", () => {
    expect(halves({ divisions: [region({ x: 0, y: 300, width: 400, height: 20  })] }, 700)).toEqual({ top: 300, gap: 20, bottom: 380 });
    expect(halves({ divisions: [] }, 700)).toBeNull();
    expect(halves({ divisions: [region({ x: 0, y: 0, width: 400, height: 20  })] }, 700)).toBeNull();
    expect(halves({ divisions: [region({ x: 0, y: 690, width: 400, height: 20  })] }, 700)).toBeNull();
    expect(halves({ divisions: [region({ x: 0, y: 300, width: 400, height: 0  })] }, 700)).toBeNull();
    expect(crease({ divisions: [] })).toBeNull();
  });
  it("describes the state in one line, including the angle in degrees", () => {
    expect(describeDuo({ ...base })).toBe("hinge open 180° · bar trailing · crease 0");
    expect(describeDuo({ ...base, supported: false })).toBe("Not a foldable iPhone");
    expect(describeDuo({ ...base, hinge: "unavailable" })).toBe("hinge unavailable · bar trailing · crease 0");
  });
});


describe("two panes on a wide window", () => {
  it("leaves every phone single-column and gives the wide Duo two panes", () => {
    for (const width of [320, 390, 402, 440, 466, 699]) expect(isWide(width)).toBe(false);
    expect(isWide(WIDE_MIN_WIDTH)).toBe(true);
    // The Duo fully open: 951pt wide with an 84pt vertical bar.
    expect(isWide(951 - 84)).toBe(true);
  });
  it("keeps the list readable and gives the rest to the detail", () => {
    // 36% of 867 is 312, under the 320 minimum.
    expect(paneWidths(867)).toEqual({ list: 320, detail: 547 });
    const wide = paneWidths(1400);
    expect(wide.list).toBe(420);
    expect(wide.detail).toBe(980);
    // Take attendance asks for more room for a name beside three status buttons.
    expect(paneWidths(867, 410)).toEqual({ list: 410, detail: 457 });
    // But a list never takes more than 60% of a window.
    expect(paneWidths(700, 600).list).toBe(420);
    const narrow = paneWidths(700);
    expect(narrow.list).toBe(320);
    expect(narrow.list + narrow.detail).toBe(700);
  });
});

describe("aligning the panes to the hinge", () => {
  const open: Pick<DuoState, "supported" | "hinge" | "divisions"> = { supported: true, hinge: "open", divisions: [] };
  it("has no hinge to meet on a phone or when it cannot be read", () => {
    expect(foldX({ supported: false, hinge: "unavailable", divisions: [] }, 951)).toBeNull();
    expect(foldX({ supported: true, hinge: "unavailable", divisions: [] }, 951)).toBeNull();
  });
  it("uses the crease the system reports, active or not, at its middle", () => {
    expect(foldX({ ...open, divisions: [{ ...region({ x: 470, y: 0, width: 12, height: 669 }), active: false }] }, 951)).toBe(476);
    expect(foldX({ ...open, divisions: [region({ x: 400, y: 0, width: 0, height: 669 })] }, 951)).toBe(400);
  });
  it("takes the hinge to run down the middle of the window when the system reports no crease", () => {
    expect(foldX(open, 951)).toBe(475.5);
    expect(foldX({ supported: true, hinge: "partial", divisions: [] }, 951)).toBe(475.5);
  });
  it("meets the hinge: list to the left of it, detail to the right, less the vertical bar's inset", () => {
    // The Duo fully open: 951pt window, 84pt bar on the trailing edge, hinge at 475.5.
    const panes = panesAtFold({ windowWidth: 951, insetLeft: 0, insetRight: 84, fold: 475.5 });
    expect(panes).toEqual({ list: 476, detail: 392, gap: 0 });
    expect(panes.list).toBeGreaterThan(410);
  });
  it("leaves the crease's own width empty so nothing is drawn across it", () => {
    const panes = panesAtFold({ windowWidth: 951, insetLeft: 0, insetRight: 84, fold: 476, gap: 12 });
    expect(panes).toEqual({ list: 470, detail: 385, gap: 12 });
    expect(panes.list + panes.gap + panes.detail + 84).toBe(951);
  });
  it("falls back to the proportional split when there is no hinge", () => {
    expect(panesAtFold({ windowWidth: 951, insetLeft: 0, insetRight: 84, fold: null })).toEqual({ ...paneWidths(867), gap: 0 });
  });
});
