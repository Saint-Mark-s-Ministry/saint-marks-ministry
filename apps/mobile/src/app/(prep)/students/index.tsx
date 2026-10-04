import { useState } from "react";
import { Platform, View } from "react-native";
import { router, Stack } from "expo-router";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { CompactRow, Copy, ListSurface, Screen, styles } from "@/components/ui";

const YEAR_LABELS: Record<string, string> = { YEAR_1: "Year 1", YEAR_2: "Year 2" };
const yearLabel = (level: string) => YEAR_LABELS[level] ?? level;
import { ResourceState } from "@/components/forms";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { useAppTheme } from "@/theme";
import { useAuth } from "@/data/auth-provider";
import { useResource } from "@/data/resources";

type StudentAnalytics = {
  studentId: string;
  studentName: string;
  yearLevel: string;
  attendancePercentage: number | null;
  examAverage: number | null;
  graduationEligible: boolean;
};

const COPY_BY_ROLE: Record<string, { title: string }> = {
  STUDENT: { title: "My lessons" },
  MENTOR: { title: "My mentees" },
  PARENT: { title: "My children" },
};

export default function PrepStudents() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const isAdminLike = !!user && ["SUPER_ADMIN", "PRIEST", "SERVANT_PREP"].includes(user.role);
  const copy = (user && COPY_BY_ROLE[user.role]) ?? { title: "Students" };
  const [filter, setFilter] = useState<"all" | "eligible" | "review">("all");
  const resource = useResource<StudentAnalytics[]>(
    isAdminLike || user?.role === "MENTOR" ? "/api/students/analytics/batch" : null,
  );
  const students = (resource.data ?? []).filter((s) =>
    filter === "all" ? true : filter === "eligible" ? s.graduationEligible : !s.graduationEligible,
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: isAdminLike ? "Students" : copy.title,
          headerLeft: () => <MinistrySwitcherHeaderLeft ministry="prep" />,
          headerRight: Platform.OS === "ios" ? undefined : () => <TopActions />,
        }}
      />
      {Platform.OS === "ios" && <TopActions />}
      <Screen resetOnFocus refreshing={resource.loading} onRefresh={() => void resource.refresh()}>
        {!isAdminLike && user?.role !== "MENTOR" ? (
          <Copy kind="caption">
            {copy.title} will appear here once this role's content ships.
          </Copy>
        ) : (
          <>
            <ResourceState loading={resource.loading} error={resource.error} retry={() => void resource.refresh()} />
            {resource.data && (
              <Copy kind="caption">
                {resource.data.length} total
                {" · "}
                {resource.data.filter((s) => s.graduationEligible).length} eligible
              </Copy>
            )}
            <SegmentedControl
              values={["All", "Eligible", "Review"]}
              selectedIndex={["all", "eligible", "review"].indexOf(filter)}
              onChange={({ nativeEvent }) =>
                setFilter((["all", "eligible", "review"] as const)[nativeEvent.selectedSegmentIndex] ?? "all")
              }
              style={{ width: "100%", minHeight: 36 }}
            />
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
                  subtitle={`${yearLabel(s.yearLevel)} · Att ${s.attendancePercentage ?? "—"}% · Exam ${s.examAverage ?? "—"}%`}
                  trailing={
                    <View
                      style={[
                        styles.pill,
                        { backgroundColor: s.graduationEligible ? colors.successSoft : colors.warningSoft },
                      ]}
                    >
                      <Copy kind="caption" color={s.graduationEligible ? colors.success : colors.warning}>
                        {s.graduationEligible ? "Eligible" : "Review"}
                      </Copy>
                    </View>
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

