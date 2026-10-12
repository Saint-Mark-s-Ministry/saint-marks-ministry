import { Image, Pressable, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Copy, Icon } from "./ui";
import { useAppTheme } from "@/theme";
import { useAuth } from "@/data/auth-provider";
import { usePortal } from "@/data/portal-provider";
import { availableMinistries, MINISTRY_NAMES, type Ministry } from "@/data/navigation";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  PRIEST: "Priest",
  SERVANT_PREP: "Servant",
  MENTOR: "Mentor",
  STUDENT: "Student",
  SERVANT: "Servant",
  PARENT: "Parent",
};
function humanizeRole(role: string) {
  return ROLE_LABELS[role] ?? role[0] + role.slice(1).toLowerCase().replaceAll("_", " ");
}

function go(current: Ministry) {
  void Haptics.selectionAsync().catch(() => undefined);
  router.push({ pathname: "/switch-ministry", params: { current } });
}

/**
 * Compact logo + name + chevron, for a tab-root screen's native headerLeft.
 * Tapping it opens the switcher sheet; collapses to a plain (untappable)
 * mark when there's nothing to switch to.
 */
export function MinistrySwitcherHeaderLeft({ ministry }: { ministry: Ministry }) {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const { classes } = usePortal();
  if (!user) return null;
  const switchable = availableMinistries(user, classes.length > 0).length > 1;
  return (
    <Pressable
      accessibilityRole={switchable ? "button" : undefined}
      accessibilityLabel={`${MINISTRY_NAMES[ministry]}${switchable ? ", switch ministry" : ""}`}
      disabled={!switchable}
      onPress={() => go(ministry)}
      hitSlop={6}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: 18,
          backgroundColor: pressed ? colors.primarySoft : colors.hover,
        },
      ]}
    >
      <Image
        source={require("../../../../public/sunday-school-favicon.png")}
        style={{ width: 22, height: 22, borderRadius: 6 }}
        resizeMode="contain"
      />
      <Copy style={{ fontWeight: "700" }}>{MINISTRY_NAMES[ministry]}</Copy>
      {switchable && (
        <Icon ios="chevron.up.chevron.down" android="unfold_more" size={12} color={colors.muted} />
      )}
    </Pressable>
  );
}

/**
 * Full-width row at the top of "More", mirroring the header pill but with
 * room for the role + hint line. Collapses to nothing when only one
 * ministry is available (mirrors the web MinistrySwitcher's own rule).
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
      onPress={() => go(current)}
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
      <Image
        source={require("../../../../public/sunday-school-favicon.png")}
        style={{ width: 34, height: 34, borderRadius: 9 }}
        resizeMode="contain"
      />
      <View style={{ flex: 1, gap: 1 }}>
        <Copy style={{ fontWeight: "700" }}>{MINISTRY_NAMES[current]}</Copy>
        <Copy kind="caption">
          {humanizeRole(user.role)} · tap to switch ministry
        </Copy>
      </View>
      <Icon ios="chevron.up.chevron.down" android="unfold_more" size={14} color={colors.muted} />
    </Pressable>
  );
}
