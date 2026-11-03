import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, View } from "react-native";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import type { MakeupScoreAttempt, MakeupScoreStudent, MakeupScoresResponse } from "@stmark/contracts";
import { Button, Copy, Icon, ListSurface, styles } from "@/components/ui";
import { Choice, Field, ResourceState } from "@/components/forms";
import { feedback } from "@/data/haptics";
import { pickerDateFor } from "@/data/liturgical";
import { request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { useChurchToday } from "@/data/use-liturgical";
import { formatPercent } from "@/data/format-percent";
import {
  attemptLine,
  candidates,
  checkDraft,
  dayOf,
  draftFromAttempt,
  emptyDraft,
  gradeSummary,
  makeupFailure,
  makeupScoresPath,
  percentOf,
  studentsWithAttempts,
  type MakeupDraft,
} from "@/data/makeup-scores";
import { useAppTheme } from "@/theme";

const OFFLINE = "Could not reach the server. Check your connection and try again.";

/**
 * Makeup exam scores for one exam, under the original score list: every retake is its own record (student, version 1 or 2, date
 * taken, score, total points, notes), shown with the original grade beside the effective best, which the server recalculates.
 * Rendered only for the accounts the API lets grade; nothing here touches the original grade.
 */
export function MakeupScoresSection({
  examId,
  originalUnsaved,
  onSaved,
}: {
  examId: string;
  /** An original-score field holds something not yet saved: a makeup is held back until it is. */
  originalUnsaved: boolean;
  /** Called after the server accepted a makeup, so the original list (with its effective results) reloads. */
  onSaved: () => Promise<void> | void;
}) {
  const { colors } = useAppTheme();
  const { user, viewingAs } = useAuth();
  const today = useChurchToday();
  const scope = user ? `makeup-scores:${viewingAs ? `${viewingAs.originalId}>` : ""}${user.id}` : undefined;
  const resource = useResource<MakeupScoresResponse>(makeupScoresPath(examId), scope);
  const data = resource.data;
  const offline = resource.error === OFFLINE;

  const [draft, setDraft] = useState<MakeupDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const readOnly = !!viewingAs;
  const passing = data?.exam.examSection.passingScore ?? 0;
  const examDay = data ? dayOf(data.exam.examDate) : "";
  const pool = data ? candidates(data.students, passing, draft?.attemptId ? draft.studentId : undefined) : [];
  const withAttempts = data ? studentsWithAttempts(data.students) : [];

  async function save() {
    if (!data || !draft || busy || readOnly) return;
    const check = checkDraft(draft, { examDay, today });
    if (!check.ok) return Alert.alert("Check the makeup score", check.error);
    setBusy(true);
    try {
      // The server keeps the original grade and recalculates the best result in one transaction.
      await request(makeupScoresPath(examId), draft.attemptId ? "PATCH" : "POST", check.body);
      feedback("success");
      setDraft(null);
      await Promise.all([resource.refresh(), Promise.resolve(onSaved())]);
      Alert.alert(draft.attemptId ? "Makeup score updated." : "Makeup score saved.");
    } catch (error) {
      feedback("error");
      const failure = makeupFailure(error);
      Alert.alert("Unable to save", failure.message);
      if (failure.kind === "missing" || failure.kind === "forbidden") {
        setDraft(null);
        void resource.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const studentChoice = pool.map((student) => ({
    value: student.id,
    label: `${student.name} — ${student.effectivePercentage === null ? "Missed" : formatPercent(student.effectivePercentage)}`,
  }));

  return (
    <View style={{ gap: 10 }}>
      <Copy style={{ fontSize: 17, fontWeight: "600" }}>Makeup exam scores</Copy>
      <Copy kind="caption">
        Record each retake separately. The highest percentage from the original exam and all makeup attempts counts toward progress and graduation.
      </Copy>

      {offline && resource.stale && (
        <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 2 }}>
          <Copy style={{ fontWeight: "600" }} color={colors.warning}>You're offline</Copy>
          <Copy kind="caption">Showing the last list we had. Pull down to try again once you're back online.</Copy>
        </View>
      )}
      {!resource.stale && <ResourceState loading={resource.loading} error={offline ? undefined : resource.error} retry={() => void resource.refresh()} />}

      {!!data && !readOnly && (
        <>
          {originalUnsaved && (
            <View style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft }}>
              <Copy color={colors.warning}>Save your original exam score changes before recording a makeup score.</Copy>
            </View>
          )}
          {pool.length > 0 ? (
            <Button
              label="Add makeup score"
              disabled={originalUnsaved || busy}
              onPress={() => setDraft(emptyDraft(today, data.exam.totalPoints))}
            />
          ) : (
            <Copy kind="caption">No failed or missed exams need a makeup score.</Copy>
          )}
        </>
      )}

      {!!data && withAttempts.length === 0 && <Copy kind="caption">No makeup exam scores recorded yet.</Copy>}

      {withAttempts.map((student) => (
        <StudentAttempts
          key={student.id}
          student={student}
          canEdit={!readOnly}
          disabled={originalUnsaved || busy}
          onEdit={(attempt) => setDraft(draftFromAttempt(student.id, attempt))}
        />
      ))}

      {!!data && !!draft && (
        <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => !busy && setDraft(null)}>
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={[styles.row, { justifyContent: "space-between", padding: 20, paddingBottom: 8 }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                disabled={busy}
                onPress={() => setDraft(null)}
                style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}
              >
                <Icon ios="xmark" android="close" size={18} />
              </Pressable>
              <Copy style={{ fontSize: 17, fontWeight: "600" }}>{draft.attemptId ? "Edit makeup score" : "Makeup score"}</Copy>
              <View style={{ width: 40 }} />
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 16 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
              <Choice
                label="Student"
                value={draft.studentId}
                options={studentChoice}
                disabled={!!draft.attemptId || busy}
                onChange={(studentId) => setDraft({ ...draft, studentId })}
              />
              <Choice
                label="Makeup exam version"
                value={draft.version}
                options={[
                  { value: "1", label: "Version 1" },
                  { value: "2", label: "Version 2" },
                ]}
                disabled={busy}
                onChange={(version) => setDraft({ ...draft, version: version as "1" | "2" })}
              />
              <View style={{ gap: 7 }}>
                <Copy kind="caption">Date taken</Copy>
                <DateTimePicker
                  value={pickerDateFor(draft.takenDate)}
                  mode="date"
                  display="compact"
                  style={{ width: 150, height: 36 }}
                  timeZoneName="UTC"
                  maximumDate={pickerDateFor(today)}
                  minimumDate={pickerDateFor(examDay)}
                  accentColor={colors.primary}
                  onValueChange={(_, chosen) => setDraft({ ...draft, takenDate: chosen.toISOString().slice(0, 10) })}
                />
              </View>
              <Field
                label="Total points"
                value={draft.totalPoints}
                onChange={(totalPoints) => setDraft({ ...draft, totalPoints: totalPoints.replace(/[^0-9]/g, "") })}
                keyboardType="numeric"
                disabled={busy}
              />
              <Field
                label="Makeup score"
                value={draft.score}
                onChange={(score) => setDraft({ ...draft, score: score.replace(/[^0-9.]/g, "") })}
                keyboardType="numeric"
                disabled={busy}
              />
              <ScorePreview draft={draft} />
              <Field label="Notes (optional)" value={draft.notes} onChange={(notes) => setDraft({ ...draft, notes })} multiline disabled={busy} />
              <Button
                label={busy ? "Saving…" : draft.attemptId ? "Update makeup score" : "Save makeup score"}
                disabled={busy || !draft.studentId || !draft.version || draft.score === ""}
                onPress={() => void save()}
              />
            </ScrollView>
          </View>
        </Modal>
      )}
    </View>
  );
}

