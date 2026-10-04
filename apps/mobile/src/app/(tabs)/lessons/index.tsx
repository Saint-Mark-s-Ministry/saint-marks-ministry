import { useState } from "react";
import { Platform, View } from "react-native";
import { router, Stack } from "expo-router";
import type { SundaySchoolWeeklyLessonsResponse } from "@stmark/contracts";
import {
  CalendarDate,
  CompactRow,
  Copy,
  Icon,
  ListSurface,
  Screen,
  SectionTitle,
  styles,
} from "@/components/ui";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { Choice, ResourceState } from "@/components/forms";
import { endpoint, query, useResource } from "@/data/resources";
import { usePortal } from "@/data/portal-provider";
import { useAuth } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";

const scheduleOptions = [
  { value: "upcoming", label: "Upcoming" },
  { value: "mine", label: "My lessons" },
  { value: "past", label: "Past lessons" },
  { value: "all", label: "Full academic year" },
];

export default function Lessons() {
  const { colors } = useAppTheme();
  const { classes } = usePortal();
  const { user } = useAuth();
  const [selectedClassId, setSelectedClassId] = useState("");
  const [view, setView] = useState("upcoming");
  const onlyClass = classes.length === 1 ? classes[0] : undefined;
  const classId = onlyClass?.id ?? selectedClassId;
  const resource = useResource<SundaySchoolWeeklyLessonsResponse>(
    `${endpoint("lessons")}?${query({ scope: "year", classId })}`,
  );
  const today = new Date().toISOString().slice(0, 10);
  const lessons = (resource.data?.lessons ?? []).filter((lesson) => {
    if (view === "all") return true;
    if (view === "mine") return lesson.ownerId === user?.id;
    if (view === "past") return lesson.sundayDate.slice(0, 10) < today;
    return lesson.sundayDate.slice(0, 10) >= today;
  });
  if (view === "past") lessons.reverse();

  return (
    <>
      <Stack.Screen
        options={{
          title: "Weekly lessons",
          headerLargeTitle: false,
          headerLeft: () => <MinistrySwitcherHeaderLeft ministry="sundaySchool" />,
          headerRight:
            Platform.OS === "ios" ? undefined : () => <TopActions />,
        }}
      />
      {Platform.OS === "ios" && <TopActions />}
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            width: "100%",
            maxWidth: 720,
            alignSelf: "center",
            paddingHorizontal: 22,
            paddingTop: 16,
            gap: 12,
          }}
        >
          <Choice
            label="Schedule"
            value={view}
            onChange={setView}
            options={scheduleOptions}
          />
          {onlyClass ? (
            <View style={[styles.row, { gap: 8, paddingHorizontal: 4 }]}>
              <Icon
                ios="person.2"
                android="groups"
                size={16}
                color={colors.muted}
              />
              <Copy kind="caption">Showing {onlyClass.name}</Copy>
            </View>
          ) : classes.length > 1 ? (
            <Choice
              label="Class"
              value={selectedClassId}
              onChange={setSelectedClassId}
              options={[
                { value: "", label: "All accessible classes" },
                ...classes.map((schoolClass) => ({
                  value: schoolClass.id,
                  label: schoolClass.name,
                })),
              ]}
            />
          ) : null}
        </View>
        <Screen
          resetOnFocus
          refreshing={resource.loading || resource.refreshing}
          onRefresh={() => void resource.refresh()}
        >
          <ResourceState
            loading={resource.loading}
            error={resource.error}
            retry={() => void resource.refresh()}
          />
          {resource.data && !lessons.length && (
            <ListSurface>
              <View style={{ paddingVertical: 18 }}>
                <Copy kind="caption">No lessons in this selection.</Copy>
              </View>
            </ListSurface>
          )}
          {!!lessons.length && (
            <View style={{ gap: 10 }}>
              <SectionTitle
                title={
                  view === "mine"
                    ? "My lessons"
                    : view === "past"
                      ? "Past lessons"
                      : view === "all"
                        ? "Academic year"
                        : "Upcoming"
                }
                subtitle={`${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"}`}
              />
              <ListSurface>
                {lessons.map((lesson, index) => (
                  <CompactRow
                    key={lesson.id}
                    divider={index < lessons.length - 1}
                    title={lesson.title || "Weekly lesson"}
                    subtitle={`${lesson.class.name} · ${lesson.owner?.name ?? "Unassigned"}`}
                    icon={<CalendarDate date={lesson.sundayDate} />}
                    trailing={<LessonStatus status={lesson.status} />}
                    onPress={() =>
                      router.push({
                        pathname: "/lesson/[id]",
                        params: { id: lesson.id, classId: lesson.classId },
                      })
                    }
                  />
                ))}
              </ListSurface>
            </View>
          )}
        </Screen>
      </View>
    </>
  );
}

function LessonStatus({
  status,
}: {
  status: "UNASSIGNED" | "NEEDS_LINKS" | "READY";
}) {
  const { colors } = useAppTheme();
  const ready = status === "READY";
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: ready ? colors.successSoft : colors.warningSoft },
      ]}
    >
      <Copy kind="caption" color={ready ? colors.success : colors.warning}>
        {ready ? "Ready" : status === "UNASSIGNED" ? "Unassigned" : "Needs links"}
      </Copy>
    </View>
  );
}
