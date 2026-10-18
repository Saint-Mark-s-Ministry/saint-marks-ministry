import type { PropsWithChildren } from "react";
import { Image, Platform, Pressable, View } from "react-native";
import { MenuView } from "@expo/ui/community/menu";
import { router } from "expo-router";
import { feedback } from "@/data/haptics";
import { Copy, Icon } from "./ui";
import { useAppTheme } from "@/theme";
import { useAuth } from "@/data/auth-provider";
import { usePortal } from "@/data/portal-provider";
import { availableMinistries, MINISTRY_NAMES, type Ministry } from "@/data/navigation";

const MINISTRY_LOGOS = {
  prep: require("../../../../public/sp-logo.png"),
  sundaySchool: require("../../../../public/sunday-school-favicon.png"),
};

function go(current: Ministry) {
  feedback("selection");
  router.push({ pathname: "/switch-ministry", params: { current } });
}

/** Use the system's anchored menu on iOS, with the existing sheet on Android. */
function MinistryMenu({ current, children }: PropsWithChildren<{ current: Ministry }>) {
  const { user } = useAuth();
  const { classes } = usePortal();
  const options = user ? availableMinistries(user, classes.length > 0) : [];
  if (options.length <= 1) return children;
  if (Platform.OS !== "ios") {
    return <Pressable onPress={() => go(current)}>{children}</Pressable>;
  }
  return (
    <MenuView
      title="Switch ministry"
      actions={options.map((option) => ({
        id: option.id,
        title: option.name,
        state: option.id === current ? "on" : "off",
      }))}
      onPressAction={({ nativeEvent }) => {
        const selected = options.find((option) => option.id === nativeEvent.event);
        if (!selected || selected.id === current) return;
        feedback("selection");
        router.replace(selected.id === "prep" ? "/(prep)/home" : "/(tabs)/home");
      }}
    >
      {children}
    </MenuView>
  );
}

/**
 * Compact logo + name + chevron, for a tab-root screen's native headerLeft.
 * Tapping it opens the native ministry menu; collapses to a plain (untappable)
 * mark when there's nothing to switch to.
 */
export function MinistrySwitcherHeaderLeft({ ministry }: { ministry: Ministry }) {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const { classes } = usePortal();
  if (!user) return null;
  const switchable = availableMinistries(user, classes.length > 0).length > 1;
  return (
    <MinistryMenu current={ministry}>
      <View
        accessibilityRole={switchable ? "button" : undefined}
        accessibilityLabel={`${MINISTRY_NAMES[ministry]}${switchable ? ", switch ministry" : ""}`}
        accessibilityHint={switchable ? "Opens the ministry menu" : undefined}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: 18,
        }}
      >
        <Image
          source={MINISTRY_LOGOS[ministry]}
          accessibilityLabel={`${MINISTRY_NAMES[ministry]} logo`}
          style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: ministry === "prep" ? "black" : "transparent" }}
          resizeMode="contain"
        />
        <Copy style={{ fontWeight: "700" }}>{MINISTRY_NAMES[ministry]}</Copy>
        {switchable && (
          <Icon ios="chevron.up.chevron.down" android="unfold_more" size={12} color={colors.muted} />
        )}
      </View>
    </MinistryMenu>
  );
}
