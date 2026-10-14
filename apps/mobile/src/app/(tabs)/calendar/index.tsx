import { useMemo, useRef, useState } from "react";
import { PanResponder, Platform, Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { Copy, Icon, ListSurface, Screen, styles } from "@/components/ui";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { CalendarEventRow, DayDots } from "@/components/calendar-parts";
import { useAppTheme } from "@/theme";
import { feedback } from "@/data/haptics";
import {
  addDays,
  addMonths,
  dayDots,
  formatLongDay,
  formatShortDay,
  formatWeekRange,
  monthGrid,
  monthParts,
  sameMonth,
  startOfMonth,
  todayKey,
  weekOf,
  type CalendarEvent,
  type DateKey,
} from "@/data/calendar";
import { useCalendarEvents } from "@/data/use-calendar-events";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MODES = ["month", "week", "list"] as const;
type Mode = (typeof MODES)[number];

export default function Calendar() {
  const { colors } = useAppTheme();
  const today = todayKey();
  const [mode, setMode] = useState<Mode>("week");
  const [selected, setSelected] = useState<DateKey>(today);
  const [visibleMonth, setVisibleMonth] = useState<DateKey>(startOfMonth(today));

  const grid = useMemo(() => monthGrid(visibleMonth), [visibleMonth]);
  const week = useMemo(() => weekOf(selected), [selected]);
  const { eventsOn, liturgical, loading, refresh } = useCalendarEvents(mode === "week" ? week : grid);

  const { month, year } = monthParts(mode === "week" ? selected : visibleMonth);

  const openDay = (day: DateKey) => router.push({ pathname: "/calendar-day", params: { date: day } });
  const selectDay = (day: DateKey) => {
    // Tapping the day that is already selected opens it, as in Apple Calendar.
    if (day === selected) {
      openDay(day);
      return;
    }
    feedback("selection"); setSelected(day);
    if (!sameMonth(day, visibleMonth)) setVisibleMonth(startOfMonth(day));
  };
  const goToday = () => {
    if (selected !== today || !sameMonth(visibleMonth, today)) feedback("selection");
    setSelected(today);
    setVisibleMonth(startOfMonth(today));
  };
  const shift = (direction: -1 | 1) => {
    feedback("selection");
    if (mode === "week") {
      const next = addDays(selected, direction * 7);
      setSelected(next);
      setVisibleMonth(startOfMonth(next));
      return;
    }
    const next = addMonths(visibleMonth, direction);
    setVisibleMonth(next);
    setSelected(sameMonth(next, today) ? today : next);
  };

  // Swipe the grid sideways to change month, like the system calendar.
  const shiftRef = useRef(shift);
  shiftRef.current = shift;
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dx <= -60) shiftRef.current(1);
        else if (gesture.dx >= 60) shiftRef.current(-1);
      },
    }),
  ).current;

  const listDays = useMemo(() => grid.filter((day) => sameMonth(day, visibleMonth)), [grid, visibleMonth]);
  const showingToday = mode === "week" ? week.includes(today) : sameMonth(visibleMonth, today) && selected === today;
  const nextLabel = mode === "week" ? "Next week" : "Next month";
  const previousLabel = mode === "week" ? "Previous week" : "Previous month";

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
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <View style={[styles.row, { gap: 2 }]}>
            <HeaderIconButton icon="chevron.left" label={previousLabel} onPress={() => shift(-1)} />
            <HeaderIconButton icon="chevron.right" label={nextLabel} onPress={() => shift(1)} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go to today"
            disabled={showingToday}
            onPress={goToday}
            style={({ pressed }) => [
              styles.pill,
              { backgroundColor: colors.hover, opacity: showingToday ? 0.45 : pressed ? 0.7 : 1 },
            ]}
          >
            <Copy kind="caption" style={{ fontWeight: "600" }}>
              Today
            </Copy>
          </Pressable>
        </View>

        <View style={{ gap: 2 }}>
          <Copy kind="title">
            {month}{" "}
            <Copy kind="title" color={colors.muted}>
              {year}
            </Copy>
          </Copy>
          {mode === "week" && <Copy kind="caption">{formatWeekRange(week)}</Copy>}
        </View>

        <SegmentedControl
          values={["Month", "Week", "List"]}
          selectedIndex={MODES.indexOf(mode)}
          onChange={({ nativeEvent }) => setMode(MODES[nativeEvent.selectedSegmentIndex] ?? "month")}
          style={{ width: "100%", minHeight: 36 }}
        />

        {mode === "month" && (
          <View style={{ gap: 6 }} {...swipe.panHandlers}>
            <View style={{ flexDirection: "row" }}>
              {WEEKDAYS.map((label, i) => (
                <View key={i} style={{ flex: 1, alignItems: "center" }}>
                  <Copy kind="caption">{label}</Copy>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {grid.map((day) => (
                <DayCell
                  key={day}
                  day={day}
                  inMonth={sameMonth(day, visibleMonth)}
                  isToday={day === today}
                  isSelected={day === selected}
                  dots={dayDots(eventsOn(day), liturgical[day])}
                  onPress={() => selectDay(day)}
                />
              ))}
            </View>
          </View>
        )}

        {mode === "week" && (
          <View style={{ flexDirection: "row", gap: 2 }}>
            {week.map((day, index) => (
              <WeekCell
                key={day}
                day={day}
                label={WEEKDAYS[index]}
                isToday={day === today}
                isSelected={day === selected}
                dots={dayDots(eventsOn(day), liturgical[day])}
                onPress={() => selectDay(day)}
              />
            ))}
          </View>
        )}

        {mode === "month" && (
          <ListMode days={listDays} today={today} eventsOn={eventsOn} loading={loading} onOpenDay={openDay} />
        )}

        {mode === "week" &&
          week.map((day) => (
            <DayAgenda
              key={day}
              day={day}
              today={today}
              events={eventsOn(day)}
              copticLabel={liturgical[day]?.copticDate?.label}
              fast={liturgical[day]?.fast?.name}
              onOpenDay={() => openDay(day)}
              compact
            />
          ))}

        {mode === "list" && (
          <ListMode days={listDays} today={today} eventsOn={eventsOn} loading={loading} onOpenDay={openDay} />
        )}
      </Screen>
    </>
  );
}

function HeaderIconButton({
  icon,
  label,
  onPress,
}: {
  icon: "chevron.left" | "chevron.right";
  label: string;
  onPress: () => void;
}) {
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

function DayCell({
  day,
  inMonth,
  isToday,
  isSelected,
  dots,
  onPress,
}: {
  day: DateKey;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  dots: ReturnType<typeof dayDots>;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const number = Number(day.slice(8));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`${formatLongDay(day)}${dots.length ? ", has events" : ""}${isToday ? ", today" : ""}`}
      accessibilityHint={isSelected ? "Opens this day" : "Shows this day"}
      onPress={onPress}
      style={{ width: `${100 / 7}%`, alignItems: "center", paddingVertical: 5, gap: 3 }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isToday ? colors.primary : isSelected ? colors.hover : "transparent",
          borderWidth: isSelected && !isToday ? 1.5 : 0,
          borderColor: colors.primary,
        }}
      >
        <Copy
          kind="body"
          style={{ fontWeight: isToday || isSelected ? "600" : "500" }}
          color={isToday ? colors.onAction : inMonth ? undefined : colors.muted}
        >
          {number}
        </Copy>
      </View>
      <DayDots dots={dots} />
    </Pressable>
  );
}

