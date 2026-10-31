import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedbackKind } from "../../apps/mobile/src/data/feedback-policy";

const native = vi.hoisted(() => ({ state: "active", os: "ios", selection: vi.fn(), impact: vi.fn(), notification: vi.fn(), android: vi.fn() }));
vi.mock("react-native", () => ({
  AppState: { get currentState() { return native.state; } },
  Platform: { get OS() { return native.os; } },
}));
vi.mock("expo-haptics", () => ({
  selectionAsync: native.selection, impactAsync: native.impact, notificationAsync: native.notification, performAndroidHapticsAsync: native.android,
  ImpactFeedbackStyle: { Light: "light" },
  NotificationFeedbackType: { Success: "success", Error: "error", Warning: "warning" },
  AndroidHaptics: { Segment_Frequent_Tick: "soft-tick", Context_Click: "context-click", Confirm: "confirm", Reject: "reject" },
}));
let feedback: (kind: FeedbackKind) => void;
beforeEach(async () => {
  vi.resetModules(); native.state = "active"; native.os = "ios";
  for (const fn of [native.selection, native.impact, native.notification, native.android]) fn.mockReset().mockResolvedValue(undefined);
  // Runtime loading keeps React Native globals out of the web typecheck.
  ({ feedback } = await vi.importActual<{ feedback: typeof feedback }>("../../apps/mobile/src/data/haptics"));
});

describe("native feedback integration", () => {
  it("uses a subtle selection tick on iOS", () => {
    feedback("selection"); expect(native.selection).toHaveBeenCalledOnce();
    expect(native.impact).not.toHaveBeenCalled(); expect(native.notification).not.toHaveBeenCalled();
  });
  it("uses only a light impact for ordinary actions", () => {
    feedback("action"); expect(native.impact).toHaveBeenCalledWith("light");
  });
  it.each(["success", "error", "warning"] as const)("maps %s to the system notification pattern", kind => {
    feedback(kind); expect(native.notification).toHaveBeenCalledWith(kind);
  });
  it("uses Android's soft native selection feedback", () => {
    native.os = "android"; feedback("selection"); expect(native.android).toHaveBeenCalledWith("soft-tick");
    expect(native.selection).not.toHaveBeenCalled();
  });
  it.each([["action", "context-click"], ["success", "confirm"], ["error", "reject"]] as const)("maps Android %s to %s", (kind, effect) => {
    native.os = "android"; feedback(kind); expect(native.android).toHaveBeenCalledWith(effect);
  });
  it("skips background and unsupported platforms", () => {
    native.state = "background"; feedback("warning");
    native.state = "active"; native.os = "web"; feedback("selection");
    expect(native.selection).not.toHaveBeenCalled(); expect(native.notification).not.toHaveBeenCalled();
  });
});
