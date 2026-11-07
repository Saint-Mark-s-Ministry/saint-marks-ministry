import { useEffect, useState } from "react";
import { Modal, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import type { DigitalExamView } from "@stmark/contracts";
import { Card, Copy, Screen, SectionTitle } from "@/components/ui";
import { Field, ResourceState, confirmAction } from "@/components/forms";
import { ExamActionButton } from "@/components/exam-action-button";
import { Activity, Configuration, Disclosure, StudentDetails, StudentTileButton } from "@/components/exam-monitor-parts";
import { useAuth } from "@/data/auth-provider";
import { useLiveResource } from "@/data/use-live-exam";
import { useProctorAlerts } from "@/data/use-proctor-alerts";
import { useExamRealtime, REALTIME_SETTINGS } from "@/data/use-exam-realtime";
import { useExamStaffActions } from "@/data/use-exam-staff-actions";
import { examCalendarDate, digitalExamPath, liveExamAudience, proctorStatus } from "@/data/live-exams";
import { examControls, filterRoster, resultLine, rosterSummary, sheetStateLabel, sortRoster, unlockHeadline } from "@/data/exam-monitor";
import { pollInterval, shouldSubscribe, statusLine } from "@/data/exam-realtime";
import { useAppTheme } from "@/theme";

export default function ExamMonitor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  if (!id || liveExamAudience(user?.role) !== "staff") return <Screen><Copy>Exam Monitoring is for Servants Prep servants and priests.</Copy></Screen>;
  return <Monitor key={id} id={id} />;
}

