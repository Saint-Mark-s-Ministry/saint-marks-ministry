import { useState, type ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import type { DigitalExamView, ExamActivity } from "@stmark/contracts";
import { examActivityMessage, latestPauseActivity } from "@stmark/domain";
import { Button, Card, Copy, Screen, SectionTitle, StatusPill } from "@/components/ui";
import { Choice, Field, ResourceState, confirmAction, useAction } from "@/components/forms";
import { ExamAnswerChoices } from "@/components/exam-answer-choices";
import { useAuth } from "@/data/auth-provider";
import { request } from "@/data/resources";
import { useLiveResource } from "@/data/use-live-exam";
import { useProctorAlerts } from "@/data/use-proctor-alerts";
import { canUnlockStudent, completeAnswerKey, digitalExamPath, examCalendarDate, liveExamAudience, proctorStatus, type ProctorRow } from "@/data/live-exams";
import { useAppTheme } from "@/theme";

export default function ExamMonitor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  if (!id || liveExamAudience(user?.role) !== "staff") return <Screen><Copy>Exam Monitoring is for Servants Prep servants and priests.</Copy></Screen>;
  return <Monitor key={id} id={id} />;
}

function Monitor({ id }: { id: string }) {
  const resource = useLiveResource<DigitalExamView>(digitalExamPath(id));
  const alerts = useProctorAlerts(id, resource.data);
  const { viewingAs } = useAuth();
  const { colors } = useAppTheme();
  const action = useAction();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [configuring, setConfiguring] = useState(false);
  const view = resource.data;
  const sheet = view?.sheet;
  const manage = view?.canManage === true && !viewingAs;
  const roster = view?.roster ?? [];
  const selected = roster.find(row => row.student.id === selectedId);
  const run = (name: string, payload: Record<string, unknown> = {}) => {
    if (!manage) return;
    void action.run(async () => {
      await request(digitalExamPath(id), "POST", { action: name, ...payload });
      if (name === "configure") setConfiguring(false);
      await resource.refresh();
    }, name === "unlock" ? "Student unlocked" : name === "configure" ? "Answer sheet setup saved" : name === "close" ? "Exam closed; saved answers submitted" : name === "release" ? "Results released" : name === "retake" ? "Retake approved; previous grade preserved" : name === "ready" ? "Exam ready to open" : name === "reset" ? "Test opening reset" : "Exam opened");
  };
  const savedAnswers = roster.flatMap(row => row.attempt?.events.filter(event => event.kind === "ANSWER_SAVED").map(event => ({ event, name: row.student.name })) ?? [])
    .sort((a, b) => b.event.createdAt.localeCompare(a.event.createdAt)).slice(0, 8);
  return <>
    <Stack.Screen options={{ title: view?.exam.examSection.displayName ?? "Exam Monitoring", headerLargeTitle: false }} />
    <Screen onRefresh={() => void resource.refresh()} refreshing={resource.refreshing}>
      <ResourceState loading={resource.loading} error={resource.error} retry={() => void resource.refresh()} />
      {resource.error && <Copy>Monitoring is unavailable. Student status is out of date; saved answers and pauses remain on the server.</Copy>}
      {view && <>
        <Copy kind="caption">{examCalendarDate(view.exam.examDate)} · {view.exam.academicYear.name} · {sheet?.state === "DRAFT" && sheet.openedAt ? "Ready to open" : sheet?.state ?? "Needs setup"}</Copy>
        {!manage && <Copy kind="caption">Monitoring is read-only. Servants Prep servants control opening, closing, and unlocking.</Copy>}
        {manage && !sheet?.openedAt && <Card>
          <Copy kind="heading">Set up the original exam</Copy>
          <Copy kind="caption">Printed questions · 50 equally weighted answers. The key and choices lock when the exam first opens.</Copy>
          <Button secondary label={configuring ? "Hide answer key setup" : "Configure answer sheet"} disabled={action.busy} onPress={() => setConfiguring(value => !value)} />
          {configuring && <Configuration key={`${sheet?.choiceCounts.join("")}:${view.answerKey?.join("")}`} view={view} busy={action.busy} save={(choiceCounts, answerKey) => run("configure", { choiceCounts, answerKey })} />}
        </Card>}
        {manage && sheet && <Card>
          <Copy kind="heading">Exam controls</Copy>
          {sheet.openedAt && sheet.state !== "DRAFT" && <Button secondary label="Set ready to open" disabled={action.busy}
            onPress={() => confirmAction("Set ready to open?", "Hide the sheet until you open it again. Configuration, grades, submissions and retake approvals are preserved. Close started attempts first.", () => run("ready"))} />}
          {sheet.state !== "OPEN" && (!sheet.releasedAt || roster.some(row => row.attempt && row.attempt.state !== "SUBMITTED")) && <Button label="Open exam" disabled={action.busy}
            onPress={() => confirmAction("Open this exam?", "All eligible students who have not submitted can begin. The answer key and choice counts lock on first opening.", () => run("open"))} />}
          {sheet.state === "OPEN" && <Button secondary label="Close exam" disabled={action.busy}
            onPress={() => confirmAction("Close and finalize this exam?", "All started attempts, including paused attempts, will be submitted using saved answers. Unsaved changes cannot be included. Blank answers count as incorrect.", () => run("close"))} />}
          {sheet.state === "CLOSED" && (!sheet.releasedAt || !!view.pendingResults) && <Button label="Release results" disabled={action.busy}
            onPress={() => confirmAction("Release exam results?", "Grades become visible to students in My Progress. Retakes retain the higher score; paper makeup records are preserved.", () => run("release"))} />}
          {sheet.openedAt && !sheet.releasedAt && !view.hasAttempts && <Button secondary label="Reset test opening" disabled={action.busy}
            onPress={() => confirmAction("Reset this test opening?", "Return the sheet to draft and hide it from students. The key and all grades are preserved. Reset is blocked if any student has joined.", () => run("reset"))} />}
        </Card>}
        {!manage && !sheet && <Copy>A Servants Prep servant has not configured an answer sheet yet.</Copy>}
        {sheet && <>
          <Card>
            <Copy kind="heading">Live monitoring</Copy>
            <Copy>{roster.filter(row => row.attempt && !row.attempt.retakeReady).length}/{roster.filter(row => row.eligible).length} started · {roster.filter(row => row.attempt?.state === "PAUSED" && !row.attempt.retakeReady).length} paused · {roster.filter(row => row.attempt?.state === "SUBMITTED").length} submitted</Copy>
            <Copy kind="caption">Refreshes every 2 seconds while this screen is active. Activity flags support proctor review; they do not establish cheating.</Copy>
            {sheet.releasedAt && <Copy kind="caption" color={colors.success}>Results released {new Date(sheet.releasedAt).toLocaleString()}</Copy>}
            <Button secondary label={alerts.sound ? "Mute alert sound" : "Enable alert sound"} onPress={() => void alerts.toggleSound()} />
            {!!alerts.soundError && <Copy kind="caption" color={colors.warning}>{alerts.soundError}</Copy>}
          </Card>
          {!!alerts.alerts.length && <Card style={{ backgroundColor: colors.warningSoft }}>
            <Copy kind="heading">Recent alerts</Copy>
            {alerts.alerts.map(item => <View key={item.event.id} style={{ gap: 3 }}>
              <Copy style={{ fontWeight: "600" }}>{item.name} · {proctorStatus(roster.find(row => row.student.id === item.studentId) ?? { student: { id: "", name: "" }, eligible: false, attempt: null })}</Copy>
              <Activity event={item.event} />
            </View>)}
            <Button secondary label="Dismiss alerts" onPress={alerts.dismiss} />
          </Card>}
          <SectionTitle title="Students" subtitle="Select a student for connection details, unlocking, and activity history." />
          <Field label="Find a student" value={search} onChange={setSearch} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {roster.filter(row => row.student.name.toLowerCase().includes(search.trim().toLowerCase())).map(row => {
              const status = proctorStatus(row);
              const warning = status === "Paused" || status === "Connection stale";
              const latestAnswer = row.attempt?.events.filter(event => event.kind === "ANSWER_SAVED").at(-1);
              return <Pressable key={row.student.id} accessibilityRole="button" accessibilityLabel={`${row.student.name}, ${status}, ${row.attempt?.answeredCount ?? 0} of 50 answered`}
                onPress={() => setSelectedId(row.student.id)} style={({ pressed }) => ({
                  flexGrow: 1, flexBasis: "46%", minWidth: 135, borderWidth: 1, borderColor: warning ? colors.warning : colors.border,
                  backgroundColor: warning ? colors.warningSoft : colors.surface, borderRadius: 18, padding: 14, gap: 8, opacity: pressed ? 0.65 : 1,
                })}>
                <Copy style={{ fontWeight: "600" }}>{row.student.name}</Copy>
                <StatusPill label={status} color={warning ? colors.warning : colors.success} soft={warning ? colors.warningSoft : colors.successSoft} />
                <Copy kind="caption">{row.attempt?.answeredCount ?? 0}/50 answered</Copy>
                {latestAnswer && <Copy kind="caption">{examActivityMessage(latestAnswer.kind, latestAnswer).title}</Copy>}
              </Pressable>;
            })}
          </View>
          {!roster.length && <Copy kind="caption">No eligible students are waiting for this exam.</Copy>}
          <Disclosure title="Recent saved answers">
            {!savedAnswers.length && <Copy kind="caption">No answer changes have been saved yet.</Copy>}
            {savedAnswers.map(item => <View key={item.event.id} style={{ gap: 3 }}><Copy style={{ fontWeight: "600" }}>{item.name}</Copy><Activity event={item.event} /></View>)}
          </Disclosure>
        </>}
        {manage && sheet?.openedAt && !!view.retakeCandidates?.length && <Disclosure title="Individual retakes">
          <Copy kind="caption">Previous answers, history and grades are preserved. Only a higher released score improves the grade.</Copy>
          {view.retakeCandidates.map(student => <View key={student.id} style={{ gap: 6 }}>
            <Copy>{student.name}</Copy><Button secondary label={`Allow retake for ${student.name}`} disabled={action.busy}
              onPress={() => confirmAction(`Allow ${student.name} to retake?`, "Create a blank original answer sheet for this student while preserving the previous attempt and grade. Open the exam when ready, then close and release results. Paper makeups are unchanged.", () => run("retake", { studentId: student.id }))} />
          </View>)}
        </Disclosure>}
        {!!view.completedHistory?.length && <Disclosure title={`Past digital activity (${view.completedHistory.length})`}>
          {view.completedHistory.map(history => <Disclosure key={`${history.student.id}:${history.attemptNumber}`} title={`${history.student.name} · Attempt ${history.attemptNumber ?? 1}`}>
            {typeof history.snapshot?.correctCount === "number" && <Copy>{history.snapshot.correctCount}/50 ({history.snapshot.correctCount * 2}%)</Copy>}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{history.snapshot?.answers?.map((answer, question) => <Copy key={question} kind="caption" style={{ minWidth: 48 }}>{question + 1}: {answer || "Blank"}</Copy>)}</View>
            {history.events.map(event => <Activity key={event.id} event={event} />)}
          </Disclosure>)}
        </Disclosure>}
        {!!selected && <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedId(null)}>
          <Screen>
            <Button secondary label="Close student details" onPress={() => setSelectedId(null)} />
            <Copy kind="heading">{selected.student.name}</Copy>
            <StudentDetails view={view} row={selected} busy={action.busy} manage={!!manage} unlock={() => run("unlock", { attemptId: selected.attempt?.id })} />
          </Screen>
        </Modal>}
      </>}
    </Screen>
  </>;
}

