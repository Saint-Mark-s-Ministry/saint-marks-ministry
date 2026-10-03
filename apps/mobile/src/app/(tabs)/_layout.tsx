import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform } from "react-native";
import { useAppTheme } from "@/theme";

export default function TabLayout() {
  const { colors, isDark } = useAppTheme();
  return (
    <NativeTabs
      tintColor={colors.primary}
      iconColor={{ default: colors.muted, selected: colors.primary }}
      labelStyle={{
        default: { color: colors.muted },
        selected: { color: colors.primary, fontWeight: "600" },
      }}
      backgroundColor={
        Platform.OS === "ios"
          ? isDark
            ? "rgba(28, 28, 30, 0.78)"
            : "rgba(255, 255, 255, 0.78)"
          : colors.surface
      }
      blurEffect={
        isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"
      }
      shadowColor={isDark ? "rgba(255, 255, 255, 0.08)" : colors.border}
      badgeBackgroundColor={colors.action}
      indicatorColor={colors.primarySoft}
      rippleColor={colors.primarySoft}
    >
      <NativeTabs.Trigger
        name="home"
      >
        <NativeTabs.Trigger.Icon
          sf={{ default: "house", selected: "house.fill" }}
          md="home"
        />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="classes"
      >
        <NativeTabs.Trigger.Icon
          sf={{ default: "person.2", selected: "person.2.fill" }}
          md="groups"
        />
        <NativeTabs.Trigger.Label>Classes</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="lessons"
      >
        <NativeTabs.Trigger.Icon
          sf={{ default: "book", selected: "book.fill" }}
          md="menu_book"
        />
        <NativeTabs.Trigger.Label>Lessons</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="ministry"
      >
        <NativeTabs.Trigger.Icon
          sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }}
          md="dashboard"
        />
        <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="search"
        role="search"
      >
        {Platform.OS === "android" && (
          <NativeTabs.Trigger.Icon md="search" />
        )}
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
