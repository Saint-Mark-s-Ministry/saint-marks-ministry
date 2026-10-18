import { AppState, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { createFeedbackPolicy, type FeedbackKind } from "./feedback-policy";

function play(kind: FeedbackKind) {
  if (Platform.OS === "android") {
    const effect = kind === "selection" ? Haptics.AndroidHaptics.Segment_Frequent_Tick
      : kind === "action" ? Haptics.AndroidHaptics.Context_Click
      : kind === "success" ? Haptics.AndroidHaptics.Confirm : Haptics.AndroidHaptics.Reject;
    return Haptics.performAndroidHapticsAsync(effect);
  }
  if (kind === "selection") return Haptics.selectionAsync();
  if (kind === "action") return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const effect = kind === "success" ? Haptics.NotificationFeedbackType.Success
    : kind === "error" ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Warning;
  return Haptics.notificationAsync(effect);
}

export const feedback = createFeedbackPolicy({
  play,
  available: () => AppState.currentState === "active" && (Platform.OS === "ios" || Platform.OS === "android"),
});
