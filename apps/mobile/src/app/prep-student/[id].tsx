import { Linking, Pressable, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { CircleIconButton, Copy, Icon, InitialsAvatar, ListSurface, Screen, StatusPill, styles } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";
import {
  canManageStudentRecord,
  eligibilityLabel,
  recentActivity,
  type AttendanceRecordInput,
  type ExamScoreInput,
  type RecentActivity,
} from "@/data/prep-students";

const YEAR_LABELS: Record<string, string> = { YEAR_1: "Year 1", YEAR_2: "Year 2" };
const ATTENDANCE_LABEL: Record<string, string> = {
  PRESENT: "Present",
  LATE: "Late",
  ABSENT: "Absent",
  EXCUSED: "Excused",
};

type StudentAnalytics = {
  studentId: string;
  studentName: string;
  yearLevel: string;
  attendancePercentage: number | null;
  totalLessons: number;
  examAverage: number | null;
  examCount: number;
  graduationEligible: boolean;
};

type StudentDetails = {
  student: { id: string; name: string; email: string | null; phone: string | null };
  attendanceRecords: AttendanceRecordInput[];
  examScores: ExamScoreInput[];
};

type EnrollmentDetail = {
  isActive: boolean;
  mentor: { name: string } | null;
  fatherOfConfession: { name: string } | null;
};

export default function PrepStudentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canManage = canManageStudentRecord(user?.role);

  const analytics = useResource<StudentAnalytics[]>(`/api/students/analytics/batch?studentIds=${encodeURIComponent(id)}`);
  const details = useResource<StudentDetails & { student: { enrollments: EnrollmentDetail[] } }>(
    `/api/students/${encodeURIComponent(id)}/details`,
  );
  const student = analytics.data?.[0];
  const enrollment = details.data?.student.enrollments.find((e) => e.isActive) ?? details.data?.student.enrollments[0];

  const offline = analytics.error === "Could not reach the server. Check your connection and try again.";
  const activity: RecentActivity[] = details.data
    ? recentActivity(details.data.attendanceRecords, details.data.examScores)
    : [];

  const refresh = () => {
    void analytics.refresh();
    void details.refresh();
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: student?.studentName ?? "Student",
          headerRight: canManage
            ? () => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit student"
                  hitSlop={8}
                  onPress={() => router.push("/prep-roster")}
                >
                  <Copy style={{ fontWeight: "600", color: colors.primary }}>Edit</Copy>
                </Pressable>
              )
            : undefined,
        }}
      />
      <Screen refreshing={analytics.loading || analytics.refreshing} onRefresh={refresh}>
        {offline && (
          <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.dangerSoft, gap: 6 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.danger}>
              You're offline
            </Copy>
            <Copy kind="caption">Showing the last data we had. Pull down to try again once you're back online.</Copy>
          </View>
        )}
        <ResourceState loading={analytics.loading} error={offline ? undefined : analytics.error || details.error} retry={refresh} />

        {student && (
          <>
            <View style={{ alignItems: "center", gap: 10, paddingTop: 4 }}>
              <InitialsAvatar name={student.studentName} size={84} />
              <Copy
                style={{ fontFamily: "Newsreader_500Medium", fontSize: 30, lineHeight: 34, fontWeight: "500" }}
              >
                {student.studentName}
              </Copy>
              <View style={[styles.row, { gap: 6, flexWrap: "wrap", justifyContent: "center" }]}>
                <StatusPill
                  label={enrollment?.isActive === false ? "Inactive" : "Active"}
                  color={enrollment?.isActive === false ? colors.muted : colors.success}
                  soft={enrollment?.isActive === false ? colors.hover : colors.successSoft}
                />
                {((student.attendancePercentage !== null && student.attendancePercentage !== undefined) || (student.examAverage !== null && student.examAverage !== undefined)) && (
                  <StatusPill
                    label={eligibilityLabel(student.graduationEligible)}
                    color={student.graduationEligible ? colors.success : colors.warning}
                    soft={student.graduationEligible ? colors.successSoft : colors.warningSoft}
                  />
                )}
                <View style={[styles.pill, { backgroundColor: colors.hover }]}>
                  <Copy kind="caption">{YEAR_LABELS[student.yearLevel] ?? student.yearLevel}</Copy>
                </View>
              </View>
              {details.data?.student && (
                <View style={[styles.row, { gap: 12, marginTop: 6 }]}>
                  {!!details.data.student.phone && (
                    <CircleIconButton
                      ios="phone.fill"
                      android="call"
                      label="Call"
                      onPress={() => void Linking.openURL(`tel:${details.data!.student.phone}`)}
                    />
                  )}
                  {!!details.data.student.phone && (
                    <CircleIconButton
                      ios="message.fill"
                      android="sms"
                      label="Message"
                      onPress={() => void Linking.openURL(`sms:${details.data!.student.phone}`)}
                    />
                  )}
                  {!!details.data.student.email && (
                    <CircleIconButton
                      ios="envelope.fill"
                      android="mail"
                      label="Email"
                      onPress={() => void Linking.openURL(`mailto:${details.data!.student.email}`)}
                    />
                  )}
                </View>
              )}
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <StatCard
                label="Attendance"
                value={student.attendancePercentage}
                sublabel={`${student.totalLessons} lessons`}
              />
              <StatCard label="Exam average" value={student.examAverage} sublabel={`${student.examCount} exams`} />
            </View>

            {details.data?.student && (
              <ListSurface>
                <FieldRow label="Email" value={details.data.student.email} />
                <FieldRow label="Phone" value={details.data.student.phone} />
                <FieldRow label="Mentor" value={enrollment?.mentor?.name} fallback="Not assigned" />
                <FieldRow label="Father of confession" value={enrollment?.fatherOfConfession?.name} fallback="Not assigned" last />
              </ListSurface>
            )}

            <View style={{ gap: 10 }}>
              <Copy style={{ fontSize: 17, fontWeight: "600" }}>Recent</Copy>
              {!activity.length && details.data && (
                <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 18 }}>
                  <Copy kind="caption">No attendance or exam activity yet.</Copy>
                </View>
              )}
              {!!activity.length && (
                <ListSurface>
                  {activity.map((entry, index) => (
                    <ActivityRow key={`${entry.kind}-${entry.id}`} entry={entry} divider={index < activity.length - 1} />
                  ))}
                </ListSurface>
              )}
            </View>
          </>
        )}
      </Screen>
    </>
  );
}