function Monitor({ id }: { id: string }) {
  const { user, viewingAs } = useAuth();
  const { colors } = useAppTheme();
  // The poll interval follows the live channel: a slower backup while it is connected, every 2 seconds otherwise.
  const [pollMs, setPollMs] = useState(2000);
  const resource = useLiveResource<DigitalExamView>(digitalExamPath(id), pollMs);
  const view = resource.data;
  const manage = view?.canManage === true && !viewingAs;
  const realtime = useExamRealtime(
    id,
    shouldSubscribe({
      audience: liveExamAudience(user?.role), manage, viewingAs: !!viewingAs,
      realtimeConfigured: view?.realtimeConfigured, hasSheet: !!view?.sheet, settings: REALTIME_SETTINGS,
    }),
    () => void resource.reload(),
  );
  useEffect(() => setPollMs(pollInterval(realtime)), [realtime]);
  const alerts = useProctorAlerts(id, view);
  const actions = useExamStaffActions(id, resource.reload, manage);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [configuring, setConfiguring] = useState(false);
  const sheet = view?.sheet;
  const controls = examControls(view, manage);
  const roster = view?.roster ?? [];
  const summary = view ? rosterSummary(view, roster) : null;
  const headline = summary ? unlockHeadline(summary) : null;
  const selected = roster.find((row) => row.student.id === selectedId);
  const now = Date.now();
  const savedAnswers = roster.flatMap((row) => row.attempt?.events.filter((event) => event.kind === "ANSWER_SAVED").map((event) => ({ event, name: row.student.name })) ?? [])
    .sort((a, b) => b.event.createdAt.localeCompare(a.event.createdAt) || b.event.id.localeCompare(a.event.id)).slice(0, 8);

  return <>
    <Stack.Screen options={{ title: view?.exam.examSection.displayName ?? "Exam Monitoring", headerLargeTitle: false }} />
    <Screen onRefresh={() => void resource.refresh()} refreshing={resource.refreshing}>
      <ResourceState loading={resource.loading} error={resource.error} retry={() => void resource.refresh()} />
      {!!resource.error && <Copy>Monitoring is unavailable. Student status shown earlier is out of date, so controls are off. Saved answers and pauses remain on the server.</Copy>}
      {view && <>
        <Copy kind="caption">{examCalendarDate(view.exam.examDate)} · {view.exam.academicYear.name} · {sheetStateLabel(view)}</Copy>
        {!manage && <Copy kind="caption">{viewingAs ? "View as is read-only, so opening, closing and unlocking are off." : "Monitoring is read-only for your account."}</Copy>}

        {!!headline && <Card style={{ backgroundColor: colors.dangerSoft, borderColor: colors.danger, borderWidth: 2 }}>
          <View accessibilityLiveRegion="polite" accessible accessibilityLabel={`Needs attention. ${headline}`}>
            <Copy style={{ fontWeight: "700" }} color={colors.danger}>Needs attention</Copy>
            <Copy color={colors.danger}>{headline}</Copy>
          </View>
        </Card>}

        {controls.configure && <Card>
          <Copy kind="heading">Set up the original exam</Copy>
          <Copy kind="caption">Printed questions · 50 equally weighted answers · makeup exams stay on paper. The key and choices lock when the exam first opens.</Copy>
          <ExamActionButton secondary label={configuring ? "Hide answer key setup" : "Configure answer sheet"} disabled={actions.busy} onPress={() => setConfiguring((value) => !value)} />
          {configuring && <Configuration key={`${sheet?.choiceCounts.join("")}:${view.answerKey?.join("")}`} view={view} busy={actions.busy}
            save={(choiceCounts, answerKey) => void actions.run({ action: "configure", choiceCounts, answerKey }, () => setConfiguring(false))} />}
        </Card>}

        {manage && sheet && (controls.ready || controls.open || controls.close || controls.release || controls.reset) && <Card>
          <Copy kind="heading">Exam controls</Copy>
          {controls.open && <ExamActionButton label="Open exam" disabled={actions.busy}
            onPress={() => confirmAction("Open this exam?", sheet.openedAt
              ? "Eligible students who have not submitted can begin. A submitted student can answer again only with an approved individual retake."
              : "All eligible students who have not submitted can begin. The answer key and choice counts lock on first opening.", () => void actions.run({ action: "open" }))} />}
          {controls.close && <ExamActionButton secondary label="Close exam" disabled={actions.busy}
            onPress={() => confirmAction("Close and finalize this exam?", "All started attempts, including paused ones, are submitted using saved answers. Blank answers count as incorrect, and answers not yet saved on a student's phone cannot be included. Submitted attempts stay final unless you approve an individual retake.", () => void actions.run({ action: "close" }), true)} />}
          {controls.release && <ExamActionButton label="Release results" disabled={actions.busy}
            onPress={() => confirmAction("Release exam results?", "Grades become visible to students and feed existing exam averages. A retake keeps the higher score and a lower one never reduces a grade. If a grade already exists for a student, the server stops and changes nothing.", () => void actions.run({ action: "release" }))} />}
          {controls.ready && <ExamActionButton secondary label="Set ready to open" disabled={actions.busy}
            onPress={() => confirmAction("Set ready to open?", "The sheet is hidden from students until you open it again. The locked key and choices, grades, submissions and retake approvals are preserved. Close started attempts first.", () => void actions.run({ action: "ready" }))} />}
          {controls.reset && <ExamActionButton secondary label="Reset test opening" disabled={actions.busy}
            onPress={() => confirmAction("Reset this test opening?", "Returns the sheet to draft and hides it from students. The answer key and every saved grade are preserved. Reset is refused once any student has joined.", () => void actions.run({ action: "reset" }))} />}
        </Card>}
        {!manage && !sheet && <Copy>A Servants Prep servant has not configured an answer sheet yet.</Copy>}

        {sheet && summary && <>
          <Card>
            <Copy kind="heading">Live monitoring</Copy>
            <Copy accessibilityLabel={`${summary.started} of ${summary.eligible} started, ${summary.paused} paused, ${summary.submitted} submitted`}>
              {summary.started}/{summary.eligible} started · {summary.paused} paused · {summary.submitted} submitted
            </Copy>
            <Copy kind="caption" color={realtime === "live" ? colors.success : undefined}>{statusLine(realtime, !!view.realtimeConfigured)}</Copy>
            <Copy kind="caption">Activity flags support proctor review; they do not establish cheating.</Copy>
            {sheet.releasedAt && <Copy kind="caption" color={colors.success}>Results released {new Date(sheet.releasedAt).toLocaleString()}</Copy>}
            <ExamActionButton secondary label={alerts.sound ? "Mute alert sound" : "Enable alert sound"} onPress={() => void alerts.toggleSound()} />
            <Copy kind="caption">{alerts.sound ? "Plays one short clip for a new interruption, at most every 8 seconds. It follows your iPhone's volume, silent switch and Focus." : "Off. Turning it on plays a short clip on this device when a student is interrupted. Students' devices never play sounds."}</Copy>
            {!!alerts.soundError && <Copy kind="caption" color={colors.warning}>{alerts.soundError}</Copy>}
          </Card>
          <SectionTitle title={`Students · ${roster.length}`} subtitle="Students who need an unlock come first. Select one for connection details, saved answers, unlocking and history." />
          <Field label="Find a student" value={search} onChange={setSearch} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {filterRoster(sortRoster(view, roster), search).map((row) =>
              <StudentTileButton key={row.student.id} view={view} row={row} now={now} onPress={() => setSelectedId(row.student.id)} />)}
          </View>
          {!roster.length && <Copy kind="caption">No eligible students are waiting for this exam.</Copy>}
          {!!roster.length && !filterRoster(roster, search).length && <Copy kind="caption">No student matches “{search.trim()}”.</Copy>}
          {!!alerts.alerts.length && <Card style={{ backgroundColor: colors.warningSoft }}>
            <Copy kind="heading">Recent alerts</Copy>
            {alerts.alerts.map((item) => {
              const current = roster.find((row) => row.student.id === item.studentId);
              return <View key={item.event.id} style={{ gap: 3 }}>
                <Copy style={{ fontWeight: "600" }}>{item.name} · {current ? proctorStatus(current) : "Not on the current roster"}</Copy>
                <Activity event={item.event} />
              </View>;
            })}
            <ExamActionButton secondary label="Dismiss alerts" onPress={alerts.dismiss} />
          </Card>}

          <Disclosure title="Recent saved answers">
            {!savedAnswers.length && <Copy kind="caption">No answer changes have been saved yet.</Copy>}
            {savedAnswers.map((item) => <View key={item.event.id} style={{ gap: 3 }}><Copy style={{ fontWeight: "600" }}>{item.name}</Copy><Activity event={item.event} /></View>)}
          </Disclosure>
        </>}

        {controls.retakes && <Disclosure title={`Individual retakes (${view.retakeCandidates?.length ?? 0})`}>
          <Copy kind="caption">Approving a retake archives the previous answers, history and grade, and gives that student a new blank sheet. Open the exam, then close it and release results: only a higher score replaces the grade.</Copy>
          {view.retakeCandidates?.map((student) => <View key={student.id} style={{ gap: 6 }}>
            <Copy>{student.name}</Copy>
            <ExamActionButton secondary label={`Allow retake for ${student.name}`} disabled={actions.busy}
              onPress={() => confirmAction(`Allow ${student.name} to retake?`, "The previous attempt and grade are preserved. A paper makeup is unchanged.", () => void actions.run({ action: "retake", studentId: student.id }))} />
          </View>)}
        </Disclosure>}

        {!!view.completedHistory?.length && <Disclosure title={`Past digital activity (${view.completedHistory.length})`}>
          {view.completedHistory.map((history) => <Disclosure key={`${history.student.id}:${history.attemptNumber}`} title={`${history.student.name} · Attempt ${history.attemptNumber ?? 1}`}>
            {!!history.snapshot && !!resultLine(history.snapshot) && <Copy>{resultLine(history.snapshot)}</Copy>}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{history.snapshot?.answers?.map((answer, question) => <Copy key={question} kind="caption" style={{ minWidth: 56 }}>{question + 1}: {answer || "Blank"}</Copy>)}</View>
            {history.events.map((event) => <Activity key={event.id} event={event} />)}
          </Disclosure>)}
        </Disclosure>}

        {!!selected && <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedId(null)}>
          <Screen>
            <ExamActionButton secondary label="Close student details" onPress={() => setSelectedId(null)} />
            <Copy kind="heading">{selected.student.name}</Copy>
            <StudentDetails view={view} row={selected} busy={actions.busy} manage={manage} now={now}
              unlock={() => selected.attempt && confirmAction(`Unlock ${selected.student.name}?`, "Only unlock after you have reviewed the interruption. The student can then keep answering.", () => void actions.run({ action: "unlock", attemptId: selected.attempt!.id }))} />
          </Screen>
        </Modal>}
      </>}
    </Screen>
  </>;
}
