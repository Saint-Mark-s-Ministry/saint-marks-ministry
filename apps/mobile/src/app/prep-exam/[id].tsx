import { useRef, useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { MenuView } from "@expo/ui/community/menu";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { Button, Copy, Icon, InitialsAvatar, ListSurface, Screen } from "@/components/ui";
import { GlassChrome } from "@/components/chrome";
import { ResourceState, confirmAction } from "@/components/forms";
import { request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";
import { canViewStudentRoster } from "@/data/prep-students";
import {
  canManageExams,
  filterScoreRoster,
  scoreRosterCounts,
  scoreTone,
  shouldAdvanceFocus,
  validateScore,
  type ScoreRosterSegment,
} from "@/data/prep-exams";

type Exam = {
  id: string;
  examDate: string;
  totalPoints: number;
  yearLevel: string;
  examSection: { displayName: string } | null;
};
type ExamScoreRow = { id: string; studentId: string; score: number };
type Enrollment = { studentId: string; mentorId?: string | null; student: { id: string; name: string } };

const YEAR_LABELS: Record<string, string> = { YEAR_1: "Year 1", YEAR_2: "Year 2", BOTH: "Both years" };

export default function PrepExamScores() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = canViewStudentRoster(user?.role);
  const canEdit = canManageExams(user?.role);

  const examsList = useResource<Exam[]>(canView ? "/api/exams" : null);
  const scoresRes = useResource<ExamScoreRow[]>(canView ? `/api/exams/${encodeURIComponent(id)}/scores` : null);
  const enrollments = useResource<Enrollment[]>(canView ? "/api/enrollments?status=ACTIVE&isActive=true" : null);
  const exam = examsList.data?.find((e) => e.id === id);

  const offline = enrollments.error === "Could not reach the server. Check your connection and try again.";

  const [segment, setSegment] = useState<ScoreRosterSegment>("all");
  const [query, setQuery] = useState("");
  const [localScores, setLocalScores] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const inputRefs = useRef<Record<string, TextInput | null>>({});

  const serverScoreByStudent = new Map((scoresRes.data ?? []).map((s) => [s.studentId, s]));
  const roster = enrollments.data ?? [];
  const rows = roster
    .filter((e) => !query.trim() || e.student.name.toLowerCase().includes(query.trim().toLowerCase()))
    .map((e) => ({
      studentId: e.studentId,
      name: e.student.name,
      mentorId: e.mentorId,
      server: serverScoreByStudent.get(e.studentId),
      score: serverScoreByStudent.get(e.studentId)?.score ?? null,
    }));
  const counts = scoreRosterCounts(rows, user?.id);
  const visibleRows = filterScoreRoster(rows, segment, user?.id);

  function valueFor(studentId: string, server?: { score: number }) {
    if (localScores[studentId] !== undefined) return localScores[studentId];
    return server ? String(server.score) : "";
  }

  function save(studentId: string, text: string) {
    if (!exam || !canEdit) return;
    const { value, error } = validateScore(text, exam.totalPoints);
    if (error) {
      setRowErrors((prev) => ({ ...prev, [studentId]: error }));
      return;
    }
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    if ((value === null || value === undefined)) return; // cleared/empty — nothing to save
    const existing = serverScoreByStudent.get(studentId);
    setSavingIds((prev) => new Set(prev).add(studentId));
    void (async () => {
      try {
        if (existing) {
          await request(`/api/exam-scores/${encodeURIComponent(existing.id)}`, "PATCH", { score: value });
        } else {
          await request(`/api/exams/${encodeURIComponent(id)}/scores`, "POST", { studentId, score: value });
        }
        await scoresRes.refresh();
      } catch (err) {
        setRowErrors((prev) => ({ ...prev, [studentId]: err instanceof Error ? err.message : "Unable to save. Tap to retry." }));
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(studentId);
          return next;
        });
      }
    })();
  }

  function deleteExam() {
    confirmAction(
      "Delete this exam?",
      "This permanently deletes the exam and every score recorded for it. This can't be undone.",
      () => {
        void (async () => {
          try {
            await request(`/api/exams/${encodeURIComponent(id)}`, "DELETE");
            router.back();
          } catch (error) {
            Alert.alert("Unable to delete", error instanceof Error ? error.message : "Please try again.");
          }
        })();
      },
      true,
    );
  }

  const dateLabel = exam ? new Date(exam.examDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";

  return (
    <>
      <Stack.Screen
        options={{
          title: exam?.examSection?.displayName ?? "Exam",
          headerLargeTitle: false,
          headerTitle: exam
            ? () => (
                <View style={{ alignItems: "center" }}>
                  <Copy style={{ fontWeight: "600", fontSize: 17 }}>{exam.examSection?.displayName ?? "Exam"}</Copy>
                  <Copy kind="caption">
                    {YEAR_LABELS[exam.yearLevel] ?? exam.yearLevel} · {dateLabel}
                  </Copy>
                </View>
              )
            : undefined,
          headerRight: canEdit
            ? () => (
                <MenuView
                  title="Exam options"
                  actions={[{ id: "delete", title: "Delete exam", attributes: { destructive: true } }]}
                  onPressAction={({ nativeEvent }) => {
                    if (nativeEvent.event === "delete") deleteExam();
                  }}
                >
                  <Pressable accessibilityRole="button" accessibilityLabel="Exam options" hitSlop={8} style={{ padding: 6 }}>
                    <Icon ios="ellipsis.circle" android="more_horiz" size={22} color={colors.text} />
                  </Pressable>
                </MenuView>
              )
            : undefined,
        }}
      />
      <Stack.SearchBar
        autoCapitalize="none"
        placement="automatic"
        placeholder="Search students"
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
        onCancelButtonPress={() => setQuery("")}
      />
      <Screen bottom={140} refreshing={enrollments.loading || scoresRes.loading} onRefresh={() => { void enrollments.refresh(); void scoresRes.refresh(); }}>
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>Exam scores are for Servants Prep administrators and mentors.</Copy>
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
              loading={enrollments.loading || examsList.loading}
              error={offline ? undefined : enrollments.error || scoresRes.error || examsList.error}
              retry={() => { void enrollments.refresh(); void scoresRes.refresh(); void examsList.refresh(); }}
            />

            {!canEdit && exam && (
              <View style={{ padding: 14, borderRadius: 16, backgroundColor: colors.hover }}>
                <Copy kind="caption">You have read-only access. Scores can only be entered by an administrator.</Copy>
              </View>
            )}

            {!!roster.length && (
              <SegmentedControl
                values={[`All ${counts.all}`, `Not entered ${counts.notEntered}`, "Mentees"]}
                selectedIndex={(["all", "notEntered", "mentees"] as const).indexOf(segment)}
                onChange={({ nativeEvent }) =>
                  setSegment((["all", "notEntered", "mentees"] as const)[nativeEvent.selectedSegmentIndex] ?? "all")
                }
                style={{ width: "100%", minHeight: 36 }}
              />
            )}

            {!!roster.length && !visibleRows.length && (
              <View style={{ paddingVertical: 18, alignItems: "center" }}>
                <Copy kind="caption">No students match this filter.</Copy>
              </View>
            )}

            {!!visibleRows.length && exam && (
              <ListSurface>
                {visibleRows.map((row, index) => {
                  const value = valueFor(row.studentId, row.server);
                  const error = rowErrors[row.studentId];
                  const tone = (row.score !== null && row.score !== undefined) ? scoreTone(row.score, "exam") : "neutral";
                  const toneColor = tone === "success" ? colors.success : tone === "warning" ? colors.warning : tone === "danger" ? colors.danger : colors.muted;
                  return (
                    <View
                      key={row.studentId}
                      style={[
                        { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingVertical: 8, paddingHorizontal: 16 },
                        index < visibleRows.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                      ]}
                    >
                      <InitialsAvatar name={row.name} size={34} variant="neutral" />
                      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                        <Copy numberOfLines={1}>{row.name}</Copy>
                        <Copy kind="caption" color={error ? colors.danger : toneColor}>
                          {error ?? ((row.score !== null && row.score !== undefined) ? `${Math.round((row.score / exam.totalPoints) * 1000) / 10}%` : "Not entered")}
                        </Copy>
                      </View>
                      <TextInput
                        ref={(node) => {
                          inputRefs.current[row.studentId] = node;
                        }}
                        accessibilityLabel={`Score for ${row.name}`}
                        value={value}
                        editable={canEdit && !savingIds.has(row.studentId)}
                        keyboardType="number-pad"
                        placeholder="—"
                        placeholderTextColor={colors.muted}
                        onChangeText={(text) => {
                          const digits = text.replace(/[^0-9]/g, "");
                          setLocalScores((prev) => ({ ...prev, [row.studentId]: digits }));
                          if (shouldAdvanceFocus(digits, exam.totalPoints)) {
                            save(row.studentId, digits);
                            inputRefs.current[visibleRows[index + 1]?.studentId ?? ""]?.focus();
                          }
                        }}
                        onBlur={() => save(row.studentId, localScores[row.studentId] ?? value)}
                        style={{
                          width: 64,
                          height: 40,
                          borderRadius: 12,
                          backgroundColor: colors.hover,
                          color: colors.text,
                          textAlign: "center",
                          fontSize: 17,
                          opacity: canEdit ? 1 : 0.5,
                        }}
                      />
                      <Copy kind="caption" style={{ width: 40 }}>/ {exam.totalPoints}</Copy>
                    </View>
                  );
                })}
              </ListSurface>
            )}

            <Copy kind="caption">Scores save as you type. The number pad moves to the next student after two digits.</Copy>
          </>
        )}
      </Screen>

      {!!roster.length && (
        <View style={{ position: "absolute", left: 16, right: 16, bottom: 26 }}>
          <GlassChrome style={{ borderRadius: 26, padding: 14, gap: 10 }}>
            <Copy kind="caption" style={{ textAlign: "center" }}>
              <Copy style={{ fontWeight: "700" }}>{roster.length - counts.notEntered}</Copy> of {roster.length} entered
            </Copy>
            <Button label="Done" onPress={() => router.back()} />
          </GlassChrome>
        </View>
      )}
    </>
  );
}
