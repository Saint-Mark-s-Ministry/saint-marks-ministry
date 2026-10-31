import { useMemo, useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import type { AttendanceRosterNameOrder } from "@stmark/domain";
import { getChildFullName } from "@stmark/domain";
import { Button, Card, Copy, Icon, ListSurface, Screen, styles } from "@/components/ui";
import { FormerPill, Legend, MeetingMark, rateColor, useLargeType } from "@/components/attendance-history-parts";
import {
  CLASS_HISTORY_PROBLEM_MESSAGE,
  NO_MEETINGS_MESSAGE,
  RATE_NOTE,
  childAttendanceRoute,
  childSpoken,
  markLabel,
  meetingDateLabel,
  rateText,
  recentMeetings,
  visibleChildren,
  type IndividualAttendanceChild,
} from "@/data/individual-attendance";
import { useIndividualAttendance } from "@/data/use-individual-attendance";
import { usePortal } from "@/data/portal-provider";
import { MinistryTintProvider, sansRegular, useAppTheme } from "@/theme";

/**
 * Attendance → Individual history for one class, read-only. It is pushed over
 * Take attendance, which stays mounted underneath, and it never reads or
 * writes the pending marks: switching class here changes only what this screen
 * asks for. Contacts, attendance notes and pastoral notes are not in the
 * payload and are not shown.
 */
export default function IndividualAttendance() {
  const params = useLocalSearchParams<{ classId?: string }>();
  const { classes } = usePortal();
  const [classId, setClassId] = useState(params.classId ?? classes[0]?.id ?? null);
  const { colors } = useAppTheme();
  const [query, setQuery] = useState("");
  const [nameOrder, setNameOrder] = useState<AttendanceRosterNameOrder>("last");
  const { history, problem, loading, stale, refreshing, retry } = useIndividualAttendance(classId);
  const large = useLargeType();

  const children = useMemo(
    () => (history ? visibleChildren(history, { query, nameOrder }) : []),
    [history, query, nameOrder],
  );

  function chooseClass(id: string) {
    if (id === classId) return;
    setClassId(id);
    setQuery("");
  }

  return (
    <MinistryTintProvider ministry="sundaySchool">
      <Stack.Screen options={{ title: "Individual history" }} />
      <Screen refreshing={refreshing} onRefresh={classId ? () => void retry() : undefined}>
        <ClassPicker
          options={classes.map((item) => ({ id: item.id, name: item.name }))}
          selectedId={classId}
          onSelect={chooseClass}
        />

        {!classId && <Problem message="Choose a class to see its attendance history." />}

        {!!classId && loading && (
          <View accessibilityRole="progressbar" accessibilityLabel="Loading attendance history" style={{ paddingVertical: 28, alignItems: "center", gap: 8 }}>
            <ActivityIndicator color={colors.primary} />
            <Copy kind="caption">Loading attendance history…</Copy>
          </View>
        )}

        {!!classId && !!problem && (
          <Problem
            message={CLASS_HISTORY_PROBLEM_MESSAGE[problem]}
            onRetry={problem === "retry" ? () => void retry() : undefined}
          />
        )}

        {stale && <Copy kind="caption" color={colors.warning}>Showing the last saved history. Couldn't refresh.</Copy>}

        {!!history && (
          <>
            <Card>
              <Copy kind="caption">
                {history.dates.length
                  ? `${history.dates.length} past ${history.dates.length === 1 ? "meeting" : "meetings"} · latest ${meetingDateLabel(history.dates[history.dates.length - 1])}`
                  : "No past meetings"}
              </Copy>
              <Legend />
              <Copy kind="caption">{RATE_NOTE}</Copy>
            </Card>

            {!history.dates.length && <Problem message={NO_MEETINGS_MESSAGE} />}

            {!!history.dates.length && (
              <>
                <View style={[styles.row, { gap: 10, flexWrap: large ? "wrap" : "nowrap" }]}>
                  <Copy kind="caption" style={{ flex: large ? undefined : 1 }}>
                    {children.length} of {history.children.length} children
                  </Copy>
                  <Copy kind="caption">Sort</Copy>
                  <SegmentedControl
                    values={["First", "Last"]}
                    selectedIndex={nameOrder === "first" ? 0 : 1}
                    onChange={({ nativeEvent }) => setNameOrder(nativeEvent.selectedSegmentIndex === 0 ? "first" : "last")}
                    style={{ width: 130, minHeight: 32 }}
                  />
                </View>

                <View
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 8,
                    backgroundColor: colors.surface, borderColor: colors.border,
                    borderWidth: 1, borderRadius: 16, paddingHorizontal: 12,
                  }}
                >
                  <Icon ios="magnifyingglass" android="search" size={20} color={colors.muted} />
                  <TextInput
                    accessibilityLabel="Find a child"
                    placeholder="Find a child"
                    placeholderTextColor={colors.muted}
                    value={query}
                    onChangeText={setQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={() => Keyboard.dismiss()}
                    style={{ flex: 1, minWidth: 0, minHeight: 48, paddingVertical: 12, fontFamily: sansRegular, fontSize: 16, color: colors.text }}
                  />
                  {!!query && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear child search"
                      onPress={() => setQuery("")}
                      style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
                    >
                      <Icon ios="xmark.circle.fill" android="cancel" size={20} color={colors.muted} />
                    </Pressable>
                  )}
                </View>

                {!history.children.length && <Copy kind="caption">No children have saved attendance in this class yet.</Copy>}
                {!!history.children.length && !children.length && (
                  <Copy kind="caption">No children match "{query.trim()}".</Copy>
                )}

                {!!children.length && (
                  <ListSurface>
                    {children.map((child, index) => (
                      <ChildRow
                        key={child.id}
                        child={child}
                        dates={history.dates}
                        classId={classId!}
                        divider={index < children.length - 1}
                      />
                    ))}
                  </ListSurface>
                )}
              </>
            )}
          </>
        )}
      </Screen>
    </MinistryTintProvider>
  );
}

