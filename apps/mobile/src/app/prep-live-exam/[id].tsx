import { useState } from "react";
import { Pressable, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Button, Card, Copy, Icon, Screen, SectionTitle } from "@/components/ui";
import { ResourceState, Toggle, confirmAction } from "@/components/forms";
import { ExamAnswerChoices } from "@/components/exam-answer-choices";
import { useAuth } from "@/data/auth-provider";
import { useExamAwake, useNativeExamAttempt } from "@/data/use-live-exam";
import { liveExamAudience } from "@/data/live-exams";
import { useAppTheme } from "@/theme";

export default function LiveExam() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  if (!id || !user || liveExamAudience(user.role) !== "student") return <Screen><Copy>This answer sheet is for Servants Prep students.</Copy></Screen>;
  return <AnswerSheet key={`${user.id}:${id}`} id={id} userId={user.id} />;
}

function AnswerSheet({ id, userId }: { id: string; userId: string }) {
  const control = useNativeExamAttempt(id, userId);
  const { viewingAs } = useAuth();
  const { colors } = useAppTheme();
  const [acknowledged, setAcknowledged] = useState(false);
  const [onlyStarred, setOnlyStarred] = useState(false);
  const submitted = control.attempt?.state === "SUBMITTED";
  const closed = control.examState !== "OPEN";
  const awake = useExamAwake(control.started && control.visible && !closed && !submitted);
  const answered = control.answers.filter(Boolean).length;
  const disabled = !!viewingAs || control.busy || control.paused || control.offline || !control.visible || closed || submitted || !control.started;
  const title = control.view?.exam.examSection.displayName ?? "Live Exam";
  return <>
    <Stack.Screen options={{ title, headerLargeTitle: false }} />
    <Screen onRefresh={() => void control.refresh()} refreshing={control.loading}>
      <ResourceState loading={control.loading} error={control.error} retry={() => void control.refresh()} />
      {!!control.message && <Card><Copy color={colors.danger}>{control.message}</Copy></Card>}
      {submitted ? <Card>
        <Copy kind="heading">Exam submitted</Copy>
        <Copy>Your saved answers are final.</Copy>
        <Copy kind="caption">{typeof control.attempt?.correctCount === "number"
          ? `Result: ${control.attempt.correctCount}/50 (${control.attempt.percentage ?? control.attempt.correctCount * 2}%).`
          : "Your result will appear in My Progress after servants release the grades."}</Copy>
        {control.attempt?.submittedAt && <Copy kind="caption">Submitted {new Date(control.attempt.submittedAt).toLocaleString()}</Copy>}
      </Card> : control.view && !control.error && (closed ? <Card>
        <Copy kind="heading">Exam closed</Copy><Copy>The proctor has closed this exam. Started attempts are finalized using their saved answers.</Copy>
      </Card> : !control.started ? <Card>
        <Copy kind="heading">{control.attempt?.retakeReady ? "Your retake is ready" : control.attempt ? "Resume your answer sheet" : "Before you start"}</Copy>
        <Copy>Read the questions on your printed exam. Select your answers here; they save automatically. Submission is final.</Copy>
        <Copy>Your proctor can see your progress and exam activity. Switching apps, locking your phone, leaving this screen, or taking focus away pauses answering. Connection loss also requires proctor clearance.</Copy>
        <Copy kind="caption">Turn on Do Not Disturb before starting. Stay on this screen, reconnect if needed, and ask your proctor to unlock after an interruption. We’ll try to keep your screen awake.</Copy>
        <Toggle label="I understand the exam and monitoring rules" value={acknowledged} onChange={setAcknowledged} disabled={control.busy || !!viewingAs} />
        <Button label={control.busy ? "Opening…" : control.attempt?.retakeReady ? "Start retake" : control.attempt ? "Resume answer sheet" : "Start exam"}
          disabled={!acknowledged || control.busy || !!viewingAs} onPress={() => void control.start()} />
        {!!viewingAs && <Copy kind="caption">View as is read-only. Only the student can start or answer.</Copy>}
      </Card> : <>
        {(control.paused || control.offline) && <Card style={{ backgroundColor: colors.warningSoft }}>
          <Copy kind="heading" color={colors.warning}>{control.offline ? "Connection lost" : "Answer sheet paused"}</Copy>
          <Copy>Your saved answers are preserved. Stay on this screen, reconnect if needed, and ask your proctor to unlock the exam.</Copy>
        </Card>}
        <SectionTitle title="Answer sheet" subtitle={`${answered}/50 answered`} />
        <Copy kind="caption">Tap your selected answer again to clear it. Star a question to come back to it before submitting.</Copy>
        <Button secondary label={onlyStarred ? "Show all questions" : `Review starred questions (${control.starredQuestions.length})`}
          disabled={!onlyStarred && !control.starredQuestions.length} onPress={() => setOnlyStarred(value => !value)} />
        <View accessibilityLiveRegion="polite"><Copy kind="caption">{control.pendingCount || control.pendingEvents
          ? `${control.pendingCount} answer(s) and ${control.pendingEvents} activity report(s) waiting to save`
          : "All answers saved"}</Copy></View>
        <Copy kind="caption">{awake ? "Screen kept awake during this exam." : "Keep your screen awake during this exam."} Locking the phone still requires proctor clearance.</Copy>
        {onlyStarred && !control.starredQuestions.length && <Copy kind="caption">No starred questions left. Show all questions to continue reviewing.</Copy>}
        {control.answers.map((answer, question) => onlyStarred && !control.starredQuestions.includes(question) ? null : <View key={question} style={{ paddingVertical: 10, gap: 8, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Copy style={{ fontWeight: "600" }}>Question {question + 1}</Copy>
            <Pressable accessibilityRole="button" accessibilityLabel={`${control.starredQuestions.includes(question) ? "Unstar" : "Star"} question ${question + 1} for review`}
              accessibilityState={{ selected: control.starredQuestions.includes(question), disabled: !!viewingAs }} disabled={!!viewingAs}
              onPress={() => control.toggleStar(question)} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
              <Icon ios={control.starredQuestions.includes(question) ? "star.fill" : "star"} android={control.starredQuestions.includes(question) ? "star" : "star_border"} size={22}
                color={control.starredQuestions.includes(question) ? colors.warning : colors.muted} />
            </Pressable>
          </View>
          <ExamAnswerChoices question={question} answer={answer} count={control.view?.sheet?.choiceCounts[question] ?? 4}
            disabled={disabled} choose={choice => control.choose(question, choice)} />
        </View>)}
        <Button label={control.busy ? "Submitting…" : "Submit exam"} disabled={disabled || control.pendingCount > 0 || control.pendingEvents > 0}
          onPress={() => confirmAction("Submit final answers?", `${answered === 50 ? "All 50 questions are answered." : `${50 - answered} unanswered question(s) will count as incorrect.`}${control.starredQuestions.length ? ` You still have ${control.starredQuestions.length} starred question(s) to review.` : ""} Submission is final; you cannot change answers afterward.`, () => void control.submit())} />
      </>)}
    </Screen>
  </>;
}
