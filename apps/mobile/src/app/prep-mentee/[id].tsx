import { useState } from "react";
import { yearLevelLabel } from "@/data/year-level";
import { Alert, Linking, Pressable, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Button, CircleIconButton, Copy, InitialsAvatar, ListSurface, Screen, StatusPill, styles } from "@/components/ui";
import { Field, ResourceState, useAction } from "@/components/forms";
import { request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { useAppTheme, serifHero } from "@/theme";
import { AsyncBasisNote, RotationStatus } from "@/components/rotation-attendance";
import { EnrollmentPeople } from "@/components/enrollment-people";
import type { PrepEnrollmentPeople } from "@/data/roster-contacts";
import { useLargeType } from "@/components/attendance-history-parts";
import {
  attendanceTerms,
  isAsyncRow,
  rotationRequirement,
  type PrepAnalyticsSundaySchool,
} from "@/data/rotation-attendance";
import {
  canViewMentees,
  canViewPhone,
  formatPercent,
  isReassignmentError,
  riskLabel,
  worstFailingSection,
  type StudentAnalyticsFlat,
} from "@/data/prep-mentor";


type Enrollment = PrepEnrollmentPeople & {
  yearLevel: string | null;
  student: { id: string; name: string; email: string };
};
type StudentDetails = { student: { phone: string | null } };
type Note = { id: string; content: string; createdAt: string; author: { id: string; name: string; role: string } };
type ExamSection = { name: string; displayName: string };

export default function PrepMenteeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = canViewMentees(user?.role);
  const canPhone = canViewPhone(user?.role);

  const analytics = useResource<(StudentAnalyticsFlat & { studentName: string })[]>(
    canView ? `/api/students/analytics/batch?studentIds=${encodeURIComponent(id)}` : null,
  );
  const enrollments = useResource<Enrollment[]>(canView ? `/api/enrollments?studentId=${encodeURIComponent(id)}` : null);
  const details = useResource<StudentDetails>(canPhone ? `/api/students/${encodeURIComponent(id)}/details` : null);
  const sections = useResource<ExamSection[]>(canView ? "/api/exam-sections" : null);
  const notes = useResource<Note[]>(canView ? `/api/students/${encodeURIComponent(id)}/notes` : null);

  const mentee = analytics.data?.[0];
  const enrollment = enrollments.data?.[0];
  const isAsync = isAsyncRow(mentee);
  const terms = attendanceTerms(isAsync);
  // Rotation weeks and whether a rotation is assigned: the per-student analytics, for an async mentee only.
  const rotation = useResource<{ sundaySchool?: PrepAnalyticsSundaySchool | null }>(
    isAsync ? `/api/students/${encodeURIComponent(id)}/analytics` : null,
  );
  const reassigned = isReassignmentError(enrollments.error) || isReassignmentError(analytics.error);
  const rotationRow =
    isAsync && mentee?.sundaySchoolMet !== undefined
      ? rotationRequirement(rotation.data?.sundaySchool, mentee.sundaySchoolMet, "staff")
      : null;
  const sectionNameFor = (section: string) => sections.data?.find((s) => s.name === section)?.displayName ?? section;
  const worstSection = mentee
    ? worstFailingSection(
        Object.entries(mentee.sectionAverages).map(([section, average]) => ({
          section,
          displayName: sectionNameFor(section),
          average,
          passingMet: average >= 60,
        })),
      )
    : null;

  return (
    <>
      <Stack.Screen options={{ title: enrollment?.student.name ?? "Mentee" }} />
      <Screen refreshing={analytics.loading} onRefresh={() => { void analytics.refresh(); void enrollments.refresh(); void notes.refresh(); }}>
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>This page is for mentors and admins.</Copy>
          </View>
        )}

        {canView && reassigned && (
          <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.hover, gap: 6 }}>
            <Copy style={{ fontWeight: "600" }}>No longer your mentee</Copy>
            <Copy kind="caption">This student was reassigned to another mentor. Pull down to refresh your list.</Copy>
          </View>
        )}

        {canView && !reassigned && (
          <ResourceState loading={analytics.loading} error={analytics.error} retry={() => void analytics.refresh()} />
        )}

        {canView && !reassigned && mentee && (
          <>
            <View style={{ alignItems: "center", gap: 8, paddingVertical: 4 }}>
              <InitialsAvatar name={mentee.studentName} size={76} variant="neutral" />
              <Copy style={{ ...serifHero, }}>{mentee.studentName}</Copy>
              <Copy kind="caption">{isAsync ? "Async student" : yearLevelLabel(enrollment?.yearLevel)} · your mentee</Copy>
              <StatusPill
                label={riskLabel(mentee.graduationEligible)}
                color={mentee.graduationEligible ? colors.success : colors.danger}
                soft={mentee.graduationEligible ? colors.successSoft : colors.dangerSoft}
              />
            </View>

            <View style={[styles.row, { justifyContent: "center", gap: 24 }]}>
              {canPhone && details.data?.student.phone && (
                <>
                  <CircleIconButton ios="phone.fill" android="call" label="Call" onPress={() => void Linking.openURL(`tel:${details.data!.student.phone}`)} />
                  <CircleIconButton ios="message.fill" android="sms" label="Message" onPress={() => void Linking.openURL(`sms:${details.data!.student.phone}`)} />
                </>
              )}
              <CircleIconButton ios="envelope.fill" android="mail" label="Email" onPress={() => void Linking.openURL(`mailto:${mentee.studentName ? enrollment?.student.email : ""}`)} />
            </View>

            <View style={{ gap: 10 }}>
              <Copy style={{ fontSize: 17, fontWeight: "600" }}>Graduation requirements</Copy>
              <ListSurface>
                {isAsync ? (
                  <Row
                    label={terms.requirement}
                    value={mentee.attendancePercentage === null ? "No rotation weeks counted yet" : formatPercent(mentee.attendancePercentage)}
                    met={mentee.attendanceMet}
                    noData={mentee.attendancePercentage === null}
                  />
                ) : (
                  <Row label="Attendance ≥ 75%" value={`${formatPercent(mentee.attendancePercentage)} · met`} met={mentee.attendanceMet} />
                )}
                <Row label="Exam avg ≥ 75%" value={`${formatPercent(mentee.examAverage)} · ${mentee.examCount} ${mentee.examCount === 1 ? "exam" : "exams"}`} met={mentee.examAverageMet} />
                <Row
                  label="All sections ≥ 60%"
                  value={worstSection ? `${worstSection.displayName} ${worstSection.average.toFixed(0)}%` : "All passing"}
                  met={mentee.allSectionsMet}
                  last={!rotationRow}
                />
                {rotationRow && (
                  <Row
                    label={rotationRow.title}
                    value={rotationRow.caption}
                    met={rotationRow.met}
                    metLabel={rotationRow.metLabel}
                    unmetLabel={rotationRow.unmetLabel}
                    last
                  />
                )}
              </ListSurface>
            </View>

            {isAsync && (
              <View style={{ gap: 10 }}>
                <Copy style={{ fontSize: 17, fontWeight: "600" }}>Sunday School rotation</Copy>
                <AsyncBasisNote />
                {rotation.data && <RotationStatus sundaySchool={rotation.data.sundaySchool} now={new Date()} audience="staff" />}
              </View>
            )}

            {enrollment && (
              <View style={{ gap: 10 }}>
                <Copy style={{ fontSize: 17, fontWeight: "600" }}>Assigned support</Copy>
                <EnrollmentPeople enrollment={enrollment} />
              </View>
            )}

            <NotesSection studentId={id} notes={notes.data ?? []} currentUserId={user?.id} isAdminViewer={canPhone} onChanged={() => void notes.refresh()} />
          </>
        )}
      </Screen>
    </>
  );
}

