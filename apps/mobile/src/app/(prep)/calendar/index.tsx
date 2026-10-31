import { useState } from "react";
import { Platform, Pressable, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { Button, Copy, Icon, ListSurface, Screen, styles } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { MonthGrid, MonthLegend, type GridChip, type LegendItem } from "@/components/month-grid";
import { isWide } from "@/data/duo-layout";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { useAppTheme } from "@/theme";
import { useAuth } from "@/data/auth-provider";
import { feedback } from "@/data/haptics";
import { useResource } from "@/data/resources";
import { churchToday, readingsRoute } from "@/data/liturgical";
import { useChurchToday, useLiturgicalCalendar } from "@/data/use-liturgical";
import { CalendarSubscribeMenu } from "@/components/liturgical-parts";
import { attendanceProgress, nextLessonIndex } from "@/data/prep-home";
import {
  buildCalendarEvents,
  canManageCalendar,
  dotTypesForDay,
  eventsByDate,
  eventsForMonth,
  hasEventOfType,
  liturgicalEvents,
  localDateKey,
  monthGrid,
  weekStrip,
  withoutFasts,
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
  // Students and mentors see the program's lesson schedule (read-only); only
  // administrators also get exams, attendance progress and "new event".
  const canSee = adminLike || user?.role === "STUDENT" || user?.role === "MENTOR";

  // A wide window (the iPhone Duo fully open) gets the desktop month grid, filling the window.
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = isWide(windowWidth - insets.left - insets.right);
  const [view, setView] = useState<ViewMode>(wide ? "month" : "week");
  const [cursor, setCursor] = useState(() => new Date());
  // Today at the church, moving on at church midnight (not the phone's day).
  const today = useChurchToday();
  const [selectedDate, setSelectedDate] = useState(() => churchToday());

  const stats = useResource<{ activeStudents: number }>(adminLike ? "/api/dashboard/stats" : null);
  const lessons = useResource<LessonForCalendar[]>(canSee ? "/api/lessons" : null);
  const exams = useResource<ExamForCalendar[]>(adminLike ? "/api/exams" : null);

  // Matches api-client.ts's exact message for a failed fetch (no ApiError, meaning the request never reached the server).
  const offline = lessons.error === "Could not reach the server. Check your connection and try again.";
  const loading = canSee && (lessons.loading || (adminLike && exams.loading));

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const grid = monthGrid(monthStart);
  const week = weekStrip(cursor);

  // Feasts and fasts for the month grid, the week, and the next 14 days (best
  // effort: the calendar below never waits on Coptic IO).
  const churchKeys = [
    ...grid.map(localDateKey),
    ...week.map(localDateKey),
    ...Array.from({ length: 14 }, (_, i) => {
      const day = new Date(`${today}T12:00:00Z`);
      day.setUTCDate(day.getUTCDate() + i);
      return day.toISOString().slice(0, 10);
    }),
  ];
  const church = useLiturgicalCalendar(churchKeys);
  const events = [
    ...buildCalendarEvents(lessons.data ?? [], exams.data ?? []),
    ...liturgicalEvents(church.days, churchKeys),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const byDate = eventsByDate(events);

  const upNextIndex = nextLessonIndex(lessons.data ?? [], today);
  const upNext = upNextIndex >= 0 ? lessons.data?.[upNextIndex] : undefined;
  const roster = stats.data?.activeStudents ?? 0;
  const marked = upNext?._count?.attendanceRecords ?? 0;
  const { inProgress } = attendanceProgress(marked, roster);

  const selectedEvents = (byDate.get(selectedDate) ?? []).slice().sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  const agendaEvents = view === "month" ? withoutFasts(eventsForMonth(events, cursor)) : selectedEvents;
  // Upcoming: the program's own events, plus feasts for the next 14 days (not every fast day).
  const horizon = churchKeys[churchKeys.length - 1];
  const upcoming = withoutFasts(events).filter(
    (e) => e.date >= today && (e.type === "lesson" || e.type === "exam" || e.date <= horizon),
  );

  const goToday = () => {
    if (selectedDate !== today || localDateKey(cursor) !== today) feedback("selection");
    setCursor(new Date());
    setSelectedDate(today);
  };
  const shiftMonth = (delta: number) => {
    feedback("selection");
    const next = new Date(cursor);
    if (view === "week") next.setDate(next.getDate() + delta * 7);
    else {
      next.setDate(1);
      next.setMonth(next.getMonth() + delta);
    }
    setCursor(next);
    setSelectedDate(localDateKey(next));
  };
  const selectDate = (key: string) => {
    if (key !== selectedDate) feedback("selection");
    setSelectedDate(key);
  };
  const openEvent = (event: CalendarEvent) => {
    // A feast or fast opens that date's readings, for every role.
    if (event.type === "feast" || event.type === "fast") {
      router.push(readingsRoute(event.date));
      return;
    }
    const id = event.id.replace(/^(lesson|exam)-/, "");
    // A student opens their own lesson page; administrators the management one.
    if (event.type === "lesson") {
      router.push(
        user?.role === "STUDENT"
          ? { pathname: "/prep-my-lesson/[id]", params: { id } }
          : { pathname: "/prep-lesson/[id]", params: { id } },
      );
    } else router.push({ pathname: "/prep-exam/[id]", params: { id } });
  };
  // Mentors can see the schedule but have no lesson page to open.
  const canOpenEvents = adminLike || user?.role === "STUDENT";
  const canOpen = (event: CalendarEvent) => event.type === "feast" || event.type === "fast" || canOpenEvents;

  // The desktop grid's chips and legend, from this calendar's events. A fast is a corner tag, not a chip.
  const palette: Record<CalendarEventType, Pick<GridChip, "tint" | "soft" | "icon">> = {
    lesson: { tint: colors.primary, soft: colors.primarySoft, icon: { ios: "book.closed", android: "menu_book" } },
    exam: { tint: colors.info, soft: colors.infoSoft, icon: { ios: "doc.text", android: "description" } },
    feast: { tint: colors.warning, soft: colors.warningSoft, icon: { ios: "star", android: "star" } },
    fast: { tint: colors.muted, soft: colors.hover, icon: { ios: "leaf", android: "eco" } },
  };
  const chipsOn = (key: string): GridChip[] =>
    withoutFasts(byDate.get(key) ?? []).map((event) => ({
      id: event.id,
      title: event.title,
      spoken: [event.title, event.subtitle].filter(Boolean).join(", "),
      ...palette[event.type],
      onPress: canOpen(event) ? () => openEvent(event) : undefined,
    }));
  const fastOn = (key: string) => (byDate.get(key) ?? []).find((event) => event.type === "fast")?.title;
  const legend: LegendItem[] = (["lesson", "exam", "feast"] as const).map((type) => ({
    key: type,
    label: { lesson: "Lesson", exam: "Exam", feast: "Feast" }[type],
    ...palette[type],
  }));

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
        fullWidth={wide}
        refreshing={lessons.loading || lessons.refreshing}
        onRefresh={() => {
          void stats.refresh();
          void lessons.refresh();
          void exams.refresh();
        }}
      >
        {!canSee && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>
              Nothing to show here yet
            </Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>
              The Servants Prep calendar isn't available for this account.
            </Copy>
          </View>
        )}

        {canSee && offline && (
          <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.dangerSoft, gap: 6 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.danger}>
              You're offline
            </Copy>
            <Copy kind="caption">Showing the last data we had. Pull down to try again once you're back online.</Copy>
          </View>
        )}

        {canSee && (
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
                <HeaderIconButton icon="chevron.left" label={view === "week" ? "Previous week" : "Previous month"} onPress={() => shiftMonth(-1)} />
                <HeaderIconButton icon="chevron.right" label={view === "week" ? "Next week" : "Next month"} onPress={() => shiftMonth(1)} />
              </View>
              <View style={[styles.row, { gap: 8 }]}>
                <CalendarSubscribeMenu />
                <Pressable accessibilityRole="button" onPress={goToday} style={({ pressed }) => [styles.pill, { backgroundColor: colors.hover, opacity: pressed ? 0.7 : 1 }]}>
                  <Copy kind="caption" style={{ fontWeight: "600" }}>
                    Today
                  </Copy>
                </Pressable>
                {adminLike && <HeaderIconButton icon="plus" label="New event" onPress={() => router.push("/prep-curriculum")} />}
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

            {view === "month" && wide && (
              <>
                <MonthGrid
                  days={grid.map(localDateKey)}
                  month={localDateKey(monthStart)}
                  today={today}
                  selected={selectedDate}
                  chipsOn={chipsOn}
                  fastOn={fastOn}
                  onOpenDay={(key) => {
                    selectDate(key);
                    setView("week");
                  }}
                />
                <MonthLegend items={legend} />
              </>
            )}

            {view === "month" && !wide && (
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
                    const dayEvents = byDate.get(key) ?? [];
                    const dots = dotTypesForDay(dayEvents);
                    const feast = hasEventOfType(dayEvents, "feast");
                    const fastDay = hasEventOfType(dayEvents, "fast");
                    return (
                      <Pressable
                        key={key}
                        accessibilityRole="button"
                        accessibilityLabel={`${day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}${dots.length ? ", has events" : ""}${feast ? ", feast" : ""}${fastDay ? ", fast day" : ""}`}
                        onPress={() => selectDate(key)}
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
                          {feast && <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.warning }} />}
                        </View>
                        {/* A fast day is a thin bar, not a dot, so weekly fasts don't read as events. */}
                        <View style={{ width: 14, height: 2, borderRadius: 1, backgroundColor: fastDay ? colors.muted : "transparent" }} />
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
                  const dayEvents = byDate.get(key) ?? [];
                  const dots = dotTypesForDay(dayEvents);
                  const feast = hasEventOfType(dayEvents, "feast");
                  const fastDay = hasEventOfType(dayEvents, "fast");
                  return (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      accessibilityLabel={`${day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}${dots.length ? ", has events" : ""}${feast ? ", feast" : ""}${fastDay ? ", fast day" : ""}`}
                      onPress={() => selectDate(key)}
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
                        {feast && <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: isToday ? colors.onAction : colors.warning }} />}
                      </View>
                      <View style={{ width: 14, height: 2, borderRadius: 1, backgroundColor: fastDay ? (isToday ? colors.onAction : colors.muted) : "transparent" }} />
                    </Pressable>
                  );
                })}
              </View>
            )}

            {view !== "list" && !(view === "month" && wide) && (
              <View style={{ gap: 10 }}>
                <Copy style={{ fontSize: 17, fontWeight: "600" }}>
                  {view === "month"
                    ? monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })
                    : localDateKey(new Date(`${selectedDate}T00:00:00`)) === today
                    ? "Today"
                    : new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </Copy>
                {!agendaEvents.length && (
                  <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 18 }}>
                    <Copy kind="caption">Nothing scheduled.</Copy>
                  </View>
                )}
                {!!agendaEvents.length && (
                  <ListSurface>
                    {agendaEvents.map((event, index) => (
                      <EventRow
                        key={event.id}
                        event={event}
                        showDate={view === "month"}
                        divider={index < agendaEvents.length - 1}
                        onPress={canOpen(event) ? () => openEvent(event) : undefined}
                        showResume={adminLike && !!upNext && event.id === `lesson-${upNext.id}`}
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
                        onPress={canOpen(event) ? () => openEvent(event) : undefined}
                        showResume={adminLike && !!upNext && event.id === `lesson-${upNext.id}`}
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
  onPress?: () => void;
  showResume: boolean;
  inProgress: boolean;
  marked: number;
  roster: number;
  showDate?: boolean;
}) {
  const { colors } = useAppTheme();
  const tint =
    event.type === "lesson" ? colors.primary : event.type === "feast" ? colors.warning : event.type === "fast" ? colors.muted : colors.info;
  const soft =
    event.type === "lesson"
      ? colors.primarySoft
      : event.type === "feast"
        ? colors.warningSoft
        : event.type === "fast"
          ? colors.hover
          : colors.infoSoft;
  const dateLabel = showDate
    ? new Date(`${event.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : null;

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${event.title}, ${event.subtitle}${event.time ? `, ${event.time}` : ""}`}
      disabled={!onPress}
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
            onPress={() =>
              router.push({
                pathname: "/prep-attendance",
                params: { lessonId: event.id.replace(/^lesson-/, "") },
              })
            }
          />
        )}
      </View>
    </Pressable>
  );
}

function EventIcon({ type, tint, soft }: { type: CalendarEventType; tint: string; soft: string }) {
  return (
    <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: soft, marginTop: 2 }}>
      <Icon
        ios={type === "lesson" ? "book.closed" : type === "feast" ? "star" : type === "fast" ? "leaf" : "graduationcap"}
        android="schedule"
        size={17}
        color={tint}
      />
    </View>
  );
}
