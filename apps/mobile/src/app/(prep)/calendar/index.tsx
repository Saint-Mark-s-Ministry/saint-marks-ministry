import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { Button, Copy, Icon, ListSurface, Screen, styles } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { useAppTheme } from "@/theme";
import { useAuth } from "@/data/auth-provider";
import { useResource } from "@/data/resources";
import { attendanceProgress, nextLessonIndex } from "@/data/prep-home";
import {
  buildCalendarEvents,
  canManageCalendar,
  dotTypesForDay,
  eventsByDate,
  localDateKey,
  monthGrid,
  weekStrip,
  type CalendarEvent,
  type CalendarEventType,
  type ExamForCalendar,
  type LessonForCalendar,
} from "@/data/prep-calendar";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
type ViewMode = "month" | "week" | "list";

export default function PrepCalendar() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const adminLike = canManageCalendar(user?.role);

  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const today = localDateKey(new Date());
  const [selectedDate, setSelectedDate] = useState(today);

  const stats = useResource<{ activeStudents: number }>(adminLike ? "/api/dashboard/stats" : null);
  const lessons = useResource<LessonForCalendar[]>(adminLike ? "/api/lessons" : null);
  const exams = useResource<ExamForCalendar[]>(adminLike ? "/api/exams" : null);

  // Matches api-client.ts's exact message for a failed fetch (no ApiError, meaning the request never reached the server).
  const offline = lessons.error === "Could not reach the server. Check your connection and try again.";
  const loading = adminLike && (lessons.loading || exams.loading);

  const events = buildCalendarEvents(lessons.data ?? [], exams.data ?? []);
  const byDate = eventsByDate(events);

  const upNextIndex = nextLessonIndex(lessons.data ?? [], today);
  const upNext = upNextIndex >= 0 ? lessons.data?.[upNextIndex] : undefined;
  const roster = stats.data?.activeStudents ?? 0;
  const marked = upNext?._count?.attendanceRecords ?? 0;
  const { inProgress } = attendanceProgress(marked, roster);

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const grid = monthGrid(monthStart);
  const week = weekStrip(cursor);
  const selectedEvents = (byDate.get(selectedDate) ?? []).slice().sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  const upcoming = events.filter((e) => e.date >= today);

  const goToday = () => {
    setCursor(new Date());
    setSelectedDate(today);
  };
  const shiftMonth = (delta: number) => {
    const next = new Date(cursor);
    next.setMonth(next.getMonth() + delta);
    setCursor(next);
  };
  const openEvent = (event: CalendarEvent) => {
    const id = event.id.replace(/^(lesson|exam)-/, "");
    if (event.type === "lesson") router.push({ pathname: "/prep-lesson/[id]", params: { id } });
    else router.push({ pathname: "/prep-exam/[id]", params: { id } });
  };

  return (
    <>
      <Stack.Screen
        options={{
          // The design source puts the viewed month/year in the page's own large
          // title. Native large titles render as one plain string — they can't
          // mix two text colors, and changing the destination's title to reflect
          // transient in-page browsing state (which month you're looking at) is
          // not how iOS navigation titles are meant to be used. We keep "Calendar"
          // as the stable native title (consistent with every other Prep tab) and
          // show the month/year as an in-content heading instead — a documented,
          // deliberate exception to the design source for the sake of a correct
          // native pattern.
          title: "Calendar",
          headerLeft: () => <MinistrySwitcherHeaderLeft ministry="prep" />,
          headerRight: Platform.OS === "ios" ? undefined : () => <TopActions />,
        }}
      />
      {Platform.OS === "ios" && <TopActions />}
      <Screen
        resetOnFocus
        refreshing={lessons.loading || lessons.refreshing}
        onRefresh={() => {
          void stats.refresh();
          void lessons.refresh();
          void exams.refresh();
        }}
      >
        {!adminLike && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>
              Nothing to show here yet
            </Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>
              The Servants Prep calendar is for administrators. Your own view ships separately.
            </Copy>
          </View>
        )}

        {adminLike && offline && (
          <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.dangerSoft, gap: 6 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.danger}>
              You're offline
            </Copy>
            <Copy kind="caption">Showing the last data we had. Pull down to try again once you're back online.</Copy>
          </View>
        )}

        {adminLike && (
          <>
            <ResourceState
              loading={loading}
              error={offline ? undefined : lessons.error || exams.error}
              retry={() => {
                void stats.refresh();
                void lessons.refresh();
                void exams.refresh();
              }}
            />

            <View style={[styles.row, { justifyContent: "space-between" }]}>
              <View style={[styles.row, { gap: 2 }]}>
                <HeaderIconButton icon="chevron.left" label="Previous month" onPress={() => shiftMonth(-1)} />
                <HeaderIconButton icon="chevron.right" label="Next month" onPress={() => shiftMonth(1)} />
              </View>
              <View style={[styles.row, { gap: 8 }]}>
                <Pressable accessibilityRole="button" onPress={goToday} style={({ pressed }) => [styles.pill, { backgroundColor: colors.hover, opacity: pressed ? 0.7 : 1 }]}>
                  <Copy kind="caption" style={{ fontWeight: "600" }}>
                    Today
                  </Copy>
                </Pressable>
                <HeaderIconButton icon="plus" label="New event" onPress={() => router.push("/prep-curriculum")} />
              </View>
            </View>

            <View style={{ gap: 2 }}>
              <Copy kind="title">
                {monthStart.toLocaleDateString("en-US", { month: "long" })}{" "}
                <Copy kind="title" color={colors.muted}>
                  {monthStart.getFullYear()}
                </Copy>
              </Copy>
            </View>

            <SegmentedControl
              values={["Month", "Week", "List"]}
              selectedIndex={["month", "week", "list"].indexOf(view)}
              onChange={({ nativeEvent }) =>
                setView((["month", "week", "list"] as const)[nativeEvent.selectedSegmentIndex] ?? "month")
              }
              style={{ width: "100%", minHeight: 36 }}
            />

            {view === "month" && (
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: "row" }}>
                  {WEEKDAYS.map((label, i) => (
                    <View key={i} style={{ flex: 1, alignItems: "center" }}>
                      <Copy kind="caption">{label}</Copy>
                    </View>
                  ))}
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {grid.map((day) => {
                    const key = localDateKey(day);
                    const inMonth = day.getMonth() === monthStart.getMonth();
                    const isToday = key === today;
                    const isSelected = key === selectedDate;
                    const dots = dotTypesForDay(byDate.get(key) ?? []);
                    return (
                      <Pressable
                        key={key}
                        accessibilityRole="button"
                        accessibilityLabel={`${day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}${dots.length ? ", has events" : ""}`}
                        onPress={() => setSelectedDate(key)}
                        style={{ width: `${100 / 7}%`, alignItems: "center", paddingVertical: 6, gap: 3 }}
                      >
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: isToday ? colors.primary : isSelected ? colors.hover : "transparent",
                          }}
                        >
                          <Copy
                            kind="body"
                            style={{ fontWeight: isToday ? "700" : "400" }}
                            color={isToday ? colors.onAction : inMonth ? undefined : colors.muted}
                          >
                            {day.getDate()}
                          </Copy>
                        </View>
                        <View style={{ flexDirection: "row", gap: 3, height: 5 }}>
                          {dots.map((type) => (
                            <View
                              key={type}
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: 2.5,
                                backgroundColor: type === "lesson" ? colors.primary : colors.info,
                              }}
                            />
                          ))}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {view === "week" && (
              <View style={{ flexDirection: "row", gap: 2 }}>
                {week.map((day) => {
                  const key = localDateKey(day);
                  const isToday = key === today;
                  const isSelected = key === selectedDate;
                  const dots = dotTypesForDay(byDate.get(key) ?? []);
                  return (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      onPress={() => setSelectedDate(key)}
                      style={{
                        flexGrow: 1,
                        flexBasis: 0,
                        height: 68,
                        borderRadius: 18,
                        backgroundColor: isToday ? colors.primary : isSelected ? colors.hover : "transparent",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 3,
                      }}
                    >
                      <Copy kind="caption" style={{ fontSize: 11, fontWeight: "500" }} color={isToday ? colors.onAction : undefined}>
                        {WEEKDAYS[day.getDay()]}
                      </Copy>
                      <Copy style={{ fontSize: 17, fontWeight: "600" }} color={isToday ? colors.onAction : undefined}>
                        {day.getDate()}
                      </Copy>
                      <View style={{ flexDirection: "row", gap: 3, height: 5 }}>
                        {dots.map((type) => (
                          <View
                            key={type}
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: 2.5,
                              backgroundColor: isToday ? colors.onAction : type === "lesson" ? colors.primary : colors.info,
                            }}
                          />
                        ))}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {view !== "list" && (
              <View style={{ gap: 10 }}>
                <Copy style={{ fontSize: 17, fontWeight: "600" }}>
                  {localDateKey(new Date(`${selectedDate}T00:00:00`)) === today
                    ? "Today"
                    : new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </Copy>
                {!selectedEvents.length && (
                  <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 18 }}>
                    <Copy kind="caption">Nothing scheduled.</Copy>
                  </View>
                )}
                {!!selectedEvents.length && (
                  <ListSurface>
                    {selectedEvents.map((event, index) => (
                      <EventRow
                        key={event.id}
                        event={event}
                        divider={index < selectedEvents.length - 1}
                        onPress={() => openEvent(event)}
                        showResume={!!upNext && event.id === `lesson-${upNext.id}`}
                        inProgress={inProgress}
                        marked={marked}
                        roster={roster}
                      />
                    ))}
                  </ListSurface>
                )}
              </View>
            )}

            {view === "list" && (
              <View style={{ gap: 10 }}>
                <Copy style={{ fontSize: 17, fontWeight: "600" }}>Upcoming</Copy>
                {!upcoming.length && (
                  <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 18 }}>
                    <Copy kind="caption">No upcoming events.</Copy>
                  </View>
                )}
                {!!upcoming.length && (
                  <ListSurface>
                    {upcoming.map((event, index) => (
                      <EventRow
                        key={event.id}
                        event={event}
                        divider={index < upcoming.length - 1}
                        onPress={() => openEvent(event)}
                        showResume={!!upNext && event.id === `lesson-${upNext.id}`}
                        inProgress={inProgress}
                        marked={marked}
                        roster={roster}
                        showDate
                      />
                    ))}
                  </ListSurface>
                )}
              </View>
            )}
          </>
        )}
      </Screen>
    </>
  );
}

