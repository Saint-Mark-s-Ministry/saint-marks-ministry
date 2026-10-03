import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { router, type Href } from "expo-router";
import * as Haptics from "expo-haptics";
import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import { Icon } from "./ui";
import { useAppTheme } from "@/theme";
import { useAuth } from "@/data/auth-provider";
import { usePortal } from "@/data/portal-provider";
import { availableMinistries, type Ministry } from "@/data/navigation";

function HeaderButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? colors.primarySoft : "transparent",
        opacity: pressed ? 0.75 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

/**
 * Mirrors the web MinistrySwitcher: only renders when more than one
 * ministry is available, and switching is a route replace to the other
 * tab group's home screen (native tab bars don't support swapping their
 * trigger set at runtime, so this is two parallel route groups).
 */
function MinistrySwitcher({ current }: { current: Ministry }) {
  const { user } = useAuth();
  const { classes } = usePortal();
  if (!user) return null;
  const options = availableMinistries(user, classes.length > 0);
  if (options.length <= 1) return null;
  const actions: MenuAction[] = options.map((option) => ({
    id: option.id,
    title: option.name,
    state: option.id === current ? "on" : "off",
  }));
  return (
    <MenuView
      title="Switch ministry"
      actions={actions}
      style={{ width: 38, height: 38 }}
      onPressAction={({ nativeEvent }) => {
        const next = nativeEvent.event as Ministry;
        if (next === current) return;
        void Haptics.selectionAsync().catch(() => undefined);
        router.replace(next === "prep" ? "/(prep)/home" : "/(tabs)/home");
      }}
    >
      <HeaderButton label="Switch ministry" onPress={() => {}}>
        <Icon ios="arrow.triangle.2.circlepath" android="swap_horiz" size={20} />
      </HeaderButton>
    </MenuView>
  );
}

export function TopActions({
  unread = 0,
  notifications = false,
  ministry = "sundaySchool",
}: {
  unread?: number;
  notifications?: boolean;
  ministry?: Ministry;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <MinistrySwitcher current={ministry} />
      {notifications && (
        <HeaderButton
          label={`Notifications, ${unread} unread`}
          onPress={() => router.push("/notifications")}
        >
          <Icon ios="bell" android="notifications" size={20} />
          {unread > 0 && (
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                position: "absolute",
                top: 7,
                right: 7,
                backgroundColor: colors.action,
              }}
            />
          )}
        </HeaderButton>
      )}
      <HeaderButton
        label="Account"
        onPress={() => router.push("/account" as Href)}
      >
        <Icon
          ios="person.crop.circle.fill"
          android="account_circle"
          size={25}
        />
      </HeaderButton>
    </View>
  );
}
