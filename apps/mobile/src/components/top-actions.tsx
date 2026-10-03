import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { router, type Href } from "expo-router";
import * as Haptics from "expo-haptics";
import { Icon } from "./ui";
import { useAppTheme } from "@/theme";

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

export function TopActions({
  unread = 0,
  notifications = false,
}: {
  unread?: number;
  notifications?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
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
