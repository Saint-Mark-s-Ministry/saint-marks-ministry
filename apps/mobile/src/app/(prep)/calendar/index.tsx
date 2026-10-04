import { Platform } from "react-native";
import { Stack } from "expo-router";
import { ComingSoon, Screen } from "@/components/ui";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";

export default function PrepCalendar() {
  return (
    <>
      <Stack.Screen
        options={{
          title: "Calendar",
          headerLeft: () => <MinistrySwitcherHeaderLeft ministry="prep" />,
          headerRight: Platform.OS === "ios" ? undefined : () => <TopActions />,
        }}
      />
      {Platform.OS === "ios" && <TopActions />}
      <Screen resetOnFocus>
        <ComingSoon title="Calendar" icon="calendar" />
      </Screen>
    </>
  );
}
