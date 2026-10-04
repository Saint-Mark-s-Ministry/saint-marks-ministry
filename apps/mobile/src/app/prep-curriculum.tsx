import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { Copy, ListSurface, styles } from "@/components/ui";
import { Page } from "@/components/forms";
import { useResource } from "@/data/resources";
import { useAppTheme } from "@/theme";

type LessonListItem = {
  id: string;
  title: string | null;
  subtitle: string | null;
  scheduledDate: string;
  status: "SCHEDULED" | "CANCELLED" | "NO_CLASS" | "COMPLETED";
  isExamDay?: boolean;
  lessonNumber: number;
  speaker: string | null;
};

export default function PrepCurriculum() {
  const { colors } = useAppTheme();
  const resource = useResource<LessonListItem[]>("/api/lessons");
  const lessons = [...(resource.data ?? [])].sort((a, b) => a.lessonNumber - b.lessonNumber);
  const today = new Date().toISOString().slice(0, 10);
  const nextId = lessons.find((l) => l.status === "SCHEDULED" && l.scheduledDate.slice(0, 10) >= today)?.id;
  const completed = lessons.filter((l) => l.status === "COMPLETED").length;

  return (
    <Page title="Curriculum" loading={resource.loading} error={resource.error} refresh={() => void resource.refresh()}>
      <Copy kind="caption">
        {lessons.length} lessons · {completed} completed
      </Copy>
      <ListSurface>
        {!lessons.length && resource.data && <Copy>No lessons yet.</Copy>}
        {lessons.map((lesson, index) => {
          const statusLabel = lesson.isExamDay
            ? "Exam"
            : lesson.status === "COMPLETED"
              ? "Done"
              : lesson.id === nextId
                ? "Next"
                : lesson.status === "CANCELLED" || lesson.status === "NO_CLASS"
                  ? lesson.status === "CANCELLED"
                    ? "Cancelled"
                    : "No class"
                  : null;
          const statusColor = lesson.isExamDay
            ? colors.info
            : lesson.status === "COMPLETED"
              ? colors.success
              : lesson.id === nextId
                ? colors.action
                : colors.muted;
          return (
            <Pressable
              key={lesson.id}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.compactRow,
                index < lessons.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                { backgroundColor: pressed ? colors.primarySoft : "transparent" },
              ]}
              onPress={() => router.push({ pathname: "/prep-lesson/[id]", params: { id: lesson.id } })}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.hover,
                }}
              >
                <Copy kind="caption" style={{ fontWeight: "700" }}>
                  {lesson.lessonNumber}
                </Copy>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Copy style={{ fontWeight: "600" }}>{lesson.title || "[Topic title]"}</Copy>
                <Copy kind="caption">
                  {new Date(lesson.scheduledDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {lesson.speaker ? ` · ${lesson.speaker}` : ""}
                </Copy>
              </View>
              {statusLabel && (
                <View style={[styles.pill, { backgroundColor: colors.hover }]}>
                  <Copy kind="caption" color={statusColor}>
                    {statusLabel}
                  </Copy>
                </View>
              )}
            </Pressable>
          );
        })}
      </ListSurface>
    </Page>
  );
}
