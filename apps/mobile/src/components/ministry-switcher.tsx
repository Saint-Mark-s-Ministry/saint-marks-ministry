import { Pressable, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Copy, Icon } from "./ui";
import { useAppTheme } from "@/theme";
import { useAuth } from "@/data/auth-provider";
import { usePortal } from "@/data/portal-provider";
import { availableMinistries, MINISTRY_NAMES, type Ministry } from "@/data/navigation";

/**
 * Pill at the top of the "More" page, opening a sheet to switch ministries.
 * Collapses to nothing when only one ministry is available (mirrors the web
 * MinistrySwitcher's own rule).
 */
export function MinistrySwitcherPill({ current }: { current: Ministry }) {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const { classes } = usePortal();
  if (!user) return null;
  const options = availableMinistries(user, classes.length > 0);
  if (options.length <= 1) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Switch ministry, currently ${MINISTRY_NAMES[current]}`}
      accessibilityHint="Opens a list of ministries"
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        router.push({ pathname: "/switch-ministry", params: { current } });
      }}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          paddingVertical: 12,
          paddingHorizontal: 16,
          backgroundColor: pressed ? colors.primarySoft : colors.surface,
        },
      ]}
    >
      <Icon ios="arrow.triangle.2.circlepath" android="swap_horiz" size={18} />
      <View style={{ flex: 1, gap: 1 }}>
        <Copy kind="caption">Ministry</Copy>
        <Copy style={{ fontWeight: "600" }}>{MINISTRY_NAMES[current]}</Copy>
      </View>
      <Icon ios="chevron.up.chevron.down" android="unfold_more" size={14} color={colors.muted} />
    </Pressable>
  );
}