function HeaderIconButton({ icon, label, onPress }: { icon: "chevron.left" | "chevron.right" | "plus"; label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? colors.primarySoft : colors.hover,
      })}
    >
      <Icon ios={icon} android="schedule" size={16} color={colors.text} />
    </Pressable>
  );
}

function EventRow({
  event,
  divider,
  onPress,
  showResume,
  inProgress,
  marked,
  roster,
  showDate = false,
}: {
  event: CalendarEvent;
  divider: boolean;
  onPress: () => void;
  showResume: boolean;
  inProgress: boolean;
  marked: number;
  roster: number;
  showDate?: boolean;
}) {
  const { colors } = useAppTheme();
  const tint = event.type === "lesson" ? colors.primary : colors.info;
  const soft = event.type === "lesson" ? colors.primarySoft : colors.infoSoft;
  const dateLabel = showDate
    ? new Date(`${event.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${event.subtitle}${event.time ? `, ${event.time}` : ""}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.compactRow,
        { alignItems: "flex-start" },
        divider && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
        { backgroundColor: pressed ? colors.primarySoft : "transparent" },
      ]}
    >
      <EventIcon type={event.type} tint={tint} soft={soft} />
      <View style={{ flex: 1, gap: 6, paddingVertical: 2 }}>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Copy style={{ fontWeight: "600" }}>{event.title}</Copy>
          <Copy kind="caption">{[dateLabel, event.time].filter(Boolean).join(" · ") || "All day"}</Copy>
        </View>
        <Copy kind="caption">{event.subtitle}</Copy>
        {showResume && (
          <Button
            label={inProgress ? `Resume attendance · ${marked} of ${roster}` : "Take attendance"}
            onPress={() => router.push("/prep-attendance")}
          />
        )}
      </View>
    </Pressable>
  );
}

function EventIcon({ type, tint, soft }: { type: CalendarEventType; tint: string; soft: string }) {
  return (
    <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: soft, marginTop: 2 }}>
      <Icon ios={type === "lesson" ? "book.closed" : "graduationcap"} android="schedule" size={17} color={tint} />
    </View>
  );
}
