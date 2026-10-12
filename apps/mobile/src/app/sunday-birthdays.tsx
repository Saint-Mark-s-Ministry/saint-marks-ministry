import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import type { SundaySchoolDashboard } from "@stmark/contracts";
import { Copy, ListSurface, Screen, StatusPill } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { AcademicYearContext } from "@/components/academic-year-context";
import { savedLabel } from "@/data/prep-lessons";
import { endpoint, useResource } from "@/data/resources";
import {
  MONTHS,
  birthdayCaption,
  birthdayParts,
  classesIn,
  filterBirthdays,
  isToday,
  upcomingBirthdays,
  type Birthday,
} from "@/data/sunday-school-birthdays";
import { serifDisplay, useAppTheme } from "@/theme";

const OFFLINE = "Could not reach the server. Check your connection and try again.";
const FORBIDDEN = "Forbidden";

export default function SundayBirthdays() {
  const { colors } = useAppTheme();
  const birthdays = useResource<Birthday[]>("/api/sunday-school/birthdays");
  const dashboard = useResource<SundaySchoolDashboard>(endpoint("dashboard"));
  const [scope, setScope] = useState(0); // 0 = this month, 1 = all months
  const [classId, setClassId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const now = new Date();
  const thisMonth = now.getUTCMonth() + 1;

  const all = birthdays.data ?? [];
  const classes = useMemo(() => classesIn(all), [all]);
  const rows = useMemo(() => {
    const scoped = filterBirthdays(all, { month: scope === 0 ? thisMonth : null, classId });
    const q = query.trim().toLowerCase();
    const searched = q ? scoped.filter((b) => `${b.firstName} ${b.lastName}`.toLowerCase().includes(q)) : scoped;
    return upcomingBirthdays(searched, now);
  }, [all, scope, classId, query, thisMonth]);

  const denied = birthdays.error === FORBIDDEN;
  const offline = birthdays.error === OFFLINE;

  return (
    <>
      {/* The large heading below carries the title; an empty bar title avoids repeating it. */}
      <Stack.Screen options={{ title: "" }} />
      <Stack.SearchBar
        autoCapitalize="none"
        placement="automatic"
        placeholder="Search children"
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
        onCancelButtonPress={() => setQuery("")}
      />
      <Screen refreshing={birthdays.loading || birthdays.refreshing} onRefresh={() => void birthdays.refresh()}>
        <View style={{ paddingHorizontal: 4, gap: 6 }}>
          <Copy style={{ fontFamily: serifDisplay, fontSize: 34, lineHeight: 36, fontWeight: "500" }}>Birthdays</Copy>
          <Copy kind="caption">
            {scope === 0 ? MONTHS[thisMonth - 1] : "All months"} · {rows.length} {rows.length === 1 ? "child" : "children"}
          </Copy>
          {dashboard.data && <AcademicYearContext dashboard={dashboard.data} />}
        </View>

        {denied && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Not available for your account</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>Birthdays show only for the classes you serve. Ask a coordinator if you need access.</Copy>
          </View>
        )}

        {!denied && offline && birthdays.stale && (
          <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.warning}>You're offline · showing saved birthdays</Copy>
            <Copy kind="caption">{birthdays.updatedAt ? savedLabel(birthdays.updatedAt, now) : "Saved earlier"}. Pull down to refresh.</Copy>
          </View>
        )}

        {!denied && !birthdays.stale && (
          <ResourceState loading={birthdays.loading} error={birthdays.error} retry={() => void birthdays.refresh()} />
        )}

        {!denied && birthdays.data && (
          <>
            <SegmentedControl
              values={["This month", "All months"]}
              selectedIndex={scope}
              onChange={({ nativeEvent }) => setScope(nativeEvent.selectedSegmentIndex)}
              style={{ width: "100%", minHeight: 36 }}
            />

            {!!classes.length && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <FilterChip label="All classes" active={classId === null} onPress={() => setClassId(null)} />
                {classes.map((c) => (
                  <FilterChip key={c.id} label={c.name} active={classId === c.id} onPress={() => setClassId(c.id)} />
                ))}
              </ScrollView>
            )}

            {birthdays.data && !rows.length && (
              <View style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}>
                <Copy kind="heading">{all.length ? "No birthdays match" : "No birthdays yet"}</Copy>
                <Copy kind="caption">{all.length ? "Try All months or another class." : "Birthdays appear once a child's birth date is on file."}</Copy>
              </View>
            )}

            {!!rows.length && (
              <ListSurface>
                {rows.map((b, index) => (
                  <BirthdayRow key={b.id} birthday={b} now={now} last={index === rows.length - 1} />
                ))}
              </ListSurface>
            )}
          </>
        )}
      </Screen>
    </>
  );
}

function BirthdayRow({ birthday, now, last }: { birthday: Birthday; now: Date; last: boolean }) {
  const { colors } = useAppTheme();
  const today = isToday(birthday.birthDate, now);
  const caption = birthdayCaption(birthday.birthDate, now);
  const parts = birthdayParts(birthday.birthDate);
  return (
    <View
      accessible
      accessibilityLabel={`${birthday.firstName} ${birthday.lastName}, ${birthday.class?.name ?? "no class"}, ${caption}`}
      style={[
        { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 },
        !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Copy style={{ fontWeight: "500" }}>{birthday.firstName} {birthday.lastName}</Copy>
        <Copy kind="caption">{birthday.class?.name ?? "No class"} · {caption}</Copy>
      </View>
      {today && <StatusPill label="Today" color={colors.primary} soft={colors.primarySoft} />}
      {!today && parts && <Copy kind="caption">{parts.day}</Copy>}
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: 14,
        justifyContent: "center",
        borderRadius: 22,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.primarySoft : colors.surface,
      }}
    >
      <Copy style={{ fontWeight: active ? "600" : "400", color: active ? colors.primary : colors.text }}>{label}</Copy>
    </Pressable>
  );
}
