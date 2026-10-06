import type { ReactNode } from "react";
import { Linking, Pressable, View } from "react-native";
import { Stack } from "expo-router";
import { Copy, ListSurface, Screen, StatusPill, styles } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { useAuth } from "@/data/auth-provider";
import { useResource } from "@/data/resources";
import { serifDisplay, useAppTheme } from "@/theme";
import {
  ATTENDANCE_GOAL,
  CONFESSION_LABEL,
  EXAM_GOAL,
  GUIDANCE_LABEL,
  SECTION_MINIMUM,
  attendanceGuidance,
  canViewOwnProgress,
  currentConfessionPeriod,
  examGuidance,
  nextLesson,
  periodLastDay,
  periodTitle,
  recentMarks,
  standingLabel,
  type ConfessionResponse,
  type Guidance,
  type LessonItem,
  type ProgressAnalytics,
} from "@/data/prep-progress";

const OFFLINE = "Could not reach the server. Check your connection and try again.";
const NOT_ENROLLED = "Enrollment not found";

const pct = (value: number | null) => (value === null ? "—" : `${value.toFixed(1)}%`);

export default function PrepProgress() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = canViewOwnProgress(user?.role);
  // Always the signed-in student's own record: this screen never takes an id from the route.
  const base = canView && user?.id ? `/api/students/${encodeURIComponent(user.id)}` : null;

  const analytics = useResource<ProgressAnalytics>(base ? `${base}/analytics` : null);
  const confession = useResource<ConfessionResponse>(base ? `${base}/confession` : null);
  const lessons = useResource<LessonItem[]>(base ? `${base}/lessons` : null);

  const offline = analytics.error === OFFLINE;
  const notEnrolled = analytics.error === NOT_ENROLLED;
  const progress = analytics.data;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const firstName = user?.name?.split(" ")[0];

  return (
    <>
      <Stack.Screen options={{ title: "My progress" }} />
      <Screen
        refreshing={analytics.loading || analytics.refreshing}
        onRefresh={() => {
          void analytics.refresh();
          void confession.refresh();
          void lessons.refresh();
        }}
      >
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>This page is for students.</Copy>
          </View>
        )}

        {canView && notEnrolled && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>You're not enrolled yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>
              Your progress appears once you're enrolled in Servants Prep. Ask your mentor or the office if you think this is wrong.
            </Copy>
          </View>
        )}

        {canView && offline && (
          <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.dangerSoft, gap: 6 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.danger}>You're offline</Copy>
            <Copy kind="caption">Showing nothing new. Pull down to retry once you're connected.</Copy>
          </View>
        )}

        {canView && !notEnrolled && !offline && !progress && (
          <ResourceState loading={analytics.loading} error={analytics.error} retry={() => void analytics.refresh()} />
        )}

        {canView && !notEnrolled && progress && (
          <>
            <View style={{ paddingHorizontal: 4, gap: 2 }}>
              <Copy style={{ fontFamily: serifDisplay, fontSize: 34, lineHeight: 36, fontWeight: "500" }}>
                {firstName ? `Hi, ${firstName}` : "My progress"}
              </Copy>
              <Copy kind="caption">
                {progress.enrollment.yearLevel === "YEAR_2" ? "Year 2" : "Year 1"}
                {confession.data?.academicYear ? ` · Servants Prep ${confession.data.academicYear.name}` : ""}
              </Copy>
            </View>

            <Section title="Graduation track" trailing={<StatusPill label={standingLabel(progress.graduation.eligible)} color={progress.graduation.eligible ? colors.success : colors.warning} soft={progress.graduation.eligible ? colors.successSoft : colors.warningSoft} />}>
              <MetricRow
                title="Attendance"
                value={pct(progress.attendance.percentage)}
                caption={`${progress.attendance.effectivePresent} of ${progress.attendance.totalLessons} lessons counted · Goal ${ATTENDANCE_GOAL}%`}
                percent={progress.attendance.percentage}
                goal={ATTENDANCE_GOAL}
                met={progress.attendance.met}
                hasData={progress.attendance.percentage !== null}
              />
              <MetricRow
                title="Exam average"
                value={pct(progress.exams.overallAverage)}
                caption={`${progress.exams.examsTaken} of ${progress.exams.totalApplicableExams} exams taken · Goal ${EXAM_GOAL}%`}
                percent={progress.exams.overallAverage}
                goal={EXAM_GOAL}
                met={progress.exams.overallAverageMet}
                hasData={progress.exams.overallAverage !== null}
              />
              <CheckRow
                title={`Every section at ${SECTION_MINIMUM}% or higher`}
                caption={progress.graduation.allSectionsPassing ? "All sections passing" : `${progress.exams.sectionAverages.filter((s) => !s.passingMet).length} section(s) below ${SECTION_MINIMUM}%`}
                met={progress.graduation.allSectionsPassing}
              />
              {progress.graduation.sundaySchoolMet !== undefined && (
                <CheckRow title="Sunday School serving" caption="Serving weeks at 75% or higher" met={progress.graduation.sundaySchoolMet} last />
              )}
            </Section>

            <Section title="What to do next">
              <GuidanceRow label="Attendance" guidance={attendanceGuidance(progress.attendance)} />
              <GuidanceRow label="Exam average" guidance={examGuidance(progress.exams)} last />
            </Section>

            <Section title="Recent lessons">
              {lessons.error && lessons.error !== OFFLINE ? (
                <ResourceState loading={lessons.loading} error={lessons.error} retry={() => void lessons.refresh()} />
              ) : (
                <RecentLessons marks={recentMarks(lessons.data ?? [])} loading={lessons.loading && !lessons.data} />
              )}
            </Section>

            <Section title="Coming up">
              <ListSurface>
                {nextLessonRow(lessons.data ?? [], today)}
                <ConfessionRow data={confession.data} now={now} />
              </ListSurface>
            </Section>

            <Section title="Your people">
              <ListSurface>
                <ContactRow
                  title="Mentor"
                  subtitle={progress.enrollment.mentor?.name ?? "Not assigned yet"}
                  actions={
                    progress.enrollment.mentor
                      ? [
                          { label: "Email", onPress: () => void Linking.openURL(`mailto:${progress.enrollment.mentor!.email}`) },
                          ...(progress.enrollment.mentor.phone
                            ? [{ label: "Call", onPress: () => void Linking.openURL(`tel:${progress.enrollment.mentor!.phone}`) }]
                            : []),
                        ]
                      : []
                  }
                />
                <ContactRow
                  title="Father of confession"
                  subtitle={
                    progress.enrollment.fatherOfConfession
                      ? [progress.enrollment.fatherOfConfession.name, progress.enrollment.fatherOfConfession.church].filter(Boolean).join(" · ")
                      : "Not assigned yet"
                  }
                  actions={
                    progress.enrollment.fatherOfConfession?.phone
                      ? [{ label: "Call", onPress: () => void Linking.openURL(`tel:${progress.enrollment.fatherOfConfession!.phone}`) }]
                      : []
                  }
                  last
                />
              </ListSurface>
            </Section>
          </>
        )}
      </Screen>
    </>
  );
}

