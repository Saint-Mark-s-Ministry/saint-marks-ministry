import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Copy, Icon } from "./ui";
import { useAuth } from "@/data/auth-provider";
import { useAttendanceReminders } from "@/data/use-attendance-reminders";
import {
  REMINDER_CHECK_FAILED,
  REMINDER_NOTE,
  REMINDER_TITLE,
  reminderDateLabel,
  reminderRoute,
  reminderSpoken,
} from "@/data/attendance-reminders";
import { feedback } from "@/data/haptics";
import { useAppTheme } from "@/theme";

// This banner is on every Sunday School screen and cannot be dismissed, so its text stops growing
// at a size that still leaves the screen usable (the rest of the app keeps scaling to the largest size).
const CAP = 1.3;

/**
 * Class-attendance reminders, shown throughout Sunday School for each class the
 * servant is personally assigned to until the server says every active child is
 * marked. There is no dismiss control: only a completed save clears it. A local
 * draft, a session, or a partial save does not, because this reads nothing but
 * the server's answer. Separate from the Tuesday lesson-teaching reminders.
 */
export function AttendanceReminderBanner() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { viewingAs } = useAuth();
  const { reminders, checkFailed, retry } = useAttendanceReminders();

  if (!reminders.length && !checkFailed) return null;
  // The View as banner above already covers the status bar.
  const top = viewingAs ? 8 : insets.top + 4;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ paddingTop: top, paddingHorizontal: 16, paddingBottom: 10, gap: 8, backgroundColor: colors.warningSoft }}
    >
      {checkFailed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${REMINDER_CHECK_FAILED} Try again`}
          onPress={() => void retry()}
          style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 }}
        >
          <Icon ios="exclamationmark.triangle" android="warning" size={18} color={colors.warning} />
          <Copy maxFontSizeMultiplier={CAP} kind="caption" color={colors.text} style={{ flex: 1 }}>{REMINDER_CHECK_FAILED} Tap to try again.</Copy>
        </Pressable>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <Icon ios="checklist" android="checklist" size={20} color={colors.warning} />
            <View style={{ flex: 1, gap: 2 }}>
              <Copy maxFontSizeMultiplier={CAP} style={{ fontWeight: "600" }} color={colors.text}>{REMINDER_TITLE}</Copy>
              <Copy maxFontSizeMultiplier={CAP} kind="caption" color={colors.text2}>{REMINDER_NOTE}</Copy>
            </View>
          </View>
          {reminders.map((reminder) => (
            <Pressable
              key={reminder.classId}
              accessibilityRole="button"
              accessibilityLabel={reminderSpoken(reminder)}
              onPress={() => {
                feedback("selection");
                router.push(reminderRoute(reminder));
              }}
              style={({ pressed }) => ({
                minHeight: 44,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 14,
                backgroundColor: pressed ? colors.hover : colors.surface,
              })}
            >
              <Copy maxFontSizeMultiplier={CAP} style={{ flexShrink: 1, fontWeight: "500" }}>
                {reminder.className} · {reminderDateLabel(reminder.sessionDate)}
              </Copy>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Copy maxFontSizeMultiplier={CAP} kind="caption" color={colors.warning} style={{ fontWeight: "600" }}>Take attendance</Copy>
                <Icon ios="chevron.right" android="chevron_right" size={12} color={colors.warning} />
              </View>
            </Pressable>
          ))}
        </>
      )}
    </View>
  );
}
