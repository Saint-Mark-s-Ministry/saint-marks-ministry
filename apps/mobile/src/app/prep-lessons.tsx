import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { Copy, ListSurface, Screen, StatusPill } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { useAuth } from "@/data/auth-provider";
import { useResource } from "@/data/resources";
import { serifDisplay, useAppTheme } from "@/theme";
import {
  attendanceLabel,
  canViewOwnLessons,
  formatLessonWhen,
  isNewMaterial,
  lessonsForTab,
  savedLabel,
  searchLessons,
  summary,
  type StudentLesson,
} from "@/data/prep-lessons";

const TABS = ["upcoming", "completed", "all"] as const;
const OFFLINE = "Could not reach the server. Check your connection and try again.";
const NOT_ENROLLED = "Student not enrolled";

export default function PrepLessons() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = canViewOwnLessons(user?.role);
  // Own lessons only: the id comes from the signed-in user, never from the route.
  const path = canView && user?.id ? `/api/students/${encodeURIComponent(user.id)}/lessons?includeCancelled=true` : null;
  const lessons = useResource<StudentLesson[]>(path);

  const [tabIndex, setTabIndex] = useState(0);
  const [query, setQuery] = useState("");
  const tab = TABS[tabIndex];
  const now = new Date();
  const all = lessons.data ?? [];
  const rows = useMemo(() => searchLessons(lessonsForTab(all, tab, now), query), [all, tab, query]);
  const totals = summary(all);
  const offline = lessons.error === OFFLINE;
  const notEnrolled = lessons.error === NOT_ENROLLED;

  return (
    <>
      <Stack.Screen options={{ title: "My lessons" }} />
      <Stack.SearchBar
        autoCapitalize="none"
        placement="automatic"
        placeholder="Search lessons or speakers"
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
        onCancelButtonPress={() => setQuery("")}
      />
      <Screen refreshing={lessons.loading || lessons.refreshing} onRefresh={() => void lessons.refresh()}>
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>This page is for students.</Copy>
          </View>
        )}

        {canView && notEnrolled && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>You're not enrolled yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>Lessons appear once you're enrolled in Servants Prep.</Copy>
          </View>
        )}

        {canView && !notEnrolled && (
          <>
            <View style={{ paddingHorizontal: 4, gap: 2 }}>
              <Copy style={{ fontFamily: serifDisplay, fontSize: 34, lineHeight: 36, fontWeight: "500" }}>My lessons</Copy>
              <Copy kind="caption">Lessons, resources and attendance</Copy>
            </View>

            {lessons.stale && (
              <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}>
                <Copy style={{ fontWeight: "600" }} color={colors.warning}>
                  {offline ? "You're offline" : "Couldn't refresh"} · showing saved lessons
                </Copy>
                <Copy kind="caption">{lessons.updatedAt ? savedLabel(lessons.updatedAt, now) : "Saved earlier"}. Pull down to refresh.</Copy>
              </View>
            )}

            {!lessons.stale && (
              <ResourceState loading={lessons.loading} error={lessons.error} retry={() => void lessons.refresh()} />
            )}

            {lessons.data && (
              <>
                <SegmentedControl
                  values={["Upcoming", "Completed", "All"]}
                  selectedIndex={tabIndex}
                  onChange={({ nativeEvent }) => setTabIndex(nativeEvent.selectedSegmentIndex)}
                  style={{ width: "100%", minHeight: 36 }}
                />

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Tile label="Total lessons" value={String(totals.total)} caption={`${totals.completed} completed`} />
                  <Tile
                    label="Attended"
                    value={totals.counted ? `${totals.attended} / ${totals.counted}` : "—"}
                    caption="lessons with attendance"
                    tone={totals.counted && totals.attended === totals.counted ? colors.success : undefined}
                  />
                </View>

                {!rows.length && (
                  <View style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}>
                    <Copy kind="heading">{all.length ? (query ? "No lessons match" : "Nothing here yet") : "No lessons yet"}</Copy>
                    {!all.length && <Copy kind="caption">Your lessons will show up here once they're scheduled.</Copy>}
                  </View>
                )}

                {!!rows.length && (
                  <ListSurface>
                    {rows.map((lesson, index) => (
                      <LessonRow key={lesson.id} lesson={lesson} now={now} last={index === rows.length - 1} />
                    ))}
                  </ListSurface>
                )}

                <Copy kind="caption">Expected absences and lessons before you joined are not counted against you.</Copy>
              </>
            )}
          </>
        )}
      </Screen>
    </>
  );
}

function Tile({ label, value, caption, tone }: { label: string; value: string; caption: string; tone?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 22, padding: 14, gap: 6, borderWidth: 0.5, borderColor: colors.border }}>
      <Copy kind="caption" style={{ fontWeight: "500" }}>{label}</Copy>
      <Copy style={{ fontSize: 28, fontWeight: "600", fontVariant: ["tabular-nums"], color: tone }}>{value}</Copy>
      <Copy kind="caption">{caption}</Copy>
    </View>
  );
}

function LessonRow({ lesson, now, last }: { lesson: StudentLesson; now: Date; last: boolean }) {
  const { colors } = useAppTheme();
  const label = attendanceLabel(lesson, now);
  const cancelled = lesson.status === "CANCELLED";
  const tone = cancelled ? colors.danger : label === "Present" ? colors.success : label === "Absent" ? colors.danger : label === "Late" || label === "Not recorded" ? colors.warning : colors.muted;
  const soft = cancelled ? colors.dangerSoft : label === "Present" ? colors.successSoft : label === "Absent" ? colors.dangerSoft : label === "Late" || label === "Not recorded" ? colors.warningSoft : colors.hover;
  const newCount = lesson.resources.filter((r) => isNewMaterial(r, now)).length;
  const headline = `Lesson ${lesson.lessonNumber}${lesson.title ? ` · ${lesson.title}` : ""}`;
  const subline = [formatLessonWhen(lesson.scheduledDate), lesson.speaker].filter(Boolean).join(" · ");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${headline}, ${subline}, ${label}`}
      onPress={() => router.push({ pathname: "/prep-my-lesson/[id]", params: { id: lesson.id } })}
      style={({ pressed }) => [
        { minHeight: 64, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: pressed ? colors.hover : "transparent" },
        !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Copy style={{ fontWeight: "500" }} numberOfLines={1}>{headline}</Copy>
        <Copy kind="caption" numberOfLines={1}>{subline}</Copy>
        {cancelled && lesson.cancellationReason && <Copy kind="caption" color={colors.danger} numberOfLines={2}>Cancelled: {lesson.cancellationReason}</Copy>}
        {!!lesson.resources.length && (
          <Copy kind="caption">
            {lesson.resources.length} {lesson.resources.length === 1 ? "resource" : "resources"}
            {newCount ? ` · ${newCount} new` : ""}
          </Copy>
        )}
      </View>
      <StatusPill label={label} color={tone} soft={soft} />
    </Pressable>
  );
}
