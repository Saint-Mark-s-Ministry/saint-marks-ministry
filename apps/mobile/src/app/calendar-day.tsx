import { View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Copy, ListSurface, Screen, SectionTitle, StatusPill } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { CalendarEventRow } from "@/components/calendar-parts";
import { useAppTheme } from "@/theme";
import { formatLongDay, isDateKey, todayKey, type DateKey } from "@/data/calendar";
import { useResource } from "@/data/resources";
import { useCalendarEvents } from "@/data/use-calendar-events";

interface LiturgicalDayDetail {
  date: string;
  copticDate: { label: string } | null;
  season: { name: string; description: string | null } | null;
  seasonDay: string | null;
  fasting: { fast: { name: string } | null } | null;
  feasts: { name: string; category: string }[];
  saints: { name: string }[];
  readings: { key: string; label: string; service: string; reference: string }[];
  available: boolean;
}

const SERVICE_LABELS: Record<string, string> = {
  vespers: "Vespers",
  matins: "Matins",
  liturgy: "Divine Liturgy",
  evening: "Evening",
};
const SERVICE_ORDER = ["vespers", "matins", "liturgy", "evening"];

/**
 * One day of the calendar: what the church celebrates (Coptic date, season,
 * fast, feasts, saints, readings) and what is on for this ministry that day.
 * Reached by tapping a day in the Calendar tab, as in the system calendar.
 */
export default function CalendarDay() {
  const { colors } = useAppTheme();
  const { date: raw } = useLocalSearchParams<{ date?: string }>();
  const date: DateKey = raw && isDateKey(raw) ? raw : todayKey();
  const day = useResource<LiturgicalDayDetail>(`/api/liturgical/day?date=${date}`);
  const { eventsOn, loading: eventsLoading } = useCalendarEvents([date]);
  const events = eventsOn(date);
  const detail = day.data;

  const sections = SERVICE_ORDER.map((service) => ({
    service,
    items: (detail?.readings ?? []).filter((reading) => reading.service === service),
  })).filter((section) => section.items.length > 0);

  const fastName = detail?.fasting?.fast?.name;

  return (
    <>
      <Stack.Screen options={{ title: formatLongDay(date) }} />
      <Screen refreshing={day.refreshing || eventsLoading} onRefresh={() => void day.refresh()}>
        {!!detail?.copticDate && (
          <View style={{ paddingHorizontal: 4 }}>
            <Copy kind="caption">{detail.copticDate.label}</Copy>
          </View>
        )}

        {(!!detail?.season || !!fastName) && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {!!detail?.season && (
              <StatusPill
                label={detail.seasonDay ? `${detail.season.name} · ${detail.seasonDay}` : detail.season.name}
                color={colors.info}
                soft={colors.infoSoft}
              />
            )}
            {!!fastName && <StatusPill label={fastName} color={colors.warning} soft={colors.warningSoft} />}
          </View>
        )}

        <SectionTitle title="Scheduled" />
        {events.length ? (
          <ListSurface>
            {events.map((event, index) => (
              <CalendarEventRow key={event.id} event={event} divider={index < events.length - 1} />
            ))}
          </ListSurface>
        ) : (
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 18 }}>
            <Copy kind="caption">Nothing scheduled.</Copy>
          </View>
        )}

        <ResourceState
          loading={day.loading}
          error={day.error === "Could not reach the server. Check your connection and try again." ? undefined : day.error}
          retry={() => void day.refresh()}
        />

        {!!detail && detail.available === false && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 18 }}>
            <Copy kind="caption">The church calendar isn't available right now. Pull down to try again.</Copy>
          </View>
        )}

        {!!detail?.feasts.length && (
          <>
            <SectionTitle title="Feasts and commemorations" />
            <ListSurface>
              {detail.feasts.map((feast, index) => (
                <View
                  key={`${feast.name}-${index}`}
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderBottomWidth: index < detail.feasts.length - 1 ? 0.5 : 0,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Copy style={{ fontWeight: "500" }}>{feast.name}</Copy>
                </View>
              ))}
            </ListSurface>
          </>
        )}

        {!!detail?.saints.length && (
          <>
            <SectionTitle title="Saints" />
            <ListSurface>
              {detail.saints.map((saint, index) => (
                <View
                  key={`${saint.name}-${index}`}
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderBottomWidth: index < detail.saints.length - 1 ? 0.5 : 0,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Copy>{saint.name}</Copy>
                </View>
              ))}
            </ListSurface>
          </>
        )}

        {sections.map((section) => (
          <View key={section.service} style={{ gap: 10 }}>
            <SectionTitle title={`Readings · ${SERVICE_LABELS[section.service] ?? section.service}`} />
            <ListSurface>
              {section.items.map((reading, index) => (
                <View
                  key={`${reading.key}-${index}`}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    gap: 2,
                    borderBottomWidth: index < section.items.length - 1 ? 0.5 : 0,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Copy kind="caption">{reading.label}</Copy>
                  <Copy style={{ fontWeight: "500" }}>{reading.reference}</Copy>
                </View>
              ))}
            </ListSurface>
          </View>
        ))}
      </Screen>
    </>
  );
}
