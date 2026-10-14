import { Alert, Linking, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Button, Copy, ListSurface, Screen, StatusPill } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { useAuth } from "@/data/auth-provider";
import { useResource } from "@/data/resources";
import { useAppTheme } from "@/theme";
import {
  attendanceLabel,
  canViewOwnLessons,
  formatLessonWhen,
  isNewMaterial,
  resourceKind,
  safeHttpUrl,
  type LessonResource,
  type StudentLesson,
} from "@/data/prep-lessons";

const OFFLINE = "Could not reach the server. Check your connection and try again.";
const OPEN_LABEL = { PDF: "Open PDF", Document: "Open document", Slides: "Open slides", Link: "Open link" } as const;

export default function PrepMyLesson() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = canViewOwnLessons(user?.role);
  // Same request as the list, so the cached copy is reused and the details match what the student tapped.
  const path = canView && user?.id ? `/api/students/${encodeURIComponent(user.id)}/lessons?includeCancelled=true` : null;
  const lessons = useResource<StudentLesson[]>(path);
  const lesson = lessons.data?.find((l) => l.id === id);
  const now = new Date();

  return (
    <>
      <Stack.Screen options={{ title: lesson ? `Lesson ${lesson.lessonNumber}` : "Lesson" }} />
      <Screen refreshing={lessons.loading || lessons.refreshing} onRefresh={() => void lessons.refresh()}>
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>This page is for students.</Copy>
          </View>
        )}

        {canView && !lesson && (
          <ResourceState
            loading={lessons.loading}
            error={lessons.error === OFFLINE ? undefined : lessons.error}
            retry={() => void lessons.refresh()}
            empty={!!lessons.data}
          />
        )}

        {canView && lessons.error === OFFLINE && (
          <View style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.warning}>You're offline · showing saved details</Copy>
            <Copy kind="caption">Pull down to refresh once you're connected.</Copy>
          </View>
        )}

        {canView && lesson && (
          <>
            <View style={{ gap: 6, paddingHorizontal: 4 }}>
              <Copy kind="title" style={{ fontSize: 28, lineHeight: 32 }}>{lesson.title ?? `Lesson ${lesson.lessonNumber}`}</Copy>
              <Copy kind="caption">{formatLessonWhen(lesson.scheduledDate)}</Copy>
              {lesson.speaker && <Copy kind="caption">Speaker: {lesson.speaker}</Copy>}
              <View style={{ alignSelf: "flex-start", marginTop: 4 }}>
                <StatusPill
                  label={attendanceLabel(lesson, now)}
                  color={lesson.status === "CANCELLED" ? colors.danger : colors.muted}
                  soft={lesson.status === "CANCELLED" ? colors.dangerSoft : colors.hover}
                />
              </View>
            </View>

            {lesson.status === "CANCELLED" && (
              <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.dangerSoft, gap: 4 }}>
                <Copy style={{ fontWeight: "600" }} color={colors.danger}>This lesson is cancelled</Copy>
                <Copy kind="caption">{lesson.cancellationReason ?? "No reason was given."}</Copy>
              </View>
            )}

            <View style={{ gap: 10 }}>
              <Copy style={{ fontSize: 17, fontWeight: "600" }}>Materials</Copy>
              {!lesson.resources.length && <Copy kind="caption">No materials have been added yet.</Copy>}
              {!!lesson.resources.length && (
                <ListSurface>
                  {lesson.resources.map((resource, index) => (
                    <MaterialRow key={resource.id} resource={resource} now={now} last={index === lesson.resources.length - 1} />
                  ))}
                </ListSurface>
              )}
            </View>
          </>
        )}
      </Screen>
    </>
  );
}

function MaterialRow({ resource, now, last }: { resource: LessonResource; now: Date; last: boolean }) {
  const { colors } = useAppTheme();
  const kind = resourceKind(resource);
  const fresh = isNewMaterial(resource, now);

  function open() {
    const href = safeHttpUrl(resource.url);
    if (!href) {
      Alert.alert("This link can't be opened", "It isn't a web link the app can open.");
      return;
    }
    // Hands off to the system: PDFs and documents open in the system viewer, links in the browser.
    void Linking.openURL(href).catch(() => Alert.alert("Couldn't open this material", "Try again in a moment."));
  }

  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 64 }, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Copy style={{ fontWeight: "500" }} numberOfLines={2}>{resource.title}</Copy>
        <Copy kind="caption">
          {kind}
          {fresh ? " · New" : ""}
        </Copy>
      </View>
      <View style={{ width: 96 }}>
        <Button label={OPEN_LABEL[kind]} onPress={open} />
      </View>
    </View>
  );
}
