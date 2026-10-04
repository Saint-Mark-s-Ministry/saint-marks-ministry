import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Copy, ListSurface, styles } from "@/components/ui";
import { Field, Page, useAction } from "@/components/forms";
import { request, useResource } from "@/data/resources";
import { useAppTheme } from "@/theme";

type Exam = {
  id: string;
  examDate: string;
  totalPoints: number;
  yearLevel: string;
  examSection: { displayName: string } | null;
};
type ExamScore = { id: string; studentId: string; score: number };
type Enrollment = { studentId: string; isActive: boolean; student: { id: string; name: string } };

export default function PrepExamScores() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const exam = useResource<Exam[]>("/api/exams");
  const scores = useResource<ExamScore[]>(`/api/exams/${encodeURIComponent(id)}/scores`);
  const enrollments = useResource<Enrollment[]>("/api/enrollments?status=ACTIVE&isActive=true");
  const thisExam = exam.data?.find((e) => e.id === id);

  const rows = (enrollments.data ?? []).map((e) => ({
    student: e.student,
    existing: scores.data?.find((s) => s.studentId === e.studentId),
  }));
  const entered = rows.filter((r) => r.existing).length;

  return (
    <Page
      title={thisExam?.examSection?.displayName ?? "Exam scores"}
      loading={enrollments.loading || scores.loading}
      error={enrollments.error || scores.error}
      refresh={() => {
        void scores.refresh();
        void enrollments.refresh();
      }}
    >
      {thisExam && (
        <Copy kind="caption">
          Total points {thisExam.totalPoints} · {entered} of {rows.length} entered
        </Copy>
      )}
      <ListSurface>
        {rows.map((row, index) => (
          <ScoreRow
            key={row.student.id}
            examId={id}
            totalPoints={thisExam?.totalPoints ?? 100}
            studentId={row.student.id}
            studentName={row.student.name}
            existing={row.existing}
            divider={index < rows.length - 1}
            onSaved={() => void scores.refresh()}
          />
        ))}
      </ListSurface>
      <Copy kind="caption">Scores save when you leave the field.</Copy>
    </Page>
  );
}

function ScoreRow({
  examId,
  totalPoints,
  studentId,
  studentName,
  existing,
  divider,
  onSaved,
}: {
  examId: string;
  totalPoints: number;
  studentId: string;
  studentName: string;
  existing?: ExamScore;
  divider: boolean;
  onSaved: () => void;
}) {
  const { colors } = useAppTheme();
  const [value, setValue] = useState(existing?.score != null ? String(existing.score) : "");
  const action = useAction();

  const save = () => {
    const parsed = Number(value);
    if (!value.trim() || Number.isNaN(parsed)) return;
    void action.run(async () => {
      if (existing) {
        await request(`/api/exam-scores/${encodeURIComponent(existing.id)}`, "PATCH", { score: parsed });
      } else {
        await request(`/api/exams/${encodeURIComponent(examId)}/scores`, "POST", { studentId, score: parsed });
      }
      onSaved();
    });
  };

  return (
    <View
      style={[
        styles.compactRow,
        divider && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Copy style={{ fontWeight: "600" }}>{studentName}</Copy>
        <Copy kind="caption">{existing ? `${existing.score}%` : "Not entered"}</Copy>
      </View>
      <View style={{ width: 90 }}>
        <Field
          label=""
          value={value}
          onChange={setValue}
          keyboardType="numeric"
          disabled={action.busy}
          placeholder={`/ ${totalPoints}`}
          {...{ onBlur: save }}
        />
      </View>
    </View>
  );
}
