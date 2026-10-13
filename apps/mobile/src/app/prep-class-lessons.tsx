import { useCallback, useEffect } from "react";
import { AppState, Linking, Pressable, View } from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import { Button, Copy, Icon, ListSurface, Screen, SectionTitle, StatusPill } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { useAuth } from "@/data/auth-provider";
import { useResource } from "@/data/resources";
import { savedLabel } from "@/data/prep-lessons";
import {
  classHeading,
  classLessonsView,
  isOpenableUrl,
  lessonLabel,
  lessonStatusLabel,
  lessonTitle,
  viewMessage,
  viewTitle,
  type ClassLessonsResponse,
} from "@/data/class-lessons";
import { canViewOwnRotation } from "@/data/rotation-forms";
import { useAppTheme, serifCard } from "@/theme";

const OFFLINE = "Could not reach the server. Check your connection and try again.";
const REVALIDATE_MS = 15_000;

/**
 * Upcoming lessons, slides and resources for the student's assigned class,
 * from GET /api/sunday-school/lessons. The class comes from the response, never
 * from a grade, and it is shown even when there are no upcoming lessons.
 * Read-only: serving in a class grants no roster, homework, attendance,
 * lesson-editing or staffing powers.
 */
export default function PrepClassLessons() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = canViewOwnRotation(user?.role);
  const isAsync = !!user?.isAsyncStudent;
  const resource = useResource<ClassLessonsResponse>(canView ? "/api/sunday-school/lessons" : null);
  const refresh = resource.refresh;

  // Returning to the screen refetches (not just when the cache is old), and a
  // reviewer's approval can change the class while the app is open: refresh on
  // foreground and on a short timer too.
  useFocusEffect(
    useCallback(() => {
      if (canView) void refresh();
    }, [canView, refresh]),
  );
  useEffect(() => {
    if (!canView) return;
    const interval = setInterval(() => {
      if (AppState.currentState === "active") void refresh();
    }, REVALIDATE_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [canView, refresh]);

  const now = new Date();
  const offline = resource.error === OFFLINE;
  const view = resource.data ? classLessonsView(resource.data, isAsync) : null;
  const classes = view && "classes" in view ? view.classes : [];
  const title = view ? viewTitle(view) : null;
  const message = view ? viewMessage(view) : null;

  return (
    <>
      <Stack.Screen options={{ title: "Class lessons" }} />
      <Screen refreshing={resource.loading || resource.refreshing} onRefresh={() => void resource.refresh()}>
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>This page is for students.</Copy>
          </View>
        )}

        {canView && (
          <>
            <View style={{ paddingHorizontal: 4, gap: 2 }}>
              <Copy kind="caption">Upcoming Sunday School slides and resources for your class</Copy>
            </View>

            {resource.stale && (
              <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}>
                <Copy style={{ fontWeight: "600" }} color={colors.warning}>
                  {offline ? "You're offline" : "Couldn't refresh"} · showing saved lessons
                </Copy>
                <Copy kind="caption">
                  {resource.updatedAt ? savedLabel(resource.updatedAt, now) : "Saved earlier"}. Pull down to refresh.
                </Copy>
              </View>
            )}

            {/* A failed request is retryable and never reads as "no class assigned". */}
            {!resource.stale && (
              <ResourceState loading={resource.loading} error={resource.error} retry={() => void resource.refresh()} />
            )}

            {classes.length > 0 && (
              <View style={{ gap: 10 }}>
                <SectionTitle title={classHeading(isAsync)} />
                <ListSurface>
                  {classes.map((cls, index) => (
                    <View
                      key={cls.id}
                      accessible
                      accessibilityLabel={`${classHeading(isAsync)}: ${cls.name}`}
                      style={[
                        { paddingHorizontal: 16, paddingVertical: 14, minHeight: 52, justifyContent: "center" },
                        index < classes.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                      ]}
                    >
                      <Copy style={{ fontSize: 17, fontWeight: "600" }}>{cls.name}</Copy>
                    </View>
                  ))}
                </ListSurface>
              </View>
            )}

            {view && title && (
              <ListSurface style={{ padding: 16, gap: 6 }}>
                <Copy style={{ fontWeight: "600" }}>{title}</Copy>
                {message && <Copy kind="caption">{message}</Copy>}
              </ListSurface>
            )}

            {view?.kind === "lessons" &&
              view.lessons.map((lesson) => {
                const status = lessonStatusLabel(lesson.status);
                return (
                  <ListSurface key={lesson.id} style={{ padding: 16, gap: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <Copy kind="caption" style={{ flex: 1 }}>{lessonLabel(lesson)}</Copy>
                      <StatusPill
                        label={status.label}
                        color={status.ready ? colors.success : colors.warning}
                        soft={status.ready ? colors.successSoft : colors.warningSoft}
                      />
                    </View>
                    <Copy style={{ ...serifCard, }}>
                      {lessonTitle(lesson)}
                    </Copy>
                    {lesson.resources.length === 0 ? (
                      <Copy kind="caption">Links have not been added yet.</Copy>
                    ) : (
                      <View style={{ gap: 6 }}>
                        {lesson.resources.map((resource) =>
                          isOpenableUrl(resource.url) ? (
                            <Pressable
                              key={resource.id}
                              accessibilityRole="link"
                              accessibilityLabel={`${resource.title}, opens link`}
                              onPress={() => void Linking.openURL(resource.url).catch(() => undefined)}
                              style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 }}
                            >
                              <Icon ios="link" android="link" size={18} color={colors.primary} />
                              <Copy color={colors.primary} style={{ flex: 1 }}>{resource.title}</Copy>
                            </Pressable>
                          ) : (
                            <View key={resource.id} style={{ minHeight: 44, justifyContent: "center" }}>
                              <Copy kind="caption">{resource.title}</Copy>
                            </View>
                          ),
                        )}
                      </View>
                    )}
                  </ListSurface>
                );
              })}
          </>
        )}
      </Screen>
    </>
  );
}
