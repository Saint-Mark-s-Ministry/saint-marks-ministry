import { Platform } from "react-native";
import { Stack } from "expo-router";
import { Brand, ComingSoon, ConnectionBadge, Screen, styles } from "@/components/ui";
import { View } from "react-native";
import { TopActions } from "@/components/top-actions";
import { useAuth } from "@/data/auth-provider";

const TITLE_BY_ROLE: Record<string, string> = {
  STUDENT: "My progress",
  MENTOR: "Mentor dashboard",
  PARENT: "My children",
};

export default function PrepHome() {
  const { user } = useAuth();
  const title = (user && TITLE_BY_ROLE[user.role]) ?? "Servants Prep";
  return (
    <>
      <Stack.Screen
        options={{
          title: "Servants Prep",
          headerRight: Platform.OS === "ios" ? undefined : () => <TopActions notifications />,
        }}
      />
      {Platform.OS === "ios" && <TopActions notifications />}
      <Screen resetOnFocus>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Brand />
          <ConnectionBadge />
        </View>
        <ComingSoon title={title} icon="house" />
      </Screen>
    </>
  );
}
