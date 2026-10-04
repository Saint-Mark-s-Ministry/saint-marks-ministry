import { useLocalSearchParams } from "expo-router";
import { Linking, View } from "react-native";
import { Card, Copy, RowLink, styles } from "@/components/ui";
import { Page } from "@/components/forms";
import { useResource } from "@/data/resources";
import { useAppTheme } from "@/theme";

type LessonDetail = {
  id: string;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  speaker: string | null;
  scheduledDate: string;
  status: string;
  lessonNumber: number;
  examSection: { displayName: string } | null;
  resources: { id: string; title: string; url: string; type: string | null }[];
};

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_CLASS: "No class",
};

export default function PrepLessonDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const resource = useResource<LessonDetail[]>("/api/lessons");
  const lesson = resource.data?.find((l) => l.id === id);

  return (
    <Page
      title={lesson ? `Lesson ${lesson.lessonNumber}` : "Lesson"}
      loading={resource.loading}
      error={resource.error}
      refresh={() => void resource.refresh()}
    >
      {lesson && (
        <>
          <View style={[styles.row, { gap: 8 }]}>
            <View style={[styles.pill, { backgroundColor: colors.hover }]}>
              <Copy kind="caption">Lesson {lesson.lessonNumber}</Copy>
            </View>
            {lesson.examSection && (
              <View style={[styles.pill, { backgroundColor: colors.hover }]}>
                <Copy kind="caption">{lesson.examSection.displayName}</Copy>
              </View>
            )}
          </View>
          <Copy kind="title">{lesson.title || "[Topic title]"}</Copy>
          {!!lesson.subtitle && <Copy kind="caption">{lesson.subtitle}</Copy>}

          <Card>
            <Copy kind="caption">Date</Copy>
            <Copy>
              {new Date(lesson.scheduledDate).toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}{" "}
              ·{" "}
              {new Date(lesson.scheduledDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </Copy>
            {!!lesson.speaker && (
              <>
                <Copy kind="caption">Speaker</Copy>
                <Copy>{lesson.speaker}</Copy>
              </>
            )}
            <Copy kind="caption">Status</Copy>
            <Copy>{STATUS_LABEL[lesson.status] ?? lesson.status}</Copy>
          </Card>

          {!!lesson.description && (
            <Card>
              <Copy kind="heading">Description</Copy>
              <Copy>{lesson.description}</Copy>
            </Card>
          )}

          <Copy kind="heading">Resources</Copy>
          {!lesson.resources.length && <Copy kind="caption">No resources attached yet.</Copy>}
          {lesson.resources.map((r) => (
            <Card key={r.id}>
              <RowLink
                title={r.title}
                subtitle={r.url}
                onPress={() => {
                  void Linking.openURL(r.url).catch(() => undefined);
                }}
              />
            </Card>
          ))}
        </>
      )}
    </Page>
  );
}
