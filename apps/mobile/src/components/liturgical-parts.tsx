import { Alert, Linking, Pressable, View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import { Copy, Icon, styles } from "@/components/ui";
import { feedback } from "@/data/haptics";
import {
  SUBSCRIBE_CHOICES,
  calendarSubscriptionLinks,
  isLordlyFeast,
  liturgicalSummary,
  liturgicalTags,
  readingsRoute,
  subscribeUrl,
  type LiturgicalCalendarDay,
  type SubscribeChoice,
} from "@/data/liturgical";
import { useAppTheme } from "@/theme";

type Tone = "feast" | "other" | "fast" | "season" | "plain";

/** One small label for a feast, fast or season. Text carries the meaning; colour only groups it. */
export function LiturgicalChip({ label, tone, fullWidth = false }: { label: string; tone: Tone; fullWidth?: boolean }) {
  const { colors } = useAppTheme();
  const palette = {
    feast: { fg: colors.primary, bg: colors.primarySoft },
    other: { fg: colors.info, bg: colors.infoSoft },
    season: { fg: colors.info, bg: colors.infoSoft },
    fast: { fg: colors.warning, bg: colors.warningSoft },
    plain: { fg: colors.text2, bg: colors.hover },
  }[tone];
  return (
    <View
      style={{
        alignSelf: "flex-start",
        maxWidth: fullWidth ? undefined : "100%",
        borderRadius: 12,
        paddingHorizontal: 9,
        paddingVertical: 3,
        backgroundColor: palette.bg,
      }}
    >
      <Copy kind="caption" color={palette.fg} numberOfLines={1} style={{ fontWeight: "600", fontSize: 12, lineHeight: 16 }}>
        {label}
      </Copy>
    </View>
  );
}

/**
 * What the Church keeps on a scheduled date, shown beside a lesson or a day so
 * whoever plans it can tie it to the year. Renders nothing for an ordinary day
 * or when the church calendar had no answer. With `pressable`, a tag opens that
 * date's readings.
 */
export function LiturgicalTags({
  day,
  copticDate = false,
  pressable = false,
}: {
  day: LiturgicalCalendarDay | undefined;
  copticDate?: boolean;
  pressable?: boolean;
}) {
  const { colors } = useAppTheme();
  const tags = liturgicalTags(day, { copticDate });
  if (!day || !tags) return null;
  const chips = (
    <>
      {tags.feasts.map((feast) => (
        <LiturgicalChip key={feast.name} label={feast.name} tone={isLordlyFeast(feast) ? "feast" : "other"} />
      ))}
      {!!tags.fast && <LiturgicalChip label={tags.fast} tone="plain" />}
    </>
  );
  const row = (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      {!!tags.copticLabel && (
        <Copy kind="caption" color={colors.muted}>
          {tags.copticLabel}
        </Copy>
      )}
      {chips}
    </View>
  );
  if (!pressable) return <View accessible accessibilityLabel={liturgicalSummary(day)}>{row}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${liturgicalSummary(day)}. Opens this day's readings`}
      hitSlop={6}
      onPress={() => router.push(readingsRoute(day.date))}
    >
      {row}
    </Pressable>
  );
}

/** Copies the feed address; the only choice that doesn't open another app. */
async function copyFeedLink() {
  const { https } = calendarSubscriptionLinks();
  try {
    await Clipboard.setStringAsync(https);
    feedback("success");
    Alert.alert("Calendar link copied", "Paste it into your calendar app's “Subscribe by URL” option.");
  } catch {
    Alert.alert("Couldn't copy the link", https);
  }
}

/** Opens the feed in the chosen calendar app; if nothing can open it, the link can still be copied. */
export async function subscribeTo(choice: SubscribeChoice) {
  if (choice === "copy") {
    await copyFeedLink();
    return;
  }
  const url = subscribeUrl(choice);
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Couldn't open your calendar", "You can copy the calendar link and add it by URL instead.", [
      { text: "Copy link", onPress: () => void copyFeedLink() },
      { text: "Cancel", style: "cancel" },
    ]);
  }
}

/**
 * Subscribe the phone's own calendar to the Coptic Orthodox calendar. The
 * subscription is between the calendar app and Coptic IO; this app neither
 * proxies nor sees it.
 */
export function CalendarSubscribeMenu({ label = "Subscribe" }: { label?: string }) {
  const { colors } = useAppTheme();
  const actions: MenuAction[] = SUBSCRIBE_CHOICES.map((choice) => ({ id: choice.id, title: choice.title }));
  return (
    <MenuView
      title="Church calendar in your calendar app"
      actions={actions}
      onPressAction={({ nativeEvent }) => void subscribeTo(nativeEvent.event as SubscribeChoice)}
    >
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel="Subscribe to the church calendar"
        style={[styles.pill, { backgroundColor: colors.hover, minHeight: 32 }]}
      >
        <Icon ios="calendar.badge.plus" android="event_available" size={14} color={colors.primary} />
        <Copy kind="caption" color={colors.primary} style={{ fontWeight: "600" }}>
          {label}
        </Copy>
      </View>
    </MenuView>
  );
}
