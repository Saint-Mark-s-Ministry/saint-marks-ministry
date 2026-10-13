import { Pressable, View } from "react-native";
import { router, type Href } from "expo-router";
import { Copy, Icon, styles } from "@/components/ui";
import { useAppTheme } from "@/theme";
import type { CalendarEvent, CalendarEventKind, DotKind } from "@/data/calendar";

function useKindColors() {
  const { colors } = useAppTheme();
  return (kind: CalendarEventKind | DotKind) => {
    switch (kind) {
      case "attendance-due":
        return { tint: colors.warning, soft: colors.warningSoft };
      case "attendance-taken":
        return { tint: colors.success, soft: colors.successSoft };
      case "feast":
        return { tint: colors.info, soft: colors.infoSoft };
      case "fast":
        return { tint: colors.muted, soft: colors.hover };
      case "lesson":
      default:
        return { tint: colors.primary, soft: colors.primarySoft };
    }
  };
}

/** The little marks under a day number: lesson, attendance owed/taken, feast. */
export function DayDots({ dots, onPrimary = false }: { dots: DotKind[]; onPrimary?: boolean }) {
  const { colors } = useAppTheme();
  const colorFor = useKindColors();
  return (
    <View style={{ flexDirection: "row", gap: 3, height: 5 }}>
      {dots.map((kind) => (
        <View
          key={kind}
          style={{
            width: 5,
            height: 5,
            borderRadius: 2.5,
            backgroundColor: onPrimary ? colors.onAction : colorFor(kind).tint,
          }}
        />
      ))}
    </View>
  );
}

function KindIcon({ kind }: { kind: CalendarEventKind }) {
  const colorFor = useKindColors();
  const { tint, soft } = colorFor(kind);
  const glyph =
    kind === "lesson"
      ? { ios: "book.closed" as const, android: "menu_book" as const }
      : kind === "attendance-due"
        ? { ios: "exclamationmark.circle" as const, android: "error" as const }
        : kind === "attendance-taken"
          ? { ios: "checkmark.circle" as const, android: "check_circle" as const }
          : kind === "feast"
            ? { ios: "star" as const, android: "star" as const }
            : { ios: "leaf" as const, android: "eco" as const };
  return (
    <View
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: soft,
      }}
    >
      <Icon ios={glyph.ios} android={glyph.android} size={17} color={tint} />
    </View>
  );
}

/** One agenda line. Opens its screen when it has one; a feast or fast is information only. */
export function CalendarEventRow({ event, divider }: { event: CalendarEvent; divider: boolean }) {
  const { colors } = useAppTheme();
  const route = event.route;
  const content = (
    <>
      <KindIcon kind={event.kind} />
      <View style={{ flex: 1, gap: 2, paddingVertical: 2 }}>
        <Copy style={{ fontWeight: "600" }}>{event.title}</Copy>
        {!!event.subtitle && <Copy kind="caption">{event.subtitle}</Copy>}
      </View>
      {route && <Icon ios="chevron.right" android="schedule" size={14} color={colors.muted} />}
    </>
  );
  const rowStyle = [
    styles.compactRow,
    divider && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
  ];
  if (!route) {
    return (
      <View accessible accessibilityLabel={[event.title, event.subtitle].filter(Boolean).join(", ")} style={rowStyle}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[event.title, event.subtitle].filter(Boolean).join(", ")}
      onPress={() => router.push({ pathname: route.pathname, params: route.params } as unknown as Href)}
      style={({ pressed }) => [...rowStyle, { backgroundColor: pressed ? colors.primarySoft : "transparent" }]}
    >
      {content}
    </Pressable>
  );
}
