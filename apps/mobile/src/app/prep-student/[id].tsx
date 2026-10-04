import { Linking, Pressable, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { SFSymbol, AndroidSymbol } from "expo-symbols";
import { Card, Copy, Icon, InitialsAvatar, styles } from "@/components/ui";

const YEAR_LABELS: Record<string, string> = { YEAR_1: "Year 1", YEAR_2: "Year 2" };
import { Page } from "@/components/forms";
import { useResource } from "@/data/resources";
import { useAppTheme } from "@/theme";

type StudentAnalytics = {
  studentId: string;
  studentName: string;
  yearLevel: string;
  attendancePercentage: number | null;
  examAverage: number | null;
  graduationEligible: boolean;
};

type StudentDetails = {
  student: { id: string; name: string; email: string | null; phone: string | null };
  allExams: { id: string; examDate: string }[];
};

type EnrollmentDetail = {
  isActive: boolean;
  mentor: { name: string } | null;
  fatherOfConfession: { name: string } | null;
};

export default function PrepStudentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const analytics = useResource<StudentAnalytics[]>(`/api/students/analytics/batch?studentIds=${encodeURIComponent(id)}`);
  const details = useResource<StudentDetails & { student: { enrollments: EnrollmentDetail[] } }>(`/api/students/${encodeURIComponent(id)}/details`);
  const student = analytics.data?.[0];
  const enrollment = details.data?.student.enrollments.find((e) => e.isActive) ?? details.data?.student.enrollments[0];

  return (
    <Page title={student?.studentName ?? "Student"} loading={analytics.loading} error={analytics.error} refresh={() => void analytics.refresh()}>
      {student && (
        <>
          <View style={{ alignItems: "center", gap: 10 }}>
            <InitialsAvatar name={student.studentName} size={72} />
            <Copy kind="title">{student.studentName}</Copy>
            <View style={[styles.row, { gap: 6 }]}>
              <View style={[styles.pill, { backgroundColor: colors.successSoft }]}>
                <Copy kind="caption" color={colors.success}>Active</Copy>
              </View>
              <View style={[styles.pill, { backgroundColor: student.graduationEligible ? colors.successSoft : colors.warningSoft }]}>
                <Copy kind="caption" color={student.graduationEligible ? colors.success : colors.warning}>
                  {student.graduationEligible ? "Eligible" : "Review"}
                </Copy>
              </View>
              <View style={[styles.pill, { backgroundColor: colors.hover }]}>
                <Copy kind="caption">{YEAR_LABELS[student.yearLevel] ?? student.yearLevel}</Copy>
              </View>
            </View>
            {details.data?.student && (
              <View style={[styles.row, { gap: 14 }]}>
                {details.data.student.phone && (
                  <ContactIcon ios="phone.fill" android="call" onPress={() => Linking.openURL(`tel:${details.data!.student.phone}`)} />
                )}
                {details.data.student.phone && (
                  <ContactIcon ios="message.fill" android="sms" onPress={() => Linking.openURL(`sms:${details.data!.student.phone}`)} />
                )}
                {details.data.student.email && (
                  <ContactIcon ios="envelope.fill" android="mail" onPress={() => Linking.openURL(`mailto:${details.data!.student.email}`)} />
                )}
              </View>
            )}
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <Card style={{ flex: 1 }}>
              <Copy kind="caption">Attendance</Copy>
              <Copy kind="title" color={colors.success}>{student.attendancePercentage ?? "—"}%</Copy>
            </Card>
            <Card style={{ flex: 1 }}>
              <Copy kind="caption">Exam average</Copy>
              <Copy kind="title" color={colors.success}>{student.examAverage ?? "—"}%</Copy>
            </Card>
          </View>

          <Card>
            {details.data?.student.email && <Copy>Email: {details.data.student.email}</Copy>}
            {details.data?.student.phone && <Copy>Phone: {details.data.student.phone}</Copy>}
            <Copy>Mentor: {enrollment?.mentor?.name ?? "Not assigned"}</Copy>
            <Copy>Father of confession: {enrollment?.fatherOfConfession?.name ?? "Not assigned"}</Copy>
          </Card>
        </>
      )}
    </Page>
  );
}

function ContactIcon({ ios, android, onPress }: { ios: SFSymbol; android: AndroidSymbol; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.hover,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon ios={ios} android={android} size={18} />
    </Pressable>
  );
}
