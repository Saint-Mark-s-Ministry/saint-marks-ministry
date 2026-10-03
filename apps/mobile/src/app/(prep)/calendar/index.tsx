import { Platform } from "react-native";
import { Stack } from "expo-router";
import { ComingSoon, Screen } from "@/components/ui";
import { TopActions } from "@/components/top-actions";

export default function PrepCalendar() {
  return (
    <>
      <Stack.Screen
        options={{
          title: "Calendar",
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
