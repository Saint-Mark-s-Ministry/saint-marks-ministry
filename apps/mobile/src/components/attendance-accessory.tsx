import { Pressable, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassChrome } from "./chrome";
import { Copy, Icon } from "./ui";
import { useAppTheme } from "@/theme";
import { usePortal } from "@/data/portal-provider";
import { activeDraft, shouldShowAccessory } from "@/data/attendance-accessory";

/**
 * Persistent attendance accessory (SMM-28 shell). Floats above the native
 * tab bar whenever an attendance draft is in progress, and survives
 * navigation because the draft state itself already lives in
 * PortalProvider, above the tab navigator.
 */
export function AttendanceAccessory() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { drafts, classes } = usePortal();
  const draft = activeDraft(drafts, classes);
  if (!shouldShowAccessory(pathname, draft)) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: insets.bottom + 58,
        alignItems: "center",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Attendance in progress for ${draft.className}. Resume.`}
        onPress={() =>
          router.push({
            pathname: "/attendance/[classId]",
            params: { classId: draft.classId, date: draft.date },
          })
        }
        style={{ width: "100%", maxWidth: 420 }}
      >
        <GlassChrome
          interactive
          style={{ borderRadius: 20, padding: 12 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Icon ios="checkmark.circle" android="check_circle" size={20} color={colors.primary} />
            <View style={{ flex: 1, gap: 1 }}>
              <Copy style={{ fontWeight: "600" }}>Attendance in progress</Copy>
              <Copy kind="caption">{draft.className} · Tap to resume</Copy>
            </View>
            <Icon ios="chevron.right" android="chevron_right" size={16} color={colors.muted} />
          </View>
        </GlassChrome>
      </Pressable>
    </View>
  );
}