function Section({ title, trailing, children }: { title: string; trailing?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={[styles.row, { justifyContent: "space-between", paddingHorizontal: 4 }]}>
        <Copy style={{ fontSize: 17, fontWeight: "600" }}>{title}</Copy>
        {trailing}
      </View>
      {children}
    </View>
  );
}

/**
 * A meter is a custom View on purpose: RN has no labeled progress bar with a goal
 * tick. The value and Met/Below pill are text, so the bar is never the only signal.
 */
function MetricRow({
  title,
  value,
  caption,
  percent,
  goal,
  met,
  hasData,
}: {
  title: string;
  value: string;
  caption: string;
  percent: number | null;
  goal: number;
  met: boolean;
  hasData: boolean;
}) {
  const { colors } = useAppTheme();
  const fill = Math.min(100, Math.max(0, percent ?? 0));
  const label = hasData ? (met ? "Met" : "Below goal") : "No data yet";
  return (
    <ListSurface>
      <View style={{ padding: 16, gap: 10 }}>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Copy style={{ fontSize: 15, fontWeight: "500" }}>{title}</Copy>
          <Copy style={{ fontSize: 22, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{value}</Copy>
        </View>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`${title} ${value}, goal ${goal} percent`}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(fill) }}
          style={{ height: 10, borderRadius: 5, backgroundColor: colors.hover }}
        >
          <View style={{ width: `${fill}%`, height: "100%", borderRadius: 5, backgroundColor: met && hasData ? colors.success : colors.warning }} />
          <View style={{ position: "absolute", left: `${goal}%`, top: -4, bottom: -4, width: 2, borderRadius: 1, backgroundColor: colors.text }} />
        </View>
        <View style={[styles.row, { justifyContent: "space-between", alignItems: "center" }]}>
          <Copy kind="caption" style={{ flexShrink: 1 }}>{caption}</Copy>
          <StatusPill
            label={label}
            color={hasData && met ? colors.success : hasData ? colors.danger : colors.muted}
            soft={hasData && met ? colors.successSoft : hasData ? colors.dangerSoft : colors.hover}
          />
        </View>
      </View>
    </ListSurface>
  );
}

