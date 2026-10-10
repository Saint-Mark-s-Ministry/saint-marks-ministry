import { Platform, View } from "react-native";
import { router, Stack } from "expo-router";
import { CalendarDate, CompactRow, Copy, ListSurface, Screen, SectionTitle } from "@/components/ui";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { attendanceKey, meetingDate, usePortal } from "@/data/portal-provider";
import { useAppTheme } from "@/theme";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function Calendar() {
  const { colors } = useAppTheme();
  const { classes, lessons, attendance, loading, refresh } = usePortal();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  const lessonDates = new Set(lessons.map((l) => l.sundayDate.slice(0, 10)));
  const meetingDates = new Set(classes.map((c) => meetingDate(c)));
  const today = now.toISOString().slice(0, 10);

  const pending = classes.filter((c) => c.canServe && !attendance[attendanceKey(c.id, meetingDate(c))]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Calendar",
          headerLeft: () => <MinistrySwitcherHeaderLeft ministry="sundaySchool" />,
          headerRight: Platform.OS === "ios" ? undefined : () => <TopActions />,
        }}
      />
      {Platform.OS === "ios" && <TopActions />}
      <Screen resetOnFocus refreshing={loading} onRefresh={() => void refresh()}>
        <Copy kind="title">{monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</Copy>
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: 14, gap: 10 }}>
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
              const hasLesson = lessonDates.has(key);
              const needsAttendance = meetingDates.has(key) && key <= today;
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
                    <Copy kind="caption" color={isToday ? colors.onAction : inMonth ? undefined : colors.muted}>
                      {day.getDate()}
                    </Copy>
                  </View>
                  <View
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: needsAttendance ? colors.warning : hasLesson ? colors.primary : "transparent",
                    }}
                  />
                </View>
              );
            })}
          </View>
        </View>

        {!!pending.length && (
          <View style={{ gap: 10 }}>
            <SectionTitle title="Attendance due" />
            <ListSurface>
              {pending.map((c, index) => (
                <CompactRow
                  key={c.id}
                  divider={index < pending.length - 1}
                  title={c.name}
                  subtitle={`Week of ${meetingDate(c)}`}
                  onPress={() => router.push({ pathname: "/attendance/[classId]", params: { classId: c.id } })}
                />
              ))}
            </ListSurface>
          </View>
        )}

        <View style={{ gap: 10 }}>
          <SectionTitle title="Upcoming lessons" />
          <ListSurface>
            {!loading && !lessons.length && (
              <View style={{ paddingVertical: 18 }}>
                <Copy kind="caption">No upcoming lessons.</Copy>
              </View>
            )}
            {lessons.slice(0, 6).map((lesson, index) => (
              <CompactRow
                key={lesson.id}
                divider={index < Math.min(lessons.length, 6) - 1}
                title={lesson.title ?? "Weekly lesson"}
                subtitle={lesson.class.name}
                icon={<CalendarDate date={lesson.sundayDate} />}
                onPress={() =>
                  router.push({ pathname: "/lesson/[id]", params: { id: lesson.id, classId: lesson.classId } })
                }
              />
            ))}
          </ListSurface>
          <CompactRow
            title="All lessons"
            subtitle="Browse and assign lessons by class"
            onPress={() => router.push("/lessons")}
          />
        </View>
      </Screen>
    </>
  );
}
