import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Card, Copy, Icon } from "@/components/ui";
import { CalendarSubscribeMenu, LiturgicalChip } from "@/components/liturgical-parts";
import { useAppTheme, serifCard } from "@/theme";
import { useResource } from "@/data/resources";
import { dayPath } from "@/data/readings";
import {
  fastLabel,
  headlineReading,
  isLordlyFeast,
  notableFeasts,
  readingsRoute,
  saintsSentence,
  type LiturgicalDay,
} from "@/data/liturgical";
import { useChurchToday } from "@/data/use-liturgical";

/**
 * "Today in the Church": the Coptic date, season, fast, feasts, the day's
 * Gospel and the saints of the Synaxarium, on every dashboard for every role.
 * Coptic IO is a third party, so a failure is a quiet line and a retry, never
 * an error that holds up the screen around it; the card still opens the page.
 */
export function TodayInChurchCard() {
  const { colors } = useAppTheme();
  // Church-local today, moving on at church midnight, passed as an explicit date.
  const today = useChurchToday();
  const day = useResource<LiturgicalDay>(dayPath(today, "en"));
  const data = day.data;
  const available = !!data && data.available !== false;
  const unavailable = (!!day.error && !data) || (!!data && data.available === false);
  const feasts = notableFeasts(data?.feasts ?? []);
  const fast = data ? fastLabel(data) : null;
  const gospel = data ? headlineReading(data.readings) : null;
  const saints = data?.saints.map((saint) => saint.name) ?? [];
  const open = () => router.push(readingsRoute(today));

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Today in the Church${data?.copticDate ? `. ${data.copticDate.label}` : ""}. Opens the daily readings`}
        onPress={open}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          padding: 16,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 15,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.primarySoft,
          }}
        >
          <Icon ios="text.book.closed.fill" android="menu_book" size={20} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Copy kind="caption">Today in the Church</Copy>
          <Copy style={{ ...serifCard, lineHeight: 26 }} numberOfLines={1}>
            {data?.copticDate ? data.copticDate.label : day.loading ? "Loading…" : "Readings and Synaxarium"}
          </Copy>
        </View>
        <Icon ios="chevron.right" android="chevron_right" size={14} color={colors.muted} />
      </Pressable>

      {day.loading && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
          <Copy kind="caption">Loading the church calendar…</Copy>
        </View>
      )}

      {unavailable && (
        <View
          accessibilityLiveRegion="polite"
          style={{ paddingHorizontal: 16, paddingBottom: 14, flexDirection: "row", alignItems: "center", gap: 10 }}
        >
          <Copy kind="caption" style={{ flex: 1 }}>
            The church calendar is unavailable right now.
          </Copy>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try loading the church calendar again"
            onPress={() => void day.refresh()}
            style={({ pressed }) => ({
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 6,
              backgroundColor: pressed ? colors.primarySoft : colors.hover,
            })}
          >
            <Copy kind="caption" color={colors.primary} style={{ fontWeight: "600" }}>
              Try again
            </Copy>
          </Pressable>
        </View>
      )}

      {available && data && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 10 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {feasts.map((feast) => (
              <LiturgicalChip key={feast.name} label={feast.name} tone={isLordlyFeast(feast) ? "feast" : "other"} />
            ))}
            {!!data.season && <LiturgicalChip label={data.season.name} tone="season" />}
            {fast && <LiturgicalChip label={fast.text} tone={fast.fasting ? "fast" : "plain"} />}
          </View>
          {!!data.seasonDay && <Copy kind="caption">{data.seasonDay}</Copy>}
          {gospel && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${gospel.label}, ${gospel.reference}. Opens the readings`}
              hitSlop={6}
              onPress={open}
            >
              <Copy kind="caption">
                {gospel.label}:{" "}
                <Copy kind="caption" color={colors.primary} style={{ fontWeight: "600" }}>
                  {gospel.reference}
                </Copy>
              </Copy>
            </Pressable>
          )}
          {!!saints.length && (
            <Copy kind="caption">
              Commemorated: <Copy kind="caption" color={colors.text}>{saintsSentence(saints)}</Copy>
            </Copy>
          )}
        </View>
      )}

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderTopWidth: 0.5,
          borderTopColor: colors.border,
        }}
      >
        <Copy kind="caption" style={{ flex: 1 }} numberOfLines={2}>
          Feasts and fasts in your own calendar
        </Copy>
        <CalendarSubscribeMenu />
      </View>
    </Card>
  );
}
