import { Fragment, useRef, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { Copy, Icon } from "@/components/ui";
import { foldX, monthColumns } from "@/data/duo-layout";
import { useDuo } from "@/data/use-duo";
import { formatLongDay, sameMonth, type DateKey } from "@/data/calendar";
import { useAppTheme } from "@/theme";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** One event chip in a day cell, whichever calendar it comes from. */
export type GridChip = {
  id: string;
  title: string;
  /** Read aloud: title and detail. */
  spoken: string;
  tint: string;
  soft: string;
  icon: { ios: React.ComponentProps<typeof Icon>["ios"]; android: React.ComponentProps<typeof Icon>["android"] };
  /** Present when the chip opens something; otherwise it is information only. */
  onPress?: () => void;
};
const MAX_PER_DAY = 3;
const CELL_HEIGHT = 104;

/**
 * The desktop calendar: a Sunday-first month grid where each day carries up to three coloured event chips
 * (icon and title), "+N more", a Today marker and a Fast tag. A chip with a screen opens it; the rest of a
 * day opens the day. On a foldable the columns break at the hinge so no day is drawn across the fold.
 */
export function MonthGrid({
  days,
  month,
  today,
  selected,
  chipsOn,
  fastOn,
  onOpenDay,
}: {
  days: DateKey[];
  /** Any day in the month being shown. */
  month: DateKey;
  today: DateKey;
  selected: DateKey;
  chipsOn: (day: DateKey) => GridChip[];
  /** The fast kept that day, shown as a tag in the corner. */
  fastOn: (day: DateKey) => string | undefined;
  onOpenDay: (day: DateKey) => void;
}) {
  const { colors } = useAppTheme();
  const duo = useDuo();
  const { width: windowWidth } = useWindowDimensions();
  const ref = useRef<View>(null);
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  const measure = () =>
    ref.current?.measureInWindow((x, _y, w) => setBox((previous) => (previous && previous.x === x && previous.w === w ? previous : { x, w })));

  const crease = duo.divisions.find((d) => d.width >= 0);
  const columns = box
    ? monthColumns({ containerLeft: box.x, containerWidth: box.w, fold: foldX(duo, windowWidth), gap: crease?.width ?? 0 })
    : null;
  const widthOf = (index: number) => (columns ? columns.widths[index] : undefined);
  const weeks: DateKey[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const row = (cells: (index: number) => React.ReactNode, key: string, extra?: object) => (
    <View key={key} style={[{ flexDirection: "row" }, extra]}>
      {WEEKDAYS.map((_, index) => (
        <Fragment key={index}>
          {columns && columns.gapAfter === index - 1 && index > 0 && columns.gap > 0 && <View style={{ width: columns.gap }} />}
          <View style={{ width: widthOf(index), flex: columns ? undefined : 1 }}>{cells(index)}</View>
        </Fragment>
      ))}
    </View>
  );

  return (
    <View
      ref={ref}
      onLayout={measure}
      accessibilityLabel="Month calendar"
      style={{ borderWidth: 0.5, borderColor: colors.border, borderRadius: 14, overflow: "hidden", backgroundColor: colors.surface }}
    >
      {row(
        (index) => (
          <View style={{ paddingHorizontal: 8, paddingVertical: 6, backgroundColor: colors.hover, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
            <Copy kind="caption" maxFontSizeMultiplier={1.3} style={{ fontWeight: "600" }}>{WEEKDAYS[index]}</Copy>
          </View>
        ),
        "header",
      )}
      {weeks.map((week, weekIndex) =>
        row(
          (index) => {
            const day = week[index];
            return (
              <DayCell
                key={day}
                day={day}
                inMonth={sameMonth(day, month)}
                isToday={day === today}
                isSelected={day === selected}
                chips={chipsOn(day)}
                fast={fastOn(day)}
                topBorder={weekIndex > 0}
                leftBorder={index > 0 && columns?.gapAfter !== index - 1}
                onOpenDay={() => onOpenDay(day)}
              />
            );
          },
          `week-${weekIndex}`,
        ),
      )}
    </View>
  );
}

function DayCell({
  day,
  inMonth,
  isToday,
  isSelected,
  chips,
  fast,
  topBorder,
  leftBorder,
  onOpenDay,
}: {
  day: DateKey;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  chips: GridChip[];
  fast?: string;
  topBorder: boolean;
  leftBorder: boolean;
  onOpenDay: () => void;
}) {
  const { colors } = useAppTheme();
  const shown = chips.slice(0, MAX_PER_DAY);
  const number = Number(day.slice(8));
  const label = Number(day.slice(8)) === 1 ? new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : String(number);
  return (
    <View
      style={{
        height: CELL_HEIGHT,
        padding: 5,
        gap: 3,
        backgroundColor: isSelected ? colors.primarySoft : "transparent",
        borderTopWidth: topBorder ? 0.5 : 0,
        borderLeftWidth: leftBorder ? 0.5 : 0,
        borderColor: colors.border,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${formatLongDay(day)}${fast ? `, ${fast}` : ""}${chips.length ? `, ${chips.length} ${chips.length === 1 ? "event" : "events"}` : ""}${isToday ? ", today" : ""}. Open day`}
        onPress={onOpenDay}
        style={{ flexDirection: "row", alignItems: "center", gap: 5, minHeight: 22 }}
      >
        {isToday ? (
          <>
            <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary }}>
              <Copy kind="caption" color={colors.onAction} maxFontSizeMultiplier={1.3} style={{ fontWeight: "700" }}>{number}</Copy>
            </View>
            <Copy kind="caption" color={colors.primary} maxFontSizeMultiplier={1.3} style={{ fontWeight: "600", fontSize: 11 }}>Today</Copy>
          </>
        ) : (
          <Copy kind="caption" color={inMonth ? colors.text : colors.muted} maxFontSizeMultiplier={1.3} style={{ fontWeight: "500", fontSize: 12.5 }}>{label}</Copy>
        )}
        {!!fast && (
          <View style={{ marginLeft: "auto", backgroundColor: colors.warningSoft, borderRadius: 4, paddingHorizontal: 4, height: 16, justifyContent: "center" }}>
            <Copy kind="caption" color={colors.warning} maxFontSizeMultiplier={1} style={{ fontSize: 10, fontWeight: "700" }}>Fast</Copy>
          </View>
        )}
      </Pressable>
      {shown.map((chip) => {
        const body = (
          <>
            <Icon ios={chip.icon.ios} android={chip.icon.android} size={11} color={chip.tint} />
            <Copy numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ flex: 1, fontSize: 11.5 }}>{chip.title}</Copy>
          </>
        );
        const style = { height: 22, flexDirection: "row" as const, alignItems: "center" as const, gap: 5, borderRadius: 4, paddingHorizontal: 6, backgroundColor: chip.soft };
        return chip.onPress ? (
          <Pressable key={chip.id} accessibilityRole="button" accessibilityLabel={chip.spoken} onPress={chip.onPress} style={style}>
            {body}
          </Pressable>
        ) : (
          <View key={chip.id} accessible accessibilityLabel={chip.spoken} style={style}>{body}</View>
        );
      })}
      {chips.length > MAX_PER_DAY && (
        <Pressable accessibilityRole="button" accessibilityLabel={`${chips.length - MAX_PER_DAY} more events. Open day`} onPress={onOpenDay} hitSlop={4}>
          <Copy kind="caption" maxFontSizeMultiplier={1.2} style={{ fontSize: 11, paddingLeft: 6 }}>+{chips.length - MAX_PER_DAY} more</Copy>
        </Pressable>
      )}
    </View>
  );
}

export type LegendItem = { key: string; label: string; tint: string; soft: string; icon: GridChip["icon"] };

/** What each colour means, as on the desktop calendar. */
export function MonthLegend({ items }: { items: LegendItem[] }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
      {items.map(({ key, label, tint, soft, icon }) => (
        <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 16, height: 16, borderRadius: 4, alignItems: "center", justifyContent: "center", backgroundColor: soft }}>
            <Icon ios={icon.ios} android={icon.android} size={10} color={tint} />
          </View>
          <Copy kind="caption">{label}</Copy>
        </View>
      ))}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ backgroundColor: colors.warningSoft, borderRadius: 4, paddingHorizontal: 4, height: 16, justifyContent: "center" }}>
          <Copy kind="caption" color={colors.warning} maxFontSizeMultiplier={1} style={{ fontSize: 10, fontWeight: "700" }}>Fast</Copy>
        </View>
        <Copy kind="caption">Fast day</Copy>
      </View>
    </View>
  );
}