function WeekCell({
  day,
  label,
  isToday,
  isSelected,
  dots,
  onPress,
}: {
  day: DateKey;
  label: string;
  isToday: boolean;
  isSelected: boolean;
  dots: ReturnType<typeof dayDots>;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`${formatLongDay(day)}${dots.length ? ", has events" : ""}${isToday ? ", today" : ""}`}
      onPress={onPress}
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
        {label}
      </Copy>
      <Copy style={{ fontSize: 17, fontWeight: "600" }} color={isToday ? colors.onAction : undefined}>
        {Number(day.slice(8))}
      </Copy>
      <DayDots dots={dots} onPrimary={isToday} />
    </Pressable>
  );
}

function DayAgenda({
  day,
  today,
  events,
  copticLabel,
  fast,
  onOpenDay,
  compact = false,
}: {
  day: DateKey;
  today: DateKey;
  events: CalendarEvent[];
  copticLabel?: string;
  fast?: string;
  onOpenDay: () => void;
  compact?: boolean;
}) {
  const { colors } = useAppTheme();
  const title = day === today ? "Today" : formatLongDay(day);
  const detail = [copticLabel, fast].filter(Boolean).join(" · ");
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${formatLongDay(day)}. Open day`}
        onPress={onOpenDay}
        style={[styles.row, { justifyContent: "space-between", gap: 8 }]}
      >
        <View style={{ flex: 1, gap: 1 }}>
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>{title}</Copy>
          {!!detail && <Copy kind="caption">{detail}</Copy>}
        </View>
        <Icon ios="chevron.right" android="schedule" size={14} color={colors.muted} />
      </Pressable>
      {!events.length && !compact && (
        <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 18 }}>
          <Copy kind="caption">Nothing scheduled.</Copy>
        </View>
      )}
      {!events.length && compact && <Copy kind="caption">Nothing scheduled.</Copy>}
      {!!events.length && (
        <ListSurface>
          {events.map((event, index) => (
            <CalendarEventRow key={event.id} event={event} divider={index < events.length - 1} />
          ))}
        </ListSurface>
      )}
    </View>
  );
}

function ListMode({
  days,
  today,
  eventsOn,
  loading,
  onOpenDay,
}: {
  days: DateKey[];
  today: DateKey;
  eventsOn: (day: DateKey) => CalendarEvent[];
  loading: boolean;
  onOpenDay: (day: DateKey) => void;
}) {
  const { colors } = useAppTheme();
  const busy = days.filter((day) => eventsOn(day).length > 0);
  if (!busy.length) {
    return (
      <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 18 }}>
        <Copy kind="caption">{loading ? "Loading…" : "No events this month."}</Copy>
      </View>
    );
  }
  return (
    <>
      {busy.map((day) => {
        const events = eventsOn(day);
        return (
          <View key={day} style={{ gap: 8 }}>
            <Pressable accessibilityRole="button" onPress={() => onOpenDay(day)}>
              <Copy style={{ fontSize: 17, fontWeight: "600" }}>
                {day === today ? `Today · ${formatShortDay(day)}` : formatLongDay(day)}
              </Copy>
            </Pressable>
            <ListSurface>
              {events.map((event, index) => (
                <CalendarEventRow key={event.id} event={event} divider={index < events.length - 1} />
              ))}
            </ListSurface>
          </View>
        );
      })}
    </>
  );
}
