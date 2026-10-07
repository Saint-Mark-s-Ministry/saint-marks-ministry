import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import type { SundaySchoolWeeklyLessonsResponse } from "@stmark/contracts";
import {
  CalendarDate,
  Copy,
  Icon,
  ListSurface,
  Screen,
  SectionTitle,
  StatusPill,
  styles,
} from "@/components/ui";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { ResourceState } from "@/components/forms";
import { endpoint, query, useResource } from "@/data/resources";
import { usePortal } from "@/data/portal-provider";
import { useAuth } from "@/data/auth-provider";
import { savedLabel } from "@/data/prep-lessons";
import {
  OWNERSHIP_LABEL,
  SCHEDULE_LABEL,
  localDateKey,
  lessonSubtitle,
  lessonTitle,
  missingSummary,
  missingSummaryLabel,
  readiness,
  scheduleLessons,
  type LessonOwnership,
  type LessonSchedule,
} from "@/data/sunday-school-lessons";
import { MinistryTintProvider, serifDisplay, useAppTheme } from "@/theme";

const OFFLINE = "Could not reach the server. Check your connection and try again.";
const SCHEDULES: LessonSchedule[] = ["upcoming", "past"];
const OWNERSHIPS: LessonOwnership[] = ["everyone", "mine"];

export default function Lessons() {
  return (
    <MinistryTintProvider ministry="sundaySchool">
      <LessonsScreen />
    </MinistryTintProvider>
  );
}

