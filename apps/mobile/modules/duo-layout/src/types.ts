// Plain types, with no native imports, so the web project can typecheck the helpers that use them.

export type HingeStatus = "unavailable" | "unknown" | "closed" | "partial" | "open";
export type VerticalBarEdge = "none" | "leading" | "trailing";
export type Rect = { x: number; y: number; width: number; height: number };

/** What iOS 27.1 reports for a foldable iPhone. On any other device `supported` is false and the rest is inert. */
export type DuoState = {
  supported: boolean;
  hinge: HingeStatus;
  /** Radians. Only meaningful when `hinge` is not "unavailable". */
  angle: number;
  verticalBarEdge: VerticalBarEdge;
  insets: { top: number; left: number; bottom: number; right: number };
  /** Regions another element occludes (points, in the app's root view). */
  occlusions: Rect[];
  /** Regions where content should divide in two (the crease). */
  divisions: Rect[];
};

export const NOT_FOLDABLE: DuoState = {
  supported: false,
  hinge: "unavailable",
  angle: 0,
  verticalBarEdge: "none",
  insets: { top: 0, left: 0, bottom: 0, right: 0 },
  occlusions: [],
  divisions: [],
};

