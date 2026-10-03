import { Platform } from "react-native";
import { Stack } from "expo-router";
import { ComingSoon, Screen } from "@/components/ui";
import { TopActions } from "@/components/top-actions";
import { useAuth } from "@/data/auth-provider";

const COPY_BY_ROLE: Record<string, { title: string; icon: "person.2" | "book" | "clock" }> = {
  STUDENT: { title: "My lessons", icon: "book" },
  MENTOR: { title: "My mentees", icon: "person.2" },
  PARENT: { title: "My children", icon: "person.2" },
};

export default function PrepStudents() {
  const { user } = useAuth();
  const copy = (user && COPY_BY_ROLE[user.role]) ?? { title: "Students", icon: "person.2" as const };
  return (
    <>
      <Stack.Screen
        options={{
          title: copy.title,
          headerRight: Platform.OS === "ios" ? undefined : () => <TopActions />,
        }}
      />
      {Platform.OS === "ios" && <TopActions />}
      <Screen resetOnFocus>
        <ComingSoon title={copy.title} icon={copy.icon} />
      </Screen>
    </>
  );
}