function LessonsScreen() {
  const { colors } = useAppTheme();
  const { classes } = usePortal();
  const { user } = useAuth();
  const [classId, setClassId] = useState(classes.length === 1 ? classes[0].id : "");
  const [schedule, setSchedule] = useState<LessonSchedule>("upcoming");
  const [ownership, setOwnership] = useState<LessonOwnership>("everyone");
  const resource = useResource<SundaySchoolWeeklyLessonsResponse>(
    `${endpoint("lessons")}?${query({ scope: "year", classId })}`,
  );

  const all = resource.data?.lessons ?? [];
  const today = localDateKey(new Date());
  const lessons = scheduleLessons(all, schedule, today, ownership, user?.id);
  // Only upcoming lessons can still be fixed, so the banner counts those alone.
  const missing = missingSummaryLabel(missingSummary(scheduleLessons(all, "upcoming", today)));
  const primaryClass = classes.find((c) => c.id === classId);
  const offline = resource.error === OFFLINE;

  const classActions: MenuAction[] = [
    { id: "", title: "All classes", state: classId === "" ? "on" : "off" },
    ...classes.map((c) => ({ id: c.id, title: c.name, state: classId === c.id ? "on" : "off" }) as MenuAction),
  ];
  const ownershipActions: MenuAction[] = OWNERSHIPS.map((value) => ({
    id: value,
    title: OWNERSHIP_LABEL[value],
    state: ownership === value ? "on" : "off",
  }) as MenuAction);

  return (
    <>
      {/* The serif heading in the body carries the title, so the native large title stays off. */}
      <Stack.Screen
        options={{
          title: "",
          headerLargeTitle: false,
          headerLeft: () => <MinistrySwitcherHeaderLeft ministry="sundaySchool" />,
          headerRight: Platform.OS === "ios" ? undefined : () => <TopActions />,
        }}
      />
      {Platform.OS === "ios" && <TopActions />}
      <Screen
        resetOnFocus
        refreshing={resource.loading || resource.refreshing}
        onRefresh={() => void resource.refresh()}
      >
        <View style={{ paddingHorizontal: 4, gap: 2 }}>
          <Copy style={{ fontFamily: serifDisplay, fontSize: 34, lineHeight: 36, fontWeight: "500" }}>Lessons</Copy>
          <Copy kind="caption">Assign each Sunday and share resources</Copy>
        </View>

        {/* One or two classes get the artboard's two-way segmented control. More than
            that becomes a menu chip, because a segmented control stops being usable. */}
        {classes.length > 0 && classes.length <= 2 && (
          <SegmentedControl
            values={[...classes.map((c) => c.name), "All classes"]}
            selectedIndex={classId ? classes.findIndex((c) => c.id === classId) : classes.length}
            onChange={({ nativeEvent }) =>
              setClassId(nativeEvent.selectedSegmentIndex < classes.length ? classes[nativeEvent.selectedSegmentIndex].id : "")
            }
            style={{ width: "100%", minHeight: 36 }}
          />
        )}

        <SegmentedControl
          values={SCHEDULES.map((value) => SCHEDULE_LABEL[value])}
          selectedIndex={SCHEDULES.indexOf(schedule)}
          onChange={({ nativeEvent }) => setSchedule(SCHEDULES[nativeEvent.selectedSegmentIndex])}
          style={{ width: "100%", minHeight: 36 }}
        />

        <View style={[styles.row, { gap: 10, flexWrap: "wrap" }]}>
          {classes.length > 2 && (
            <MenuView title="Class" actions={classActions} onPressAction={({ nativeEvent }) => setClassId(nativeEvent.event)}>
              <FilterChip label={primaryClass?.name ?? "All classes"} />
            </MenuView>
          )}
          <MenuView
            title="Lessons"
            actions={ownershipActions}
            onPressAction={({ nativeEvent }) => setOwnership(nativeEvent.event as LessonOwnership)}
          >
            <FilterChip label={OWNERSHIP_LABEL[ownership]} />
          </MenuView>
        </View>

        {offline && resource.stale && (
          <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.warning}>You're offline</Copy>
            <Copy kind="caption">{savedLabel(resource.updatedAt, new Date())}. Pull down to try again.</Copy>
          </View>
        )}
        {!resource.stale && (
          <ResourceState loading={resource.loading} error={offline ? undefined : resource.error} retry={() => void resource.refresh()} />
        )}

        {resource.data && !!missing && schedule === "upcoming" && (
          <View style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.warning}>{missing}</Copy>
            <Copy kind="caption">Open a lesson to add its links or name a teacher.</Copy>
          </View>
        )}

        {resource.data && !lessons.length && (
          <View style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}>
            <Copy kind="heading">{all.length ? "No lessons in this selection" : "No lessons yet"}</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>
              {all.length
                ? "Try another schedule, class, or the All lessons filter."
                : "Weekly lessons appear here once your class has a Sunday in this school year."}
            </Copy>
          </View>
        )}

        {!!lessons.length && (
          <View style={{ gap: 10 }}>
            <SectionTitle
              title={schedule === "past" ? "Past lessons" : "Upcoming"}
              subtitle={`${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"}`}
            />
            <ListSurface>
              {lessons.map((lesson, index) => {
                const state = readiness(lesson.status);
                const pill = {
                  ready: { color: colors.success, soft: colors.successSoft },
                  needsLinks: { color: colors.warning, soft: colors.warningSoft },
                  unassigned: { color: colors.muted, soft: colors.hover },
                }[state.tone];
                // Repeating the class name on every row only earns its keep when rows
                // span multiple classes ("All classes"); otherwise it just crowds out
                // the title and link names for no new information.
                const subtitle = classId ? lessonSubtitle(lesson) : [lesson.class.name, lessonSubtitle(lesson)].filter(Boolean).join(" · ");
                return (
                  <Pressable
                    key={lesson.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${lessonTitle(lesson)}, ${lesson.class.name}, ${state.label}`}
                    onPress={() =>
                      router.push({ pathname: "/lesson/[id]", params: { id: lesson.id, classId: lesson.classId } })
                    }
                    style={({ pressed }) => [
                      { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10, minHeight: 70 },
                      index < lessons.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                      { backgroundColor: pressed ? colors.primarySoft : "transparent" },
                    ]}
                  >
                    <CalendarDate date={lesson.sundayDate} />
                    <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                      <Copy numberOfLines={1} style={{ fontWeight: "500" }}>{lessonTitle(lesson)}</Copy>
                      <Copy kind="caption" numberOfLines={1}>{subtitle}</Copy>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <StatusPill label={state.label} color={pill.color} soft={pill.soft} />
                      <Icon ios="chevron.right" android="chevron_right" size={14} color={colors.muted} />
                    </View>
                  </Pressable>
                );
              })}
            </ListSurface>
          </View>
        )}
      </Screen>
    </>
  );
}

function FilterChip({ label }: { label: string }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: pressed ? colors.hover : colors.surface, borderWidth: 1, borderColor: colors.border, minHeight: 36 },
      ]}
    >
      <Copy kind="caption" style={{ fontWeight: "600" }}>{label}</Copy>
      <Icon ios="chevron.up.chevron.down" android="unfold_more" size={12} color={colors.muted} />
    </Pressable>
  );
}
