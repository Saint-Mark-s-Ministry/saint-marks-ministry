// How the app lays itself out on a foldable iPhone (the iPhone Duo, iOS 27.1). Pure helpers:
// the hinge state, the vertical bar edge and the crease come from the DuoLayout native module
// (apps/mobile/modules/duo-layout), and everything here only decides what to do with them.
// On every other iPhone the state is "not foldable" and each helper returns the ordinary layout.

import type { DuoState, Rect } from "../../modules/duo-layout/src/types";

export type Posture =
  /** Not a foldable, or the hinge can't be read: the ordinary single-column layout. */
  | "standard"
  /** Closed or fully open: one continuous screen. */
  | "flat"
  /** Partly open: two halves either side of the crease. */
  | "folded";

export function posture(state: Pick<DuoState, "supported" | "hinge">): Posture {
  if (!state.supported) return "standard";
  if (state.hinge === "partial") return "folded";
  if (state.hinge === "open" || state.hinge === "closed") return "flat";
  return "standard";
}

/** The first crease, if the system reports one and it is active. */
export function crease(state: Pick<DuoState, "divisions">): Rect | null {
  return state.divisions[0] ?? null;
}

/**
 * Splits the available height into the part above the crease and the part below it, so a
 * folded layout can put reading on top and controls underneath without anything crossing the fold.
 * Returns null when there is no usable crease (the screen is one piece).
 */
export function halves(state: Pick<DuoState, "divisions">, height: number): { top: number; bottom: number; gap: number } | null {
  const fold = crease(state);
  if (!fold || fold.height <= 0 || fold.y <= 0 || fold.y + fold.height >= height) return null;
  return { top: fold.y, gap: fold.height, bottom: height - (fold.y + fold.height) };
}

/** A short line for the diagnostics readout. */
export function describeDuo(state: DuoState): string {
  if (!state.supported) return "Not a foldable iPhone";
  const degrees = Math.round((state.angle * 180) / Math.PI);
  return `hinge ${state.hinge}${state.hinge === "unavailable" ? "" : ` ${degrees}°`} · bar ${state.verticalBarEdge} · crease ${state.divisions.length}`;
}

// ── Wide windows ────────────────────────────────────────────────────────────

/** The narrowest usable width (points, after the vertical bar's inset) that gets two panes. Phones are well under it. */
export const WIDE_MIN_WIDTH = 700;

export function isWide(usableWidth: number): boolean {
  return usableWidth >= WIDE_MIN_WIDTH;
}

const LIST_MIN = 320;
const LIST_MAX = 420;

/**
 * Width of the list pane (about a third of the window, kept readable) and what is left for the detail pane.
 * A screen whose rows carry controls (Take attendance) asks for a wider minimum so a name still fits.
 * The list never takes more than 60% of the window, whatever it asks for.
 */
export function paneWidths(usableWidth: number, listMin: number = LIST_MIN): { list: number; detail: number } {
  const floor = Math.min(listMin, usableWidth * 0.6);
  const ceiling = Math.max(LIST_MAX, floor);
  const list = Math.round(Math.min(ceiling, Math.max(floor, usableWidth * 0.36)));
  return { list, detail: Math.max(0, usableWidth - list) };
}

// ── Aligning the panes to the hinge ─────────────────────────────────────────

/**
 * Where the hinge falls across the window, in the window's own x coordinates, or null on a device that does
 * not fold. The system's crease region is used when it reports one (active or not, since a flat hinge may
 * report it inactive). When it reports none on a foldable, the hinge is taken to run down the middle of the
 * window: the two halves of a book-style foldable are equal.
 */
export function foldX(state: Pick<DuoState, "supported" | "hinge" | "divisions">, windowWidth: number): number | null {
  if (!state.supported || state.hinge === "unavailable") return null;
  const region = state.divisions.find((d) => d.width >= 0 && d.x >= 0 && d.x <= windowWidth);
  return region ? region.x + region.width / 2 : windowWidth / 2;
}

/**
 * Pane widths that meet at the hinge rather than at an arbitrary proportion: the list fills the left half
 * up to the hinge, the detail the right half, less the vertical bar's inset, with a gap where the crease is
 * so nothing is drawn across it. Falls back to the proportional split when there is no hinge to meet.
 */
export function panesAtFold(options: {
  windowWidth: number;
  insetLeft: number;
  insetRight: number;
  fold: number | null;
  /** The crease's own width, left empty between the panes. */
  gap?: number;
  listMin?: number;
}): { list: number; detail: number; gap: number } {
  const usable = options.windowWidth - options.insetLeft - options.insetRight;
  if (options.fold === null) return { ...paneWidths(usable, options.listMin), gap: 0 };
  const gap = Math.max(0, options.gap ?? 0);
  const list = Math.max(0, Math.round(options.fold - gap / 2 - options.insetLeft));
  const detail = Math.max(0, Math.round(options.windowWidth - options.insetRight - (options.fold + gap / 2)));
  return { list, detail, gap };
}

// ── A month grid that breaks at the hinge ───────────────────────────────────

const COLUMNS_LEFT = 4;
const COLUMNS_RIGHT = 3;
const MIN_COLUMN = 56;

/**
 * Widths for the seven day columns of a month grid. With no hinge the seven are equal. On a foldable the
 * grid breaks at the hinge: Sunday to Wednesday fill the left half and Thursday to Saturday the right half,
 * with the crease's width left empty between them, so no day cell is drawn across the fold. Falls back to
 * equal columns if either half would be too narrow to read.
 */
export function monthColumns(options: {
  /** The grid's left edge and width, in window coordinates. */
  containerLeft: number;
  containerWidth: number;
  fold: number | null;
  gap?: number;
}): { widths: number[]; gapAfter: number | null; gap: number } {
  const { containerLeft, containerWidth, fold } = options;
  const equal = { widths: Array<number>(7).fill(containerWidth / 7), gapAfter: null, gap: 0 };
  if (fold === null) return equal;
  const gap = Math.max(0, options.gap ?? 0);
  const left = fold - gap / 2 - containerLeft;
  const right = containerLeft + containerWidth - (fold + gap / 2);
  if (left < COLUMNS_LEFT * MIN_COLUMN || right < COLUMNS_RIGHT * MIN_COLUMN) return equal;
  return {
    widths: [...Array<number>(COLUMNS_LEFT).fill(left / COLUMNS_LEFT), ...Array<number>(COLUMNS_RIGHT).fill(right / COLUMNS_RIGHT)],
    gapAfter: COLUMNS_LEFT - 1,
    gap,
  };
}
