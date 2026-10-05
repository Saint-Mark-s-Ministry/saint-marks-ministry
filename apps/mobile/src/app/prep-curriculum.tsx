import { useState } from "react";
import { Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import { Copy, Icon, ListSurface, Screen, StatusPill, styles } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";
import { isAdminLike } from "@/data/prep-home";
import {
  canManageCurriculum,
  filterLessonsBySection,
  lessonBadge,
  nextLessonId,
  searchLessons,
  sectionsInUse,
  speakerSuggestions,
  type LessonListItem,
} from "@/data/prep-curriculum";
import { LessonFormSheet } from "@/components/lesson-form-sheet";

type AcademicYear = { id: string; name: string; isActive: boolean };

export default function PrepCurriculum() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = isAdminLike(user?.role);
  const canManage = canManageCurriculum(user?.role);

  const [sectionId, setSectionId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const years = useResource<AcademicYear[]>(canView ? "/api/academic-years" : null);
  const lessonsRes = useResource<LessonListItem[]>(canView ? "/api/lessons" : null);
  const activeYear = years.data?.find((y) => y.isActive) ?? years.data?.[0];

  const offline = lessonsRes.error === "Could not reach the server. Check your connection and try again.";
  const all = [...(lessonsRes.data ?? [])].sort((a, b) => a.lessonNumber - b.lessonNumber);
  const today = new Date().toISOString().slice(0, 10);
  const nextId = nextLessonId(all, today);
  const completed = all.filter((l) => l.status === "COMPLETED").length;
  const sections = sectionsInUse(all);
  const filtered = searchLessons(filterLessonsBySection(all, sectionId), query);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Curriculum",
          headerRight: canManage
            ? () => (
                <Pressable accessibilityRole="button" accessibilityLabel="Add new lesson" hitSlop={8} onPress={() => setCreating(true)} style={{ padding: 6 }}>
                  <Icon ios="plus" android="add" size={20} color={colors.primary} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <Stack.SearchBar
        autoCapitalize="none"
        placement="automatic"
        placeholder="Search topics, speakers"
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
        onCancelButtonPress={() => setQuery("")}
      />
      <Screen refreshing={lessonsRes.loading} onRefresh={() => { void years.refresh(); void lessonsRes.refresh(); }}>
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>Curriculum is for Servants Prep administrators.</Copy>
          </View>
        )}

        {canView && (
          <>
            <Copy kind="caption">
              {activeYear?.name ?? "—"} · {all.length} {all.length === 1 ? "lesson" : "lessons"} · {completed} completed
            </Copy>

            {offline && (
              <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.dangerSoft, gap: 6 }}>
                <Copy style={{ fontWeight: "600" }} color={colors.danger}>You're offline</Copy>
                <Copy kind="caption">Showing the last data we had. Pull down to try again once you're back online.</Copy>
              </View>
            )}
            <ResourceState loading={lessonsRes.loading} error={offline ? undefined : lessonsRes.error} retry={() => { void years.refresh(); void lessonsRes.refresh(); }} />

            {!!sections.length && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <FilterChip label="All sections" active={sectionId === null} onPress={() => setSectionId(null)} />
                {sections.map((s) => (
                  <FilterChip key={s.id} label={s.displayName} active={sectionId === s.id} onPress={() => setSectionId(s.id)} />
                ))}
              </View>
            )}

            {lessonsRes.data && !filtered.length && (
              <View style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}>
                <Copy kind="heading">{all.length ? "No lessons match" : "No lessons yet"}</Copy>
                {canManage && !all.length && <Copy kind="caption">Add the first one to get started.</Copy>}
              </View>
            )}

            {!!filtered.length && (
              <ListSurface>
                {filtered.map((lesson, index) => {
                  const badge = lessonBadge(lesson, nextId);
                  const tone = badge === "Done" ? colors.success : badge === "Next" ? colors.primary : badge === "Exam" ? colors.info : colors.text2;
                  const soft = badge === "Done" ? colors.successSoft : badge === "Next" ? colors.primarySoft : badge === "Exam" ? colors.infoSoft : colors.hover;
                  return (
                    <Pressable
                      key={lesson.id}
                      accessibilityRole="button"
                      onPress={() => router.push({ pathname: "/prep-lesson/[id]", params: { id: lesson.id } })}
                      style={({ pressed }) => [
                        styles.compactRow,
                        index < filtered.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                        { backgroundColor: pressed ? colors.primarySoft : "transparent" },
                      ]}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: soft }}>
                        {lesson.isExamDay ? (
                          <Icon ios="graduationcap" android="school" size={18} color={tone} />
                        ) : (
                          <Copy style={{ fontWeight: "600", fontSize: 15 }} color={tone}>{lesson.lessonNumber}</Copy>
                        )}
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Copy numberOfLines={1} style={{ fontWeight: "500" }}>{lesson.title || "[Topic title]"}</Copy>
                        <Copy kind="caption" numberOfLines={1}>
                          {new Date(lesson.scheduledDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          {lesson.speaker ? ` · ${lesson.speaker}` : ""}
                        </Copy>
                      </View>
                      {badge && <StatusPill label={badge} color={tone} soft={soft} />}
                      <Icon ios="chevron.right" android="chevron_right" size={14} color={colors.muted} />
                    </Pressable>
                  );
                })}
              </ListSurface>
            )}
          </>
        )}
      </Screen>

      {creating && (
        <LessonFormSheet
          initial={{
            title: "",
            subtitle: "",
            examSectionId: "",
            scheduledDate: new Date(),
            speaker: "",
            isExamDay: false,
            description: "",
          }}
          speakerSuggestions={speakerSuggestions(all)}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            void lessonsRes.refresh();
            router.push({ pathname: "/prep-lesson/[id]", params: { id } });
          }}
        />
      )}
    </>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        height: 32,
        paddingHorizontal: 14,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active ? colors.surface : colors.hover,
      }}
    >
      <Copy style={{ fontSize: 14, fontWeight: active ? "600" : "500" }}>{label}</Copy>
    </Pressable>
  );
}
