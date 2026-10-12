import { Platform, Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import {
  Button,
  Copy,
  InitialsAvatar,
  ListSurface,
  RowLink,
  Screen,
  styles,
} from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { useAuth } from "@/data/auth-provider";
import { serifDisplay, useAppTheme } from "@/theme";
import { useResource } from "@/data/resources";
import { atRiskTone, attendanceProgress, examAverageTone, isAdminLike, nextLessonIndex, type Tone } from "@/data/prep-home";

type DashboardStats = {
  activeStudents: number;
  totalStudents: number;
  totalLessons: number;
  upcomingLessons: number;
  totalExams: number;
  academicYear: string | null;
};

type AtRiskStudent = {
  id: string;
  name: string;
  attendanceRate: number | null;
  examAverage: number | null;
};

type DashboardAnalytics = {
  totalAtRisk: number;
  atRiskStudents: AtRiskStudent[];
  programOverview: { overallProgramAverage: number | null };
};

type LessonListItem = {
  id: string;
  title: string | null;
  scheduledDate: string;
  status: "SCHEDULED" | "CANCELLED" | "NO_CLASS" | "COMPLETED";
  isExamDay?: boolean;
  examSection?: { displayName: string } | null;
  _count?: { attendanceRecords: number };
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function toneColor(tone: Tone, colors: ReturnType<typeof useAppTheme>["colors"]) {
  if (tone === "success") return colors.success;
  if (tone === "warning") return colors.warning;
  if (tone === "danger") return colors.danger;
  return undefined;
}

export default function PrepHome() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const adminLike = isAdminLike(user?.role);
  const title = user?.role === "STUDENT" && user.name ? `Hi, ${user.name.split(" ")[0]}` : "Dashboard";

  const stats = useResource<DashboardStats>(adminLike ? "/api/dashboard/stats" : null);
  const analytics = useResource<DashboardAnalytics>(adminLike ? "/api/dashboard/analytics" : null);
  const lessons = useResource<LessonListItem[]>(adminLike ? "/api/lessons?forAttendance=true" : null);

  // Matches api-client.ts's exact message for a failed fetch (no ApiError,
  // meaning the request never reached the server at all).
  const offline = stats.error === "Could not reach the server. Check your connection and try again.";

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const ordered = lessons.data ?? [];
  const upNextIndex = nextLessonIndex(ordered, today);
  const upNext = upNextIndex >= 0 ? ordered[upNextIndex] : undefined;
  const marked = upNext?._count?.attendanceRecords ?? 0;
  const roster = stats.data?.activeStudents ?? 0;
  const { inProgress, percent: markedPct } = attendanceProgress(marked, roster);

  const examAverage = analytics.data?.programOverview.overallProgramAverage ?? null;
  const examColor = toneColor(examAverageTone(examAverage), colors);

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  const weekLessonDates = new Set(ordered.map((l) => l.scheduledDate.slice(0, 10)));

  const atRisk = analytics.data?.atRiskStudents ?? [];

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
      <Screen
        resetOnFocus
        refreshing={stats.loading || stats.refreshing}
        onRefresh={() => {
          void stats.refresh();
          void analytics.refresh();
          void lessons.refresh();
        }}
      >
        {stats.data?.academicYear && (
          <Copy
            kind="caption"
            accessibilityLabel={`${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}, ${stats.data.academicYear} academic year`}
          >
            {now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} ·{" "}
            {stats.data.academicYear}
          </Copy>
        )}

        {user?.role === "STUDENT" && (
          <ListSurface>
            <RowLink title="My progress" subtitle="Attendance, exams, and what to do next" onPress={() => router.push("/prep-progress")} />
            <RowLink title="My lessons" subtitle="Schedule, materials, and attendance" onPress={() => router.push("/prep-lessons")} />
            <RowLink title="Serving code" subtitle="Log your Sunday School serving week" onPress={() => router.push("/prep-serving")} />
            <RowLink title="Application" subtitle="Mentor, church, and approval form" onPress={() => router.push("/prep-application")} />
          </ListSurface>
        )}

        {!adminLike && user?.role !== "STUDENT" && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>
              {title === "Dashboard" ? "Nothing to show here yet" : "Welcome"}
            </Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>
              This dashboard is for Servants Prep administrators. Your own view ships separately.
            </Copy>
          </View>
        )}

        {adminLike && offline && (
          <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.dangerSoft, gap: 6 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.danger}>
              You're offline
            </Copy>
            <Copy kind="caption">Showing the last data we had. Pull down to try again once you're back online.</Copy>
          </View>
        )}

        {adminLike && (
          <>
            <ResourceState
              loading={stats.loading}
              error={offline ? undefined : stats.error}
              retry={() => {
                void stats.refresh();
                void analytics.refresh();
                void lessons.refresh();
              }}
            />

            {!stats.loading && stats.data && stats.data.activeStudents === 0 && (
              <View style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}>
                <Copy kind="heading">No active students yet</Copy>
                <Copy kind="caption" style={{ textAlign: "center" }}>
                  Once students are enrolled, this dashboard fills in with lessons, attendance, and exam progress.
                </Copy>
              </View>
            )}

            {!lessons.loading && !upNext && stats.data && stats.data.activeStudents > 0 && (
              <View style={{ backgroundColor: colors.surface, borderRadius: 26, padding: 18, gap: 4 }}>
                <Copy style={{ fontWeight: "600" }}>No upcoming lesson scheduled</Copy>
                <Copy kind="caption">Check Curriculum to schedule the next one.</Copy>
              </View>
            )}

            {upNext && (
              <View
                accessible
                accessibilityLabel={
                  upNext.isExamDay
                    ? `Exam day, ${new Date(upNext.scheduledDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`
                    : `Up next, lesson ${upNextIndex + 1} of ${ordered.length}, ${upNext.examSection?.displayName ?? "all sections"}, ${roster} students${inProgress ? `, attendance in progress, ${marked} of ${roster} marked` : ""}`
                }
                style={{ backgroundColor: colors.surface, borderRadius: 26, padding: 18, gap: 14 }}
              >
                <View style={[styles.row, { justifyContent: "space-between", alignItems: "flex-start" }]}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Copy kind="caption">
                      Up next ·{" "}
                      {new Date(upNext.scheduledDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      {" · "}
                      {new Date(upNext.scheduledDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </Copy>
                    <Copy style={{ fontFamily: serifDisplay, fontSize: 26, lineHeight: 30, marginTop: 2 }}>
                      {upNext.isExamDay ? "Exam day" : `Lesson ${upNextIndex + 1} of ${ordered.length}`}
                    </Copy>
                    <Copy kind="caption" style={{ color: colors.text2, fontSize: 15 }}>
                      {upNext.examSection?.displayName ?? "All sections"}
                      {roster ? ` · ${roster} students` : ""}
                    </Copy>
                  </View>
                  {inProgress && (
                    <View
                      style={[
                        styles.pill,
                        { backgroundColor: colors.primarySoft, height: 22, paddingHorizontal: 8 },
                      ]}
                    >
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
                      <Copy kind="caption" color={colors.primary}>
                        In progress
                      </Copy>
                    </View>
                  )}
                </View>

                {inProgress && (
                  <View style={{ gap: 6 }}>
                    <View style={[styles.row, { justifyContent: "space-between" }]}>
                      <Copy kind="caption">
                        <Copy style={{ fontWeight: "700" }}>{marked}</Copy> of {roster} marked
                      </Copy>
                      <Copy kind="caption">Saved as you go</Copy>
                    </View>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" }}>
                      <View
                        style={{
                          width: `${markedPct}%`,
                          height: "100%",
                          borderRadius: 3,
                          backgroundColor: colors.primary,
                        }}
                      />
                    </View>
                  </View>
                )}

                {!upNext.isExamDay && (
                  <Button
                    label={inProgress ? "Resume attendance" : "Take attendance"}
                    onPress={() => router.push({ pathname: "/prep-attendance", params: { lessonId: upNext.id } })}
                  />
                )}
              </View>
            )}

            {stats.data && (
              <ListSurface>
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  <Metric value={stats.data.activeStudents} label="Active students" sublabel={`of ${stats.data.totalStudents} enrolled`} />
                  <Metric
                    value={analytics.data?.totalAtRisk ?? 0}
                    label="Need support"
                    sublabel="below 75%"
                    color={(analytics.data?.totalAtRisk ?? 0) > 0 ? colors.danger : undefined}
                  />
                  <Metric
                    value={(examAverage !== null && examAverage !== undefined) ? `${examAverage.toFixed(1)}%` : "—"}
                    label="Exam average"
                    sublabel="target ≥ 75%"
                    color={examColor}
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
              <View style={[styles.row, { justifyContent: "space-between", alignItems: "baseline" }]}>
                <Copy style={{ fontSize: 17, fontWeight: "600" }}>This week</Copy>
                <Pressable accessibilityRole="link" onPress={() => router.push("/(prep)/calendar")}>
                  <Copy kind="caption" color={colors.primary} style={{ fontWeight: "500" }}>
                    Calendar
                  </Copy>
                </Pressable>
              </View>
              <View style={{ backgroundColor: colors.surface, borderRadius: 26, padding: 8 }}>
                <View style={{ flexDirection: "row", gap: 2 }}>
                  {week.map((day) => {
                    const isToday = day.toDateString() === now.toDateString();
                    const key = day.toISOString().slice(0, 10);
                    const hasLesson = weekLessonDates.has(key);
                    return (
                      <View
                        key={key}
                        accessible
                        accessibilityLabel={`${day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}${hasLesson ? ", lesson scheduled" : ""}${isToday ? ", today" : ""}`}
                        style={{
                          flexGrow: 1,
                          flexBasis: 0,
                          height: 60,
                          borderRadius: 18,
                          backgroundColor: isToday ? colors.primary : "transparent",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 3,
                        }}
                      >
                        <Copy
                          kind="caption"
                          style={{ fontSize: 11, opacity: 0.75, fontWeight: "500" }}
                          color={isToday ? colors.onAction : undefined}
                        >
                          {WEEKDAYS[day.getDay()]}
                        </Copy>
                        <Copy style={{ fontSize: 17, fontWeight: "600" }} color={isToday ? colors.onAction : undefined}>
                          {day.getDate()}
                        </Copy>
                        <View style={{ height: 5, width: 5, borderRadius: 2.5, backgroundColor: !isToday && hasLesson ? colors.primary : "transparent" }} />
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>

            {analytics.data && (
              <View style={{ gap: 10 }}>
                <View style={[styles.row, { justifyContent: "space-between", alignItems: "baseline" }]}>
                  <Copy style={{ fontSize: 17, fontWeight: "600" }}>Needs support</Copy>
                  {!!atRisk.length && (
                    <Pressable accessibilityRole="link" onPress={() => router.push("/(prep)/students")}>
                      <Copy kind="caption" color={colors.primary} style={{ fontWeight: "500" }}>
                        All {analytics.data.totalAtRisk}
                      </Copy>
                    </Pressable>
                  )}
                </View>
                {!atRisk.length && (
                  <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 18 }}>
                    <Copy kind="caption">No one currently needs extra support. Nicely done.</Copy>
                  </View>
                )}
                {!!atRisk.length && <ListSurface>
                  {atRisk.slice(0, 3).map((student, index, arr) => {
                    const attColor = toneColor(atRiskTone(student.attendanceRate, "attendance"), colors);
                    const examColorRow = toneColor(atRiskTone(student.examAverage, "exam"), colors);
                    return (
                      <Pressable
                        key={student.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${student.name}, attendance ${student.attendanceRate ?? "unknown"} percent, exam average ${student.examAverage ?? "unknown"} percent`}
                        onPress={() => router.push({ pathname: "/prep-student/[id]", params: { id: student.id } })}
                        style={({ pressed }) => [
                          styles.compactRow,
                          index < arr.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                          { backgroundColor: pressed ? colors.primarySoft : "transparent" },
                        ]}
                      >
                        <InitialsAvatar name={student.name} size={36} variant="neutral" />
                        <View style={{ flex: 1, gap: 1 }}>
                          <Copy numberOfLines={1}>{student.name}</Copy>
                          <Copy kind="caption">
                            Att <Copy kind="caption" color={attColor}>{student.attendanceRate ?? "—"}%</Copy>
                            {" · Exam "}
                            <Copy kind="caption" color={examColorRow}>{student.examAverage ?? "—"}%</Copy>
                          </Copy>
                        </View>
                      </Pressable>
                    );
                  })}
                </ListSurface>}
              </View>
            )}
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
    <View
      style={{ width: "50%", padding: 12, gap: 6 }}
      accessible
      accessibilityLabel={`${label}: ${value}, ${sublabel}`}
    >
      <Copy kind="caption" style={{ fontWeight: "500" }}>
        {label}
      </Copy>
      <Copy style={{ fontSize: 28, lineHeight: 32, fontWeight: "600" }} color={color ?? colors.text}>
        {String(value)}
      </Copy>
      <Copy kind="caption">{sublabel}</Copy>
    </View>
  );
}
