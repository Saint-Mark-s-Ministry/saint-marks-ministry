import { requireOptionalNativeModule } from "expo-modules-core";
import type { DuoState } from "./types";

export * from "./types";

type Native = {
  getState(): Promise<DuoState>;
  /** Development: the live view controller and bar hierarchy, one line each. */
  describeBars(): Promise<string>;
  addListener(name: "onChange", listener: (state: DuoState) => void): { remove(): void };
};

// Optional: a binary built without the module (an older dev client) simply reports "not foldable".
export const native = requireOptionalNativeModule<Native>("DuoLayout");
