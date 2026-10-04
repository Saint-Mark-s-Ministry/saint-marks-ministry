import { Platform, View } from "react-native";
import { router, Stack } from "expo-router";
import {
  Brand,
  Button,
  ConnectionBadge,
  Copy,
  ListSurface,
  Screen,
  SectionTitle,
  styles,
} from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { useAuth } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";
import { useResource } from "@/data/resources";

type DashboardStats = {
  activeStudents: number;
  totalStudents: number;
  totalLessons: number;
  upcomingLessons: number;
  totalExams: number;
  academicYear: string | null;
};

type DashboardAnalytics = {
  totalAtRisk: number;
  programOverview: { overallProgramAverage: number | null };
};

type LessonListItem = {
  id: string;
  title: string | null;
  scheduledDate: string;
  status: string;
  isExamDay?: boolean;
  examSection?: { displayName: string } | null;
  _count?: { attendanceRecords: number };
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function PrepHome() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const isAdminLike = !!user && ["SUPER_ADMIN", "PRIEST", "SERVANT_PREP"].includes(user.role);
  const title = user?.role === "STUDENT" && user.name ? `Hi, ${user.name.split(" ")[0]}` : "Dashboard";

  const stats = useResource<DashboardStats>(isAdminLike ? "/api/dashboard/stats" : null);
  const analytics = useResource<DashboardAnalytics>(isAdminLike ? "/api/dashboard/analytics" : null);
  const lessons = useResource<{ data: LessonListItem[] }>(
    isAdminLike ? "/api/lessons?forAttendance=true&limit=200" : null,
  );

  const today = new Date().toISOString().slice(0, 10);
  const ordered = lessons.data?.data ?? [];
  const upNextIndex = ordered.findIndex((lesson) => lesson.scheduledDate.slice(0, 10) >= today);
  const upNext = upNextIndex >= 0 ? ordered[upNextIndex] : undefined;

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

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
      <Screen resetOnFocus refreshing={stats.loading} onRefresh={() => void stats.refresh()}>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Brand />
          <ConnectionBadge />
        </View>
        {!isAdminLike && (
          <Copy kind="caption">
            Your Servants Prep dashboard will appear here once this role's content ships.
          </Copy>
        )}
        {isAdminLike && (
          <>
            <ResourceState
              loading={stats.loading}
              error={stats.error}
              retry={() => void stats.refresh()}
            />
            {stats.data?.academicYear && (
              <Copy kind="caption">{stats.data.academicYear} academic year</Copy>
            )}

            {upNext && (
              <View style={{ gap: 10 }}>
                <SectionTitle title="Up next" />
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 22,
                    padding: 18,
                    gap: 14,
                  }}
                >
                  <View style={[styles.row, { alignItems: "flex-start" }]}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Copy kind="caption">
                        {new Date(upNext.scheduledDate).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        ·{" "}
                        {new Date(upNext.scheduledDate).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </Copy>
                      <Copy kind="heading">
                        {upNext.isExamDay ? "Exam day" : `Lesson ${upNextIndex + 1} of ${ordered.length}`}
                      </Copy>
                      <Copy kind="caption">
                        {upNext.examSection?.displayName ?? "All sections"}
                        {stats.data ? ` · ${stats.data.activeStudents} students` : ""}
                      </Copy>
                    </View>
                  </View>
                  {!upNext.isExamDay && (
                    <Button
                      label="Take attendance"
                      onPress={() => router.push("/prep-attendance")}
                    />
                  )}
                </View>
              </View>
            )}

            {stats.data && (
              <ListSurface>
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  <Metric
                    value={stats.data.activeStudents}
                    label="Active students"
                    sublabel={`of ${stats.data.totalStudents} enrolled`}
                  />
                  <Metric
                    value={analytics.data?.totalAtRisk ?? 0}
                    label="Need support"
                    sublabel="below 75%"
                    color={colors.danger}
                  />
                  <Metric
                    value={
                      analytics.data?.programOverview.overallProgramAverage != null
                        ? `${analytics.data.programOverview.overallProgramAverage.toFixed(1)}%`
                        : "—"
                    }
                    label="Exam average"
                    sublabel="target ≥ 75%"
                  />
                  <Metric
                    value={`${stats.data.totalLessons - stats.data.upcomingLessons} / ${stats.data.totalLessons}`}
                    label="Lessons"
                    sublabel={`${stats.data.upcomingLessons} upcoming`}
                  />
                </View>
              </ListSurface>
            )}

            <View style={{ gap: 10 }}>
              <SectionTitle title="This week" />
              <View style={[styles.row, { justifyContent: "space-between" }]}>
                {week.map((day) => {
                  const isToday = day.toDateString() === now.toDateString();
                  return (
                    <View key={day.toISOString()} style={{ alignItems: "center", gap: 6, flex: 1 }}>
                      <Copy kind="caption">{WEEKDAYS[day.getDay()]}</Copy>
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 15,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: isToday ? colors.primary : "transparent",
                        }}
                      >
                        <Copy style={isToday ? { color: colors.onAction, fontWeight: "700" } : undefined}>
                          {day.getDate()}
                        </Copy>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          </>
        )}
      </Screen>
    </>
  );
}

function Metric({
  value,
  label,
  sublabel,
  color,
}: {
  value: string | number;
  label: string;
  sublabel: string;
  color?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ width: "50%", padding: 12, gap: 2 }}>
      <Copy kind="heading" color={color}>
        {String(value)}
      </Copy>
      <Copy>{label}</Copy>
      <Copy kind="caption">{sublabel}</Copy>
    </View>
  );
}
