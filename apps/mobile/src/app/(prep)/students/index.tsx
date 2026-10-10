import { useState } from "react";
import { Platform, View } from "react-native";
import { router, Stack } from "expo-router";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { CompactRow, Copy, InitialsAvatar, ListSurface, Screen, StatusPill } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { useAppTheme } from "@/theme";
import { useAuth } from "@/data/auth-provider";
import { useResource } from "@/data/resources";
import {
  canViewStudentRoster,
  eligibilityLabel,
  filterBySegment,
  isAdminLike,
  segmentCounts,
  type StudentSegment,
} from "@/data/prep-students";

type StudentAnalytics = {
  studentId: string;
  studentName: string;
  yearLevel: string;
  attendancePercentage: number | null;
  examAverage: number | null;
  graduationEligible: boolean;
};

const YEAR_LABELS: Record<string, string> = { YEAR_1: "Year 1", YEAR_2: "Year 2" };
const yearLabel = (level: string) => YEAR_LABELS[level] ?? level;

const COPY_BY_ROLE: Record<string, { title: string }> = {
  STUDENT: { title: "My lessons" },
  MENTOR: { title: "My mentees" },
  PARENT: { title: "My children" },
};

export default function PrepStudents() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = canViewStudentRoster(user?.role);
  const copy = (user && COPY_BY_ROLE[user.role]) ?? { title: "Students" };
  const [segment, setSegment] = useState<StudentSegment>("active");
  const resource = useResource<StudentAnalytics[]>(canView ? "/api/students/analytics/batch" : null);

  const offline = resource.error === "Could not reach the server. Check your connection and try again.";
  const all = resource.data ?? [];
  const counts = segmentCounts(all);
  const students = filterBySegment(all, segment);
  const yearLevels = new Set(all.map((s) => s.yearLevel));
  const yearSuffix = yearLevels.size === 1 ? ` · ${yearLabel([...yearLevels][0])}` : "";

  return (
    <>
      <Stack.Screen
        options={{
          title: isAdminLike(user?.role) ? "Students" : copy.title,
          headerLeft: () => <MinistrySwitcherHeaderLeft ministry="prep" />,
          headerRight: Platform.OS === "ios" ? undefined : () => <TopActions />,
        }}
      />
      {Platform.OS === "ios" && <TopActions />}
      <Screen resetOnFocus refreshing={resource.loading || resource.refreshing} onRefresh={() => void resource.refresh()}>
        {!canView ? (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>
              Nothing to show here yet
            </Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>
              {copy.title} will appear here once this role's content ships.
            </Copy>
          </View>
        ) : (
          <>
            {offline && (
              <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.dangerSoft, gap: 6 }}>
                <Copy style={{ fontWeight: "600" }} color={colors.danger}>
                  You're offline
                </Copy>
                <Copy kind="caption">Showing the last data we had. Pull down to try again once you're back online.</Copy>
              </View>
            )}
            <ResourceState loading={resource.loading} error={offline ? undefined : resource.error} retry={() => void resource.refresh()} />

            {resource.data && (
              <Copy kind="caption">
                {all.length} total · {counts.active} active{yearSuffix}
              </Copy>
            )}

            {!!resource.data && (
              <SegmentedControl
                values={[`Active ${counts.active}`, `Review ${counts.review}`, "All"]}
                selectedIndex={(["active", "review", "all"] as const).indexOf(segment)}
                onChange={({ nativeEvent }) =>
                  setSegment((["active", "review", "all"] as const)[nativeEvent.selectedSegmentIndex] ?? "active")
                }
                style={{ width: "100%", minHeight: 36 }}
              />
            )}

            <ListSurface>
              {!students.length && resource.data && (
                <View style={{ paddingVertical: 18 }}>
                  <Copy kind="caption">No students in this view.</Copy>
                </View>
              )}
              {students.map((s, index) => (
                <CompactRow
                  key={s.studentId}
                  divider={index < students.length - 1}
                  title={s.studentName}
                  subtitle={
                    (s.attendancePercentage === null || s.attendancePercentage === undefined) && (s.examAverage === null || s.examAverage === undefined)
                      ? `${yearLabel(s.yearLevel)} · no scores yet`
                      : `Att ${s.attendancePercentage ?? "—"}% · Exam ${s.examAverage ?? "—"}%`
                  }
                  icon={<InitialsAvatar name={s.studentName} size={38} />}
                  trailing={
                    (s.attendancePercentage !== null && s.attendancePercentage !== undefined) || (s.examAverage !== null && s.examAverage !== undefined) ? (
                      <StatusPill
                        label={eligibilityLabel(s.graduationEligible)}
                        color={s.graduationEligible ? colors.success : colors.warning}
                        soft={s.graduationEligible ? colors.successSoft : colors.warningSoft}
                      />
                    ) : undefined
                  }
                  onPress={() => router.push({ pathname: "/prep-student/[id]", params: { id: s.studentId } })}
                />
              ))}
            </ListSurface>
          </>
        )}
      </Screen>
    </>
  );
}
