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
