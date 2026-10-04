import { router } from "expo-router";
import { Card, Button, Copy } from "@/components/ui";
import { Page } from "@/components/forms";
import { useResource } from "@/data/resources";

type Exam = {
  id: string;
  examDate: string;
  totalPoints: number;
  yearLevel: string;
  examSection: { displayName: string } | null;
  academicYear: { name: string } | null;
  _count: { scores: number };
};

const YEAR_LABELS: Record<string, string> = { YEAR_1: "Year 1", YEAR_2: "Year 2" };

export default function PrepExams() {
  const resource = useResource<Exam[]>("/api/exams");
  const now = new Date();
  const exams = [...(resource.data ?? [])].sort((a, b) => b.examDate.localeCompare(a.examDate));
  const upcoming = exams.filter((e) => new Date(e.examDate) >= now);
  const past = exams.filter((e) => new Date(e.examDate) < now);

  return (
    <Page title="Exams" loading={resource.loading} error={resource.error} refresh={() => void resource.refresh()}>
      <Copy kind="caption">Create exams and enter scores</Copy>

      {!!upcoming.length && (
        <>
          <Copy kind="heading">Upcoming</Copy>
          {upcoming.map((exam) => (
            <Card key={exam.id}>
              <Copy kind="heading">{exam.examSection?.displayName ?? "Exam"} · {YEAR_LABELS[exam.yearLevel] ?? exam.yearLevel}</Copy>
              <Copy kind="caption">
                {new Date(exam.examDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                {" · "}
                {exam._count.scores} scores entered
              </Copy>
              <Button
                label="Enter scores"
                onPress={() => router.push({ pathname: "/prep-exam/[id]", params: { id: exam.id } })}
              />
            </Card>
          ))}
        </>
      )}

      <Copy kind="heading">All exams</Copy>
      {!exams.length && resource.data && <Copy>No exams yet.</Copy>}
      {past.map((exam) => (
        <Card key={exam.id}>
          <Copy kind="heading">{exam.examSection?.displayName ?? "Exam"} · {YEAR_LABELS[exam.yearLevel] ?? exam.yearLevel}</Copy>
          <Copy kind="caption">
            {new Date(exam.examDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            {" · "}
            {exam._count.scores} scores recorded
          </Copy>
          <Button
            secondary
            label="View scores"
            onPress={() => router.push({ pathname: "/prep-exam/[id]", params: { id: exam.id } })}
          />
        </Card>
      ))}
    </Page>
  );
}