/** "= 88%" as the score is typed, from the points on this makeup (which can differ from the exam's own total). */
function ScorePreview({ draft }: { draft: MakeupDraft }) {
  const score = Number(draft.score);
  const total = Number(draft.totalPoints);
  if (!draft.score || !Number.isFinite(score) || !Number.isFinite(total) || total <= 0 || score > total) return null;
  return <Copy kind="caption" accessibilityLabel={`That is ${formatPercent(percentOf(score, total))}`}>= {formatPercent(percentOf(score, total))} of {total} points</Copy>;
}

function StudentAttempts({
  student,
  canEdit,
  disabled,
  onEdit,
}: {
  student: MakeupScoreStudent;
  canEdit: boolean;
  disabled: boolean;
  onEdit: (attempt: MakeupScoreAttempt) => void;
}) {
  const { colors } = useAppTheme();
  const grade = gradeSummary(student);
  return (
    <View style={{ gap: 8 }}>
      <View accessible accessibilityLabel={`${student.name}. Original ${grade.original}. Counts toward progress ${grade.counts}.`} style={{ gap: 2 }}>
        <Copy style={{ fontWeight: "600" }}>{student.name}</Copy>
        <Copy kind="caption">Original: {grade.original} · Counts toward progress: {grade.counts}</Copy>
      </View>
      <ListSurface>
        {student.attempts.map((attempt, index) => (
          <View
            key={attempt.id}
            style={[{ padding: 14, gap: 4 }, index < student.attempts.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}
          >
            <Copy>{attemptLine(attempt)}</Copy>
            {!!attempt.notes && <Copy kind="caption">{attempt.notes}</Copy>}
            {canEdit && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit version ${attempt.version} makeup score for ${student.name}`}
                disabled={disabled}
                onPress={() => onEdit(attempt)}
                style={{ minHeight: 44, justifyContent: "center", opacity: disabled ? 0.4 : 1 }}
              >
                <Copy color={colors.primary} style={{ fontWeight: "600" }}>Edit</Copy>
              </Pressable>
            )}
          </View>
        ))}
      </ListSurface>
    </View>
  );
}
