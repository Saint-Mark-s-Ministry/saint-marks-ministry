import { useEffect, useMemo, useState } from "react";
import { LayoutAnimation, Linking, Platform, Pressable, Text, UIManager, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { Button, Card, Copy, Icon, ListSurface, Screen, SectionTitle, StatusPill, styles } from "@/components/ui";
import { CalendarSubscribeMenu } from "@/components/liturgical-parts";
import {
  SERVICE_LABELS,
  chapterVerses,
  dayPath,
  expandableIds,
  groupByService,
  hasText,
  readingId,
  readingsPath,
  referenceSummary,
  storyId,
  type DailyReadings,
  type LiturgicalLanguage,
  type ReadingSection,
  type SynaxariumStory,
} from "@/data/readings";
import { addDays, formatLongDay } from "@/data/calendar";
import {
  LITURGICAL_MAX_DATE,
  LITURGICAL_MIN_DATE,
  clampLiturgicalDate,
  isLiturgicalDateKey,
  keyFromPickerDate,
  pickerDateFor,
  copticDateText,
  isLordlyFeast,
  notableFeasts,
  type LiturgicalDay,
} from "@/data/liturgical";
import { useChurchToday } from "@/data/use-liturgical";
import { useResource } from "@/data/resources";
import { MinistryTintProvider, serifDisplay, sansMedium, useAppTheme } from "@/theme";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * The day's lectionary (Katameros) and Synaxarium, from Coptic IO via the
 * server. Coptic date first, then each reading as a row showing its reference;
 * tap a row to read the passage in place.
 */
export default function Readings() {
  const params = useLocalSearchParams<{ date?: string }>();
  const requested = params.date && isLiturgicalDateKey(params.date) ? params.date : null;
  return (
    <MinistryTintProvider ministry="sundaySchool">
      <ReadingsPage initialDate={requested} />
    </MinistryTintProvider>
  );
}

function ReadingsPage({ initialDate }: { initialDate: string | null }) {
  const { colors } = useAppTheme();
  // Today at the church, moving on at church midnight (not the device's day). An
  // explicitly chosen date is a plain calendar day and never follows the clock.
  const today = useChurchToday();
  const [picked, setPicked] = useState<string | null>(initialDate);
  const date = picked ?? today;
  const [lang, setLang] = useState<LiturgicalLanguage>("en");
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const readings = useResource<DailyReadings>(readingsPath(date, lang));
  const day = useResource<LiturgicalDay>(dayPath(date, lang));
  const data = readings.data;
  const dayData = day.data;

  const shownDate = date;
  const rtl = lang === "ar";
  const copticDate = data?.copticDate ?? dayData?.copticDate ?? null;
  const season = dayData?.season?.name ?? data?.season ?? null;
  const seasonDay = data?.seasonDay ?? dayData?.seasonDay ?? null;
  const feasts = notableFeasts(dayData?.feasts ?? []);
  const fast = dayData?.fasting?.fast ?? null;

  // Opened again with another date (a feast tapped elsewhere) while already showing.
  useEffect(() => {
    setPicked(initialDate);
  }, [initialDate]);

  // A different day or language starts collapsed.
  useEffect(() => {
    setOpen(new Set());
  }, [date, lang]);

  const groups = useMemo(() => groupByService(data?.sections ?? []), [data]);
  const allIds = useMemo(() => (data ? expandableIds(data) : []), [data]);
  const allOpen = allIds.length > 0 && allIds.every((id) => open.has(id));

  const toggle = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen(allOpen ? new Set() : new Set(allIds));
  };
  const shift = (days: number) => setPicked(clampLiturgicalDate(addDays(shownDate, days)));

  const unavailable = !!readings.error && !data;
  const loading = !data && !readings.error;

  return (
    <>
      <Stack.Screen options={{ title: "Daily readings", headerLargeTitle: false }} />
      <Screen
        refreshing={readings.refreshing}
        onRefresh={() => {
          void readings.refresh();
          void day.refresh();
        }}
      >
        {/* The Coptic date leads the page. */}
        <View style={{ paddingHorizontal: 4, gap: 6, direction: rtl ? "rtl" : "ltr" }}>
          <Copy
            kind="title"
            accessibilityLabel={copticDate ? `Coptic date, ${copticDate.label}` : undefined}
          >
            {copticDate ? copticDateText(copticDate.label, lang) : formatLongDay(shownDate)}
          </Copy>
          {/* With no Coptic date to lead, the title already is the day: don't say it twice. */}
          {!!copticDate && <Copy color={colors.muted}>{formatLongDay(shownDate)}</Copy>}
        </View>

        {(!!season || feasts.length > 0 || !!fast) && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, direction: rtl ? "rtl" : "ltr" }}>
            {!!season && (
              <StatusPill
                label={seasonDay ? `${season} · ${seasonDay}` : season}
                color={colors.info}
                soft={colors.infoSoft}
              />
            )}
            {feasts.map((feast) => (
              <StatusPill
                key={feast.name}
                label={feast.name}
                color={isLordlyFeast(feast) ? colors.primary : colors.info}
                soft={isLordlyFeast(feast) ? colors.primarySoft : colors.infoSoft}
              />
            ))}
            {!!fast && <StatusPill label={fast.name} color={colors.warning} soft={colors.warningSoft} />}
          </View>
        )}

        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <View style={[styles.row, { gap: 2 }]}>
            <StepButton icon="chevron.left" label="Previous day" onPress={() => shift(-1)} />
            <StepButton icon="chevron.right" label="Next day" onPress={() => shift(1)} />
          </View>
          <DateTimePicker
            value={pickerDateFor(shownDate)}
            mode="date"
            display="compact"
            // A native view in a flex row needs a real size: without one the pill still
            // draws, but outside its own bounds, so it cannot be tapped or reached by VoiceOver.
            style={{ width: 150, height: 36 }}
            timeZoneName="UTC"
            minimumDate={pickerDateFor(LITURGICAL_MIN_DATE)}
            maximumDate={pickerDateFor(LITURGICAL_MAX_DATE)}
            accentColor={colors.primary}
            onValueChange={(_, chosen) => setPicked(keyFromPickerDate(chosen))}
          />
          {date !== today ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go to today"
              onPress={() => setPicked(null)}
              style={({ pressed }) => [styles.pill, { backgroundColor: colors.hover, opacity: pressed ? 0.7 : 1 }]}
            >
              <Copy kind="caption" style={{ fontWeight: "600" }}>
                Today
              </Copy>
            </Pressable>
          ) : (
            <View style={{ width: 36 }} />
          )}
        </View>

        <SegmentedControl
          values={["English", "العربية"]}
          selectedIndex={lang === "en" ? 0 : 1}
          onChange={({ nativeEvent }) => setLang(nativeEvent.selectedSegmentIndex === 1 ? "ar" : "en")}
          style={{ width: "100%", minHeight: 36 }}
        />

        <View style={[styles.row, { justifyContent: "space-between" }]}>
          {allIds.length > 1 ? (
            <Pressable
              accessibilityRole="button"
              onPress={toggleAll}
              style={({ pressed }) => [styles.pill, { backgroundColor: colors.hover, opacity: pressed ? 0.7 : 1 }]}
            >
              <Copy kind="caption" style={{ fontWeight: "600" }}>
                {allOpen ? "Collapse all" : "Expand all"}
              </Copy>
            </Pressable>
          ) : (
            <View />
          )}
          <CalendarSubscribeMenu />
        </View>

        {loading && (
          <Card>
            <Copy kind="caption">Loading the readings…</Copy>
          </Card>
        )}

        {unavailable && (
          <Card>
            <Copy style={{ fontWeight: "600" }}>Readings unavailable</Copy>
            <Copy kind="caption">
              We couldn't reach the Coptic calendar service. Check your connection and try again.
            </Copy>
            <Button label="Try again" onPress={() => void readings.refresh()} />
          </Card>
        )}

        {readings.stale && !!data && (
          <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.warning}>Showing the last readings we loaded</Copy>
            <Copy kind="caption">The Coptic calendar service can't be reached right now. Pull down to try again.</Copy>
          </View>
        )}

        {data && groups.length === 0 && (
          <Card>
            <Copy kind="caption">No readings are listed for this day.</Copy>
          </Card>
        )}

        {groups.map((group) => (
          <View key={group.service} style={{ gap: 10 }}>
            <SectionTitle title={SERVICE_LABELS[group.service]} />
            <ListSurface style={{ direction: rtl ? "rtl" : "ltr" }}>
              {group.sections.map((section, index) => (
                <ReadingRow
                  key={section.key}
                  section={section}
                  open={open.has(readingId(section))}
                  onToggle={() => toggle(readingId(section))}
                  rtl={rtl}
                  divider={index < group.sections.length - 1}
                />
              ))}
            </ListSurface>
          </View>
        ))}

        {!!data && (
          <View style={{ gap: 10 }}>
            <SectionTitle
              title="Synaxarium"
              subtitle={
                data.synaxarium.length > 0
                  ? `${data.synaxarium.length} commemorated on this day`
                  : "No commemorations are listed for this day."
              }
            />
            {data.synaxarium.length > 0 && (
              <ListSurface style={{ direction: rtl ? "rtl" : "ltr" }}>
                {data.synaxarium.map((story, index) => (
                  <StoryRow
                    key={`${story.name}-${index}`}
                    story={story}
                    open={open.has(storyId(index))}
                    onToggle={() => toggle(storyId(index))}
                    rtl={rtl}
                    divider={index < data.synaxarium.length - 1}
                  />
                ))}
              </ListSurface>
            )}
          </View>
        )}

        <View style={{ paddingHorizontal: 4, gap: 6 }}>
          <Copy kind="caption">
            Readings, Synaxarium and calendar from Coptic IO. English Scripture is the New King James Version.
          </Copy>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open coptic.io"
            hitSlop={8}
            onPress={() => void Linking.openURL("https://coptic.io").catch(() => undefined)}
          >
            <Copy kind="caption" color={colors.primary} style={{ fontWeight: "600" }}>
              coptic.io
            </Copy>
          </Pressable>
        </View>
      </Screen>
    </>
  );
}