function Configuration({ view, busy, save }: { view: DigitalExamView; busy: boolean; save: (counts: number[], key: string[]) => void }) {
  const [counts, setCounts] = useState<number[]>(view.sheet?.choiceCounts ?? Array<number>(50).fill(4));
  const [key, setKey] = useState<string[]>(view.answerKey ?? Array<string>(50).fill(""));
  return <>
    <Copy>{key.filter(Boolean).length}/50 key answers entered</Copy>
    {key.map((answer, question) => <View key={question} style={{ gap: 10, paddingVertical: 8 }}>
      <Choice label={`Question ${question + 1} choices`} value={String(counts[question])} disabled={busy}
        options={[2, 3, 4, 5, 6, 7, 8].map(count => ({ value: String(count), label: `A–${"ABCDEFGH"[count - 1]}` }))}
        onChange={value => {
          const next = [...counts]; next[question] = Number(value); setCounts(next);
          if ("ABCDEFGH".indexOf(key[question]) >= Number(value)) { const answers = [...key]; answers[question] = ""; setKey(answers); }
        }} />
      <ExamAnswerChoices question={question} answer={answer} count={counts[question]} disabled={busy} choose={choice => { const next = [...key]; next[question] = choice; setKey(next); }} />
    </View>)}
    <Button label={busy ? "Saving…" : "Save answer sheet setup"} disabled={busy || !completeAnswerKey(counts, key)} onPress={() => save(counts, key)} />
  </>;
}
function StudentDetails({ view, row, busy, manage, unlock }: { view: DigitalExamView; row: ProctorRow; busy: boolean; manage: boolean; unlock: () => void }) {
  const { colors } = useAppTheme();
  const attempt = row.attempt;
  const pause = attempt ? latestPauseActivity(attempt.events) : null;
  return <>
    <Copy>{proctorStatus(row)} · {attempt?.answeredCount ?? 0}/50 answered{row.eligible ? "" : " · Historical attempt"}</Copy>
    {attempt && <Copy kind="caption">Last contact: {new Date(attempt.lastSeenAt).toLocaleTimeString()}{attempt.submittedAt ? ` · Submitted ${new Date(attempt.submittedAt).toLocaleTimeString()} · ${attempt.correctCount ?? 0}/50` : ""}</Copy>}
    {!attempt?.retakeReady && attempt?.state === "PAUSED" && <Card style={{ backgroundColor: colors.warningSoft }}>
      <Copy style={{ fontWeight: "600" }}>Proctor clearance required</Copy>
      {pause && <Activity event={pause} />}
      <Copy kind="caption">{view.sheet?.state !== "OPEN" ? "Exam closed." : attempt.stale ? "Waiting for contact: student must reconnect." : attempt.pageVisible === false ? "Waiting for return: exam screen is hidden." : "Student connected. Review before unlocking."}</Copy>
      {manage ? <Button label="Unlock student" disabled={busy || !canUnlockStudent(view, row)} onPress={unlock} />
        : <Copy kind="caption">A Servants Prep servant must unlock this student.</Copy>}
    </Card>}
    {attempt?.stale && attempt.state !== "SUBMITTED" && !attempt.retakeReady && <Copy color={colors.warning}>No contact for more than 30 seconds.</Copy>}
    <Disclosure title={`Activity history (${attempt?.events.length ?? 0})`}>
      {attempt?.events.map(event => <Activity key={event.id} event={event} />)}
    </Disclosure>
  </>;
}
function Activity({ event }: { event: ExamActivity }) {
  return <View style={{ gap: 2, paddingVertical: 4 }}><Copy kind="caption">{examActivityMessage(event.kind, event).title}</Copy><Copy kind="caption">{new Date(event.createdAt).toLocaleString()}</Copy></View>;
}
function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <Card><Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} onPress={() => setOpen(value => !value)} style={{ minHeight: 44, justifyContent: "center" }}><Copy style={{ fontWeight: "600" }}>{open ? "▾" : "▸"} {title}</Copy></Pressable>{open && children}</Card>;
}
