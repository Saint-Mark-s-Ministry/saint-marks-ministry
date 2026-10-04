import { Platform, View } from "react-native";
import { router, Stack } from "expo-router";
import { Button, Card, CompactRow, Copy, ListSurface, Screen, SectionTitle, styles } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { useAppTheme } from "@/theme";
import { useResource } from "@/data/resources";

type LessonListItem = {
  id: string;
  title: string | null;
  scheduledDate: string;
  isExamDay?: boolean;
  examSection?: { displayName: string } | null;
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function PrepCalendar() {
  const { colors } = useAppTheme();
  const resource = useResource<LessonListItem[]>("/api/lessons");
  const lessons = resource.data ?? [];

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
  const byDate = new Map<string, LessonListItem[]>();
  for (const lesson of lessons) {
    const key = lesson.scheduledDate.slice(0, 10);
    byDate.set(key, [...(byDate.get(key) ?? []), lesson]);
  }

  const today = now.toISOString().slice(0, 10);
  const upcoming = lessons
    .filter((l) => l.scheduledDate.slice(0, 10) >= today)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
    .slice(0, 6);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Calendar",
          headerLeft: () => <MinistrySwitcherHeaderLeft ministry="prep" />,
          headerRight: Platform.OS === "ios" ? undefined : () => <TopActions />,
        }}
      />
      {Platform.OS === "ios" && <TopActions />}
      <Screen resetOnFocus refreshing={resource.loading} onRefresh={() => void resource.refresh()}>
        <ResourceState loading={resource.loading} error={resource.error} retry={() => void resource.refresh()} />
        <Copy kind="title">
          {monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </Copy>
        <Card style={{ padding: 14, gap: 10 }}>
          <View style={{ flexDirection: "row" }}>
            {WEEKDAYS.map((label, i) => (
              <View key={i} style={{ flex: 1, alignItems: "center" }}>
                <Copy kind="caption">{label}</Copy>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {days.map((day) => {
              const key = day.toISOString().slice(0, 10);
              const inMonth = day.getMonth() === monthStart.getMonth();
              const isToday = key === today;
              const hasEvent = byDate.has(key);
              return (
                <View key={key} style={{ width: `${100 / 7}%`, alignItems: "center", paddingVertical: 6, gap: 3 }}>
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isToday ? colors.primary : "transparent",
                    }}
                  >
                    <Copy
                      kind="caption"
                      color={isToday ? colors.onAction : inMonth ? undefined : colors.muted}
                    >
                      {day.getDate()}
                    </Copy>
                  </View>
                  <View
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: hasEvent ? colors.primary : "transparent",
                    }}
                  />
                </View>
              );
            })}
          </View>
        </Card>

        <View style={{ gap: 10 }}>
          <SectionTitle title="Upcoming" />
          <ListSurface>
            {!upcoming.length && (
              <View style={{ paddingVertical: 18 }}>
                <Copy kind="caption">No upcoming lessons.</Copy>
              </View>
            )}
            {upcoming.map((lesson, index) => (
              <CompactRow
                key={lesson.id}
                divider={index < upcoming.length - 1}
                title={lesson.isExamDay ? "Exam day" : lesson.title || "Lesson"}
                subtitle={`${new Date(lesson.scheduledDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}${lesson.examSection ? ` · ${lesson.examSection.displayName}` : ""}`}
                onPress={() => router.push("/prep-curriculum")}
              />
            ))}
          </ListSurface>
          {!!upcoming.length && !upcoming[0].isExamDay && (
            <Button label="Take attendance" onPress={() => router.push("/prep-attendance")} />
          )}
        </View>
      </Screen>
    </>
  );
}