/** One chip per class; the chosen class is the one this screen reads. Nothing here touches Take attendance. */
function ClassPicker({
  options,
  selectedId,
  onSelect,
}: {
  options: { id: string; name: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { colors } = useAppTheme();
  const large = useLargeType();
  if (!options.length) return null;
  const chipList = (
    <>
        {options.map((item) => {
          const selected = item.id === selectedId;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`Class: ${item.name}`}
              onPress={() => onSelect(item.id)}
              style={({ pressed }) => ({
                minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: "center",
                backgroundColor: selected ? colors.primary : pressed ? colors.primarySoft : colors.surface,
                borderWidth: 1, borderColor: selected ? colors.primary : colors.border,
              })}
            >
              <Copy color={selected ? colors.onAction : colors.text} style={{ fontWeight: "600" }}>{item.name}</Copy>
            </Pressable>
          );
        })}
    </>
  );
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Class" style={{ gap: 6 }}>
      <Copy kind="caption">Class</Copy>
      {large ? (
        // The largest text sizes cannot fit two chips on a line, and a sideways scroll hides the second: stack them.
        <View style={{ gap: 8, alignItems: "flex-start" }}>{chipList}</View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
          {chipList}
        </ScrollView>
      )}
    </View>
  );
}

function ChildRow({
  child,
  dates,
  classId,
  divider,
}: {
  child: IndividualAttendanceChild;
  dates: string[];
  classId: string;
  divider: boolean;
}) {
  const { colors } = useAppTheme();
  const large = useLargeType();
  const name = getChildFullName(child);
  const meetings = recentMeetings({ dates }, child);
  return (
    <View style={[{ padding: 14, gap: 10 }, divider && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
      {/* At the largest text sizes the name and the rate cannot share a line without splitting words: stack them. */}
      <View style={{ flexDirection: large ? "column" : "row", alignItems: "flex-start", gap: large ? 4 : 10 }}>
        <View style={{ flex: large ? undefined : 1, minWidth: 0, gap: 4, alignItems: "flex-start" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${name}${child.onRoster ? "" : ", former roster member"}, view weekly attendance`}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            onPress={() => router.push(childAttendanceRoute(classId, child))}
            style={({ pressed }) => ({ maxWidth: "100%", opacity: pressed ? 0.6 : 1 })}
          >
            <Copy color={colors.primary} style={{ fontSize: 16, fontWeight: "600" }}>{name}</Copy>
          </Pressable>
          {!child.onRoster && <FormerPill />}
        </View>
        <View accessible accessibilityLabel={`Attendance ${rateText(child.rate)}`} style={{ alignItems: large ? "flex-start" : "flex-end" }}>
          <Copy style={{ fontSize: 20, fontWeight: "700", color: rateColor(child.rate, colors) }}>{rateText(child.rate)}</Copy>
        </View>
      </View>
      <Copy kind="caption" accessibilityLabel={childSpoken(child)}>
        Present {child.counts.present} · Late {child.counts.late} · Absent {child.counts.absent}
      </Copy>
      <View
        accessible
        accessibilityLabel={`Latest meetings, newest first: ${meetings.map((m) => `${meetingDateLabel(m.date, false)} ${markLabel(m.status)}`).join(", ")}`}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
      >
        {meetings.map((meeting) => (
          <MeetingMark key={meeting.date} date={meeting.date} status={meeting.status} />
        ))}
      </View>
    </View>
  );
}

function Problem({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card>
      <View accessibilityRole="alert" accessible>
        <Copy>{message}</Copy>
      </View>
      {!!onRetry && <Button label="Try again" onPress={onRetry} />}
    </Card>
  );
}
