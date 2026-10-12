import { Alert, Pressable, View } from "react-native";
import { yearLevelLabel } from "@/data/year-level";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { MenuView } from "@expo/ui/community/menu";
import { Button, Copy, Icon, InitialsAvatar, ListSurface, Screen, StatusPill, styles } from "@/components/ui";
import { ResourceState, confirmAction } from "@/components/forms";
import { request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";
import { canViewStudentRoster } from "@/data/prep-students";
import { canManageEnrollments } from "@/data/prep-roster";
import {
  assignmentFormStatus,
  rotationPlace,
  sortAssignments,
  type PrepRotationAssignmentRow,
} from "@/data/async-rotations";
import { rotationRange } from "@/data/rotation-forms";


type Enrollment = {
  studentId: string;
  status: "ACTIVE" | "GRADUATED" | "WITHDRAWN";
  yearLevel: string | null;
  isAsyncStudent: boolean;
  student: { id: string; name: string };
};

/**
 * One async student: their Sunday School rotations and each rotation's form
 * status. Students upload their own signed forms from their Sunday School
 * screen, so there is nothing to upload here; submissions arrive in the
 * Rotation forms queue for a human to approve or return.
 */
export default function PrepAsyncStudentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = canViewStudentRoster(user?.role);
  const canManage = canManageEnrollments(user?.role);

  const enrollments = useResource<Enrollment[]>(canView ? "/api/enrollments" : null);
  const enrollment = enrollments.data?.find((e) => e.studentId === id);
  const rotations = useResource<PrepRotationAssignmentRow[]>(
    canView ? `/api/sunday-school/assignments?studentId=${encodeURIComponent(id)}` : null,
  );

  const offline = enrollments.error === "Could not reach the server. Check your connection and try again.";
  const rows = sortAssignments(rotations.data ?? [], "name").sort((a, b) => Number(b.isActive) - Number(a.isActive));

  return (
    <>
      <Stack.Screen
        options={{
          title: enrollment?.student.name ?? "Async student",
          headerRight: () =>
            canManage ? (
              <MenuView
                title="More"
                actions={[{ id: "withdraw", title: "Withdraw student", attributes: { destructive: true } }]}
                onPressAction={({ nativeEvent }) => {
                  if (nativeEvent.event === "withdraw") {
                    confirmAction(
                      `Withdraw ${enrollment?.student.name}?`,
                      "This marks the student inactive. They can be reactivated later from Roster.",
                      () => {
                        void (async () => {
                          try {
                            await request(`/api/enrollments/${encodeURIComponent(enrollment!.studentId)}`, "PATCH", { status: "WITHDRAWN" });
                            router.back();
                          } catch (error) {
                            Alert.alert("Unable to withdraw", error instanceof Error ? error.message : "Please try again.");
                          }
                        })();
                      },
                      true,
                    );
                  }
                }}
              >
                <Pressable accessibilityRole="button" accessibilityLabel="More" hitSlop={8} style={{ padding: 6 }}>
                  <Icon ios="ellipsis.circle" android="more_horiz" size={22} color={colors.text} />
                </Pressable>
              </MenuView>
            ) : undefined,
        }}
      />
      <Screen
        refreshing={enrollments.loading || rotations.loading}
        onRefresh={() => {
          void enrollments.refresh();
          void rotations.refresh();
        }}
      >
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>Async student detail is for Servants Prep administrators and mentors.</Copy>
          </View>
        )}

        {canView && (
          <>
            {offline && (
              <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.dangerSoft, gap: 6 }}>
                <Copy style={{ fontWeight: "600" }} color={colors.danger}>You're offline</Copy>
                <Copy kind="caption">Showing the last data we had. Pull down to try again once you're back online.</Copy>
              </View>
            )}
            <ResourceState
              loading={enrollments.loading}
              error={offline ? undefined : enrollments.error || rotations.error}
              retry={() => {
                void enrollments.refresh();
                void rotations.refresh();
              }}
            />

            {enrollment && (
              <>
                <View style={{ alignItems: "center", gap: 8, paddingTop: 4 }}>
                  <InitialsAvatar name={enrollment.student.name} size={76} />
                  <Copy style={{ fontFamily: "Newsreader_500Medium", fontSize: 28, lineHeight: 32, fontWeight: "500" }}>{enrollment.student.name}</Copy>
                  <Copy kind="caption">{yearLevelLabel(enrollment.yearLevel)} · async student</Copy>
                  <View style={[styles.row, { gap: 6 }]}>
                    <StatusPill label="Async" color={colors.info} soft={colors.infoSoft} />
                    <StatusPill
                      label={enrollment.status === "ACTIVE" ? "Active" : enrollment.status === "GRADUATED" ? "Graduated" : "Withdrawn"}
                      color={enrollment.status === "ACTIVE" ? colors.success : colors.muted}
                      soft={enrollment.status === "ACTIVE" ? colors.successSoft : colors.hover}
                    />
                  </View>
                </View>

                <Copy style={{ fontSize: 17, fontWeight: "600" }}>Sunday School rotations</Copy>
                {!rows.length && (
                  <ListSurface style={{ padding: 16 }}>
                    <Copy kind="caption">No Sunday School rotation assigned.</Copy>
                  </ListSurface>
                )}
                {rows.map((row) => {
                  const status = assignmentFormStatus(row);
                  const color =
                    status.tone === "success" ? colors.success : status.tone === "danger" ? colors.danger : status.tone === "warning" ? colors.warning : colors.text2;
                  const soft =
                    status.tone === "success" ? colors.successSoft : status.tone === "danger" ? colors.dangerSoft : status.tone === "warning" ? colors.warningSoft : colors.hover;
                  return (
                    <ListSurface key={row.id} style={{ padding: 16, gap: 10 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Copy style={{ fontSize: 17, fontWeight: "600" }}>{rotationPlace(row)}</Copy>
                          <Copy kind="caption">{row.isActive ? "Current rotation" : "Past rotation"}</Copy>
                        </View>
                        <StatusPill label={status.label} color={color} soft={soft} />
                      </View>
                      <Copy kind="caption">
                        {row.academicYear?.name ?? "—"} · {rotationRange(row.startDate, row.totalWeeks)}
                      </Copy>
                    </ListSurface>
                  );
                })}

                <ListSurface style={{ padding: 16, gap: 10 }}>
                  <Copy style={{ fontWeight: "600" }}>Signed forms</Copy>
                  <Copy kind="caption">
                    {enrollment.student.name} uploads their signed four-week form from their own Sunday School screen. It
                    appears in the Rotation forms queue for you to approve or return for correction.
                  </Copy>
                  <Button secondary label="Open rotation forms" onPress={() => router.push("/prep-async-students")} />
                </ListSurface>
              </>
            )}
          </>
        )}
      </Screen>
    </>
  );
}