function CheckRow({ title, caption, met, last = false }: { title: string; caption: string; met: boolean; last?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <ListSurface>
      <View style={[{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 44 }, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Copy style={{ fontWeight: "500" }}>{title}</Copy>
          <Copy kind="caption">{caption}</Copy>
        </View>
        <StatusPill label={met ? "Met" : "Below goal"} color={met ? colors.success : colors.danger} soft={met ? colors.successSoft : colors.dangerSoft} />
      </View>
    </ListSurface>
  );
}

function GuidanceRow({ label, guidance, last = false }: { label: string; guidance: Guidance; last?: boolean }) {
  const { colors } = useAppTheme();
  const tone = guidance.status === "on-track" ? colors.success : guidance.status === "no-data" ? colors.muted : guidance.status === "at-risk" ? colors.warning : colors.danger;
  const soft = guidance.status === "on-track" ? colors.successSoft : guidance.status === "no-data" ? colors.hover : guidance.status === "at-risk" ? colors.warningSoft : colors.dangerSoft;
  return (
    <ListSurface>
      <View style={[{ padding: 16, gap: 6 }, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Copy kind="caption" style={{ textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</Copy>
          <StatusPill label={GUIDANCE_LABEL[guidance.status]} color={tone} soft={soft} />
        </View>
        <Copy style={{ fontWeight: "500" }}>{guidance.message}</Copy>
        {guidance.detail && <Copy kind="caption">{guidance.detail}</Copy>}
      </View>
    </ListSurface>
  );
}

function RecentLessons({ marks, loading }: { marks: ReturnType<typeof recentMarks>; loading: boolean }) {
  const { colors } = useAppTheme();
  if (loading) return <Copy kind="caption">Loading lessons…</Copy>;
  if (!marks.length) return <Copy kind="caption">No lessons recorded yet.</Copy>;
  return (
    <ListSurface>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 16 }}>
        {marks.map((m) => (
          <View
            key={m.id}
            accessible
            accessibilityLabel={`${new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}: ${m.word}`}
            style={{ minWidth: 44, minHeight: 44, paddingHorizontal: 8, borderRadius: 10, backgroundColor: colors.hover, alignItems: "center", justifyContent: "center" }}
          >
            <Copy style={{ fontWeight: "600" }}>{m.mark}</Copy>
            <Copy kind="caption">{new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</Copy>
          </View>
        ))}
      </View>
      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <Copy kind="caption">P present · L late · A absent · E excused</Copy>
      </View>
    </ListSurface>
  );
}

function nextLessonRow(lessons: LessonItem[], today: string) {
  const lesson = nextLesson(lessons, today);
  if (!lesson) return null;
  const when = new Date(lesson.scheduledDate).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  return <InfoRow key="next-lesson" title={`Lesson ${lesson.lessonNumber}${lesson.title ? ` · ${lesson.title}` : ""}`} subtitle={when} />;
}

function ConfessionRow({ data, now }: { data: ConfessionResponse | null | undefined; now: Date }) {
  const { colors } = useAppTheme();
  const period = data ? currentConfessionPeriod(data.periods, now) : null;
  if (!period) return null;
  const subtitle = period.status === "due" ? `${periodTitle(period)} · due ${periodLastDay(period)}` : periodTitle(period);
  const tone = period.status === "slip" ? colors.success : period.status === "due" || period.status === "missing" ? colors.warning : colors.muted;
  const soft = period.status === "slip" ? colors.successSoft : period.status === "due" || period.status === "missing" ? colors.warningSoft : colors.hover;
  return (
    <InfoRow
      title="Confession"
      subtitle={subtitle}
      trailing={<StatusPill label={CONFESSION_LABEL[period.status]} color={tone} soft={soft} />}
    />
  );
}

function InfoRow({ title, subtitle, trailing, last = false }: { title: string; subtitle: string; trailing?: ReactNode; last?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 }, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Copy style={{ fontWeight: "500" }}>{title}</Copy>
        <Copy kind="caption">{subtitle}</Copy>
      </View>
      {trailing}
    </View>
  );
}

function ContactRow({
  title,
  subtitle,
  actions,
  last = false,
}: {
  title: string;
  subtitle: string;
  actions: { label: string; onPress: () => void }[];
  last?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 }, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Copy style={{ fontWeight: "500" }}>{title}</Copy>
        <Copy kind="caption">{subtitle}</Copy>
      </View>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          accessibilityRole="link"
          accessibilityLabel={`${action.label} ${title.toLowerCase()}`}
          onPress={action.onPress}
          hitSlop={8}
          style={{ minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center", paddingHorizontal: 8 }}
        >
          <Copy style={{ color: colors.primary, fontWeight: "600" }}>{action.label}</Copy>
        </Pressable>
      ))}
    </View>
  );
}