function Row({
  label,
  value,
  met,
  last = false,
  noData = false,
  metLabel = "Met",
  unmetLabel = "Below",
}: {
  label: string;
  value: string;
  met: boolean;
  last?: boolean;
  noData?: boolean;
  metLabel?: string;
  unmetLabel?: string;
}) {
  const { colors } = useAppTheme();
  const stacked = useLargeType();
  return (
    <View style={[styles.compactRow, stacked && { flexDirection: "column", alignItems: "flex-start", gap: 8 }, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
      <View style={{ flex: stacked ? undefined : 1, gap: 2 }}>
        <Copy style={{ fontWeight: "500" }}>{label}</Copy>
        <Copy kind="caption">{value}</Copy>
      </View>
      {noData ? (
        <StatusPill label="No data yet" color={colors.muted} soft={colors.hover} />
      ) : (
        <StatusPill
          label={met ? metLabel : unmetLabel}
          color={met ? colors.success : unmetLabel === "Below" ? colors.danger : colors.warning}
          soft={met ? colors.successSoft : unmetLabel === "Below" ? colors.dangerSoft : colors.warningSoft}
        />
      )}
    </View>
  );
}

function NotesSection({
  studentId,
  notes,
  currentUserId,
  isAdminViewer,
  onChanged,
}: {
  studentId: string;
  notes: Note[];
  currentUserId?: string;
  isAdminViewer: boolean;
  onChanged: () => void;
}) {
  const { colors } = useAppTheme();
  const [content, setContent] = useState("");
  const action = useAction();

  function save() {
    if (!content.trim()) return;
    void action.run(async () => {
      await request(`/api/students/${encodeURIComponent(studentId)}/notes`, "POST", { content: content.trim() });
      setContent("");
      onChanged();
    });
  }

  function remove(noteId: string) {
    Alert.alert("Delete note?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          void action.run(async () => {
            await request(`/api/student-notes/${encodeURIComponent(noteId)}`, "DELETE");
            onChanged();
          }),
      },
    ]);
  }

  return (
    <View style={{ gap: 10 }}>
      <Copy style={{ fontSize: 17, fontWeight: "600" }}>Notes</Copy>
      <Field label="Add a note" value={content} onChange={setContent} multiline disabled={action.busy} />
      <Button label={action.busy ? "Saving…" : "Save note"} disabled={action.busy || !content.trim()} onPress={save} />
      {!!notes.length && (
        <ListSurface>
          {notes.map((note, index) => (
            <View key={note.id} style={[{ paddingVertical: 10 }, index < notes.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
              <View style={[styles.row, { justifyContent: "space-between" }]}>
                <Copy kind="caption">
                  {note.author.name} · {new Date(note.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </Copy>
                {(note.author.id === currentUserId || isAdminViewer) && (
                  <Pressable accessibilityRole="button" accessibilityLabel="Delete note" hitSlop={8} onPress={() => remove(note.id)}>
                    <Copy kind="caption" color={colors.danger}>Delete</Copy>
                  </Pressable>
                )}
              </View>
              <Copy style={{ marginTop: 2 }}>{note.content}</Copy>
            </View>
          ))}
        </ListSurface>
      )}
      {!notes.length && <Copy kind="caption">No notes yet.</Copy>}
    </View>
  );
}