function StepButton({ icon, label, onPress }: { icon: "chevron.left" | "chevron.right"; label: string; onPress: () => void }) {
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

function ReadingRow({
  section,
  open,
  onToggle,
  rtl,
  divider,
}: {
  section: ReadingSection;
  open: boolean;
  onToggle: () => void;
  rtl: boolean;
  divider: boolean;
}) {
  const { colors } = useAppTheme();
  const reference = referenceSummary(section);
  const expandable = hasText(section);
  const text = {
    fontFamily: serifDisplay,
    fontSize: 17,
    lineHeight: 28,
    // No explicit left/right: under an RTL container React Native swaps them, so "auto"
    // (follow the writing direction) is what puts Arabic on the right edge.
    textAlign: "auto" as const,
    writingDirection: rtl ? ("rtl" as const) : ("ltr" as const),
  };
  const number = { fontFamily: sansMedium, fontSize: 11, color: colors.muted };

  return (
    <View style={divider ? { borderBottomWidth: 0.5, borderBottomColor: colors.border } : undefined}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled: !expandable }}
        accessibilityLabel={`${section.label}, ${reference}`}
        accessibilityHint={expandable ? (open ? "Hides the passage" : "Shows the passage") : undefined}
        disabled={!expandable}
        onPress={onToggle}
        style={({ pressed }) => [
          { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
          { backgroundColor: pressed ? colors.primarySoft : "transparent" },
        ]}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <Copy kind="caption" style={{ alignSelf: "flex-start" }}>{section.label}</Copy>
          {/* A reference is Latin text with numbers ("Luke 4:1-13"), so it stays left-to-right. */}
          <Copy style={{ fontWeight: "600", fontSize: 17, alignSelf: "flex-start", writingDirection: "ltr" }}>
            {reference || "—"}
          </Copy>
        </View>
        {expandable && (
          <Icon ios={open ? "chevron.up" : "chevron.down"} android="schedule" size={15} color={colors.muted} />
        )}
      </Pressable>

      {open && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 18, gap: 14 }}>
          {section.passages.map((passage, index) => (
            <View key={`${passage.reference}-${index}`} style={{ gap: 6 }}>
              {section.passages.length > 1 && (
                <Copy kind="caption" style={{ fontWeight: "600", alignSelf: "flex-start", writingDirection: "ltr" }}>
                  {passage.reference}
                </Copy>
              )}
              {passage.chapters.map((chapter) => (
                <Text key={chapter.chapter} style={[text, { color: colors.text }]} selectable>
                  {chapterVerses(chapter).map((verse) => (
                    <Text key={verse.num}>
                      <Text style={number}>{verse.num}</Text>
                      {" "}
                      {verse.text}
                      {" "}
                    </Text>
                  ))}
                </Text>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function StoryRow({
  story,
  open,
  onToggle,
  rtl,
  divider,
}: {
  story: SynaxariumStory;
  open: boolean;
  onToggle: () => void;
  rtl: boolean;
  divider: boolean;
}) {
  const { colors } = useAppTheme();
  const expandable = !!story.text;
  return (
    <View style={divider ? { borderBottomWidth: 0.5, borderBottomColor: colors.border } : undefined}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled: !expandable }}
        accessibilityLabel={story.name}
        accessibilityHint={expandable ? (open ? "Hides the story" : "Shows the story") : undefined}
        disabled={!expandable}
        onPress={onToggle}
        style={({ pressed }) => [
          { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
          { backgroundColor: pressed ? colors.primarySoft : "transparent" },
        ]}
      >
        <Copy style={{ flex: 1, fontWeight: "600", fontSize: 16, textAlign: "auto", writingDirection: rtl ? "rtl" : "ltr" }}>
          {story.name}
        </Copy>
        {expandable && (
          <Icon ios={open ? "chevron.up" : "chevron.down"} android="schedule" size={15} color={colors.muted} />
        )}
      </Pressable>
      {open && !!story.text && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 18 }}>
          <Text
            selectable
            style={{
              fontFamily: serifDisplay,
              fontSize: 17,
              lineHeight: 28,
              color: colors.text,
              textAlign: "auto",
              writingDirection: rtl ? "rtl" : "ltr",
            }}
          >
            {story.text.trim()}
          </Text>
        </View>
      )}
    </View>
  );
}
