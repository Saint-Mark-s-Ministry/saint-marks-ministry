import { useState } from "react";
import { Platform, View } from "react-native";
import { router, Stack } from "expo-router";
import type { DigitalExamList } from "@stmark/contracts";
import { Button, Card, Copy, Screen, SectionTitle } from "./ui";
import { Choice, Field, ResourceState } from "./forms";
import { TopActions } from "./top-actions";
import { useAuth } from "@/data/auth-provider";
import { useLiveResource } from "@/data/use-live-exam";
import { examCalendarDate, filterLiveExams, liveExamAudience, MONITORING_LABELS, monitoringState } from "@/data/live-exams";
import { useAppTheme } from "@/theme";

export function LiveExamList({ staff }: { staff: boolean }) {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const allowed = liveExamAudience(user?.role) === (staff ? "staff" : "student");
  const resource = useLiveResource<DigitalExamList>(allowed ? "/api/digital-exams" : null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const exams = resource.data?.exams ?? [];
  const visible = staff ? filterLiveExams(exams, search, filter) : exams;
  return <>
    <Stack.Screen options={{ title: staff ? "Exam Monitoring" : "Live Exam", headerRight: Platform.OS === "ios" ? undefined : () => <TopActions /> }} />
    {Platform.OS === "ios" && <TopActions />}
    <Screen onRefresh={() => void resource.refresh()} refreshing={resource.refreshing}>
      {!allowed ? <Copy>This page is available only to Servants Prep {staff ? "servants and priests" : "students"}.</Copy> : <>
        <Card>
          <Copy kind="heading">{staff ? "Original exam proctoring" : "Your live exams"}</Copy>
          <Copy kind="caption">{staff
            ? "Set up an answer key, open an exam, and monitor student progress and interruptions. Students answer from their printed questions."
            : "Your proctor will open the answer sheet when you may begin. Read the questions on your printed exam and save your answers here."}</Copy>
          <Copy kind="caption">Makeup exams stay on paper. Released grades appear in My Progress.</Copy>
        </Card>
        <ResourceState loading={resource.loading} error={resource.error} retry={() => void resource.refresh()} />
        {staff && <>
          <Field label="Search exams" placeholder="Exam or academic year" value={search} onChange={setSearch} />
          <Choice label="Proctoring status" value={filter} onChange={setFilter} options={[
            { value: "all", label: "All statuses" }, ...Object.entries(MONITORING_LABELS).map(([value, label]) => ({ value, label })),
          ]} />
          {resource.data && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {(["OPEN", "DRAFT", "UNCONFIGURED"] as const).map(state => <View key={state} style={{ flexGrow: 1, gap: 3 }}>
              <Copy kind="heading">{exams.filter(exam => monitoringState(exam) === state).length}</Copy>
              <Copy kind="caption">{MONITORING_LABELS[state]}</Copy>
            </View>)}
          </View>}
        </>}
        {resource.data && <>
          <SectionTitle title={staff ? "Exam dashboards" : "Available answer sheets"} />
          {!visible.length && <Card><Copy>{staff
            ? exams.length ? "No exams match your filters." : "No exams have been created yet."
            : "Your proctor has not opened a live exam yet."}</Copy></Card>}
          {visible.map(exam => {
            const submitted = exam.digitalSheet?.attempts[0]?.state === "SUBMITTED";
            return <Card key={exam.id}>
              <Copy kind="heading">{exam.examSection.displayName}</Copy>
              <Copy kind="caption">{examCalendarDate(exam.examDate)} · {exam.academicYear.name} · {exam.yearLevel === "BOTH" ? "Both years" : exam.yearLevel === "YEAR_1" ? "Year 1" : "Year 2"}</Copy>
              <Copy color={monitoringState(exam) === "OPEN" ? colors.success : colors.muted}>
                {staff ? MONITORING_LABELS[monitoringState(exam)] : submitted ? "Submitted" : "Open"}
              </Copy>
              <Button label={staff ? "Open dashboard" : submitted ? "Submission status" : "Open live exam"} secondary={staff && monitoringState(exam) !== "OPEN"}
                onPress={() => router.push(staff
                  ? { pathname: "/prep-exam-monitor/[id]", params: { id: exam.id } }
                  : { pathname: "/prep-live-exam/[id]", params: { id: exam.id } })} />
            </Card>;
          })}
        </>}
      </>}
    </Screen>
  </>;
}
