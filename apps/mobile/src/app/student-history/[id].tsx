import { router, Stack, useLocalSearchParams } from "expo-router";
import { Platform, Pressable } from "react-native";
import { Icon, Screen } from "@/components/ui";
import { StudentHistoryView } from "@/components/student-history-view";
import { parseStudentHistoryParams } from "@/data/student-history";
import { useStudentHistory } from "@/data/use-student-history";
import { MinistryTintProvider } from "@/theme";

/**
 * Attendance, notes and visitations for one saved child, read-only. It is
 * presented as a sheet over whatever screen opened it; that screen stays
 * mounted underneath, so closing the sheet leaves its filters, scroll position,
 * selected class and date, and unsaved marks untouched.
 *
 * The child is identified by `id` and `program` in the route, never by the name
 * shown. Guardian and family contacts, and confidential pastoral notes, are not
 * part of this sheet; the child's profile has the contacts, behind its own
 * access check.
 */
export default function StudentHistorySheet() {
  const params = useLocalSearchParams<{ id?: string; program?: string; name?: string }>();
  const target = parseStudentHistoryParams(params);
  const state = useStudentHistory(target);
  const { retry } = state;

  return (
    <MinistryTintProvider ministry="sundaySchool">
      <Stack.Screen
        options={{
          title: "History",
          headerRight:
            Platform.OS === "android"
              ? () => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close history"
                    onPress={() => router.back()}
                    style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
                  >
                    <Icon ios="xmark" android="close" />
                  </Pressable>
                )
              : undefined,
        }}
      />
      {Platform.OS === "ios" && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button accessibilityLabel="Close history" icon="xmark" onPress={() => router.back()} />
        </Stack.Toolbar>
      )}
      <Screen refreshing={false} onRefresh={target ? () => void retry() : undefined}>
        <StudentHistoryView target={target} state={state} />
      </Screen>
    </MinistryTintProvider>
  );
}