function StatCard({ label, value, sublabel }: { label: string; value: number | null; sublabel: string }) {
  const { colors } = useAppTheme();
  const tone = (value === null || value === undefined) ? colors.text : value >= 75 ? colors.success : value >= 60 ? colors.warning : colors.danger;
  return (
    <View
      style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 22, padding: 14, gap: 8 }}
      accessible
      accessibilityLabel={`${label}: ${(value !== null && value !== undefined) ? `${value}%` : "no data"}, ${sublabel}`}
    >
      <Copy kind="caption" style={{ fontWeight: "500" }}>
        {label}
      </Copy>
      <Copy style={{ fontSize: 28, lineHeight: 32, fontWeight: "600" }} color={tone}>
        {(value !== null && value !== undefined) ? `${value}%` : "—"}
      </Copy>
      {(value !== null && value !== undefined) && (
        <View style={{ height: 5, borderRadius: 2.5, backgroundColor: colors.border, overflow: "hidden" }}>
          <View style={{ width: `${Math.min(100, value)}%`, height: "100%", borderRadius: 2.5, backgroundColor: tone }} />
        </View>
      )}
      <Copy kind="caption">{sublabel}</Copy>
    </View>
  );
}

function FieldRow({ label, value, fallback = "—", last = false }: { label: string; value?: string | null; fallback?: string; last?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        { paddingVertical: 10, paddingHorizontal: 16, gap: 2 },
        !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border, marginBottom: 0 },
      ]}
    >
      <Copy kind="caption">{label}</Copy>
      <Copy color={value ? undefined : colors.muted}>{value || fallback}</Copy>
    </View>
  );
}

// A static row, not CompactRow — these entries are history, not navigable
// destinations, so they skip the Pressable/chevron affordance that implies one.
function ActivityRow({ entry, divider }: { entry: RecentActivity; divider: boolean }) {
  const { colors } = useAppTheme();
  const dateLabel = new Date(entry.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const isAttendance = entry.kind === "attendance";
  const tone = isAttendance
    ? entry.status === "PRESENT" || entry.status === "LATE"
      ? colors.success
      : entry.status === "ABSENT"
        ? colors.danger
        : colors.muted
    : entry.percentage >= 75
      ? colors.success
      : entry.percentage >= 60
        ? colors.warning
        : colors.danger;
  const soft = isAttendance
    ? entry.status === "PRESENT" || entry.status === "LATE"
      ? colors.successSoft
      : entry.status === "ABSENT"
        ? colors.dangerSoft
        : colors.hover
    : entry.percentage >= 75
      ? colors.successSoft
      : entry.percentage >= 60
        ? colors.warningSoft
        : colors.dangerSoft;
  const title = isAttendance ? `Lesson ${entry.lessonNumber}` : entry.sectionName;
  const badgeLabel = isAttendance ? ATTENDANCE_LABEL[entry.status] ?? entry.status : `${entry.percentage}%`;

  return (
    <View
      style={[
        styles.compactRow,
        divider && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
      ]}
      accessible
      accessibilityLabel={`${title}, ${dateLabel}, ${badgeLabel}`}
    >
      <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: soft }}>
        <Icon ios={isAttendance ? "checkmark.circle" : "graduationcap"} android={isAttendance ? "check_circle" : "school"} size={16} color={tone} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Copy style={{ fontWeight: "600" }}>{title}</Copy>
        <Copy kind="caption">{dateLabel}</Copy>
      </View>
      <StatusPill label={badgeLabel} color={tone} soft={soft} />
    </View>
  );
}
