import { Platform } from "react-native";
import { Stack } from "expo-router";
import { Brand, ComingSoon, ConnectionBadge, Screen, styles } from "@/components/ui";
import { View } from "react-native";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { useAuth } from "@/data/auth-provider";

export default function PrepHome() {
  const { user } = useAuth();
  const title = user?.role === "STUDENT" && user.name ? `Hi, ${user.name.split(" ")[0]}` : "Dashboard";
  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerLeft: () => <MinistrySwitcherHeaderLeft ministry="prep" />,
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
