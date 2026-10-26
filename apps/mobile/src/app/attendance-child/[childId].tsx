import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { getChildFullName } from "@stmark/domain";
import { Button, Card, Copy, Icon, ListSurface, Screen, StatusPill } from "@/components/ui";
import { FormerPill, markColors, rateColor, useLargeType } from "@/components/attendance-history-parts";
import {
  CLASS_HISTORY_PROBLEM_MESSAGE,
  MARK,
  NO_MEETINGS_MESSAGE,
  RATE_NOTE,
  UNRECORDED,
  childMeetings,
  childSpoken,
  meetingDateLabel,
  rateText,
} from "@/data/individual-attendance";
import { useIndividualAttendance } from "@/data/use-individual-attendance";
import { MinistryTintProvider, serifHero, useAppTheme } from "@/theme";

/**
 * One child's saved weekly attendance in a class, newest first, from the class
 * history payload (so a former roster member is included, and only their marks
 * in this class). Read-only; the screen underneath keeps its pending marks.
 */
export default function ChildAttendanceSheet() {
  const params = useLocalSearchParams<{ childId?: string; classId?: string; name?: string }>();
  const classId = params.classId ?? null;
  const { history, problem, loading, retry } = useIndividualAttendance(classId);
  const { colors } = useAppTheme();
  const large = useLargeType();
  const child = history?.children.find((row) => row.id === params.childId);
  const name = child ? getChildFullName(child) : params.name || "Child";

  return (
    <MinistryTintProvider ministry="sundaySchool">
      <Stack.Screen
        options={{
          title: "Attendance",
          headerRight:
            Platform.OS === "android"
              ? () => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close attendance history"
                    onPress={() => router.back()}
                    style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
                  >
                    <Icon ios="xmark" android="close" />
                  </Pressable>
                )
              : undefined,
        }}
      />
      {Platform.OS === "ios" && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button accessibilityLabel="Close attendance history" icon="xmark" onPress={() => router.back()} />
        </Stack.Toolbar>
      )}
      <Screen refreshing={false} onRefresh={classId ? () => void retry() : undefined}>
        <View style={{ gap: 6, alignItems: "flex-start" }}>
          <Copy accessibilityLabel={name} style={{ ...serifHero, fontSize: 24, lineHeight: 28 }}>{name}</Copy>
          {!!history && <Copy kind="caption">{history.classroom.name}</Copy>}
          {!!child && !child.onRoster && <FormerPill />}
        </View>

        {!classId && <Problem message="This child can't be opened." />}

        {!!classId && loading && (
          <View accessibilityRole="progressbar" accessibilityLabel="Loading attendance history" style={{ paddingVertical: 28, alignItems: "center", gap: 8 }}>
            <ActivityIndicator color={colors.primary} />
            <Copy kind="caption">Loading attendance history…</Copy>
          </View>
        )}

        {!!problem && (
          <Problem message={CLASS_HISTORY_PROBLEM_MESSAGE[problem]} onRetry={problem === "retry" ? () => void retry() : undefined} />
        )}

        {!!history && !child && (
          <Problem message="This child is no longer in this class's attendance history. Go back and refresh." />
        )}

        {!!history && !!child && (
          <>
            <Card>
              <View
                accessible
                accessibilityLabel={childSpoken(child)}
                style={{ flexDirection: large ? "column" : "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}
              >
                <Stat label="Rate" value={rateText(child.rate)} color={rateColor(child.rate, colors)} />
                <Stat label="Present" value={String(child.counts.present)} />
                <Stat label="Late" value={String(child.counts.late)} />
                <Stat label="Absent" value={String(child.counts.absent)} />
                <Stat label="Excused" value={String(child.counts.excused)} />
              </View>
              <Copy kind="caption">{RATE_NOTE}</Copy>
            </Card>

            {!history.dates.length ? (
              <Problem message={NO_MEETINGS_MESSAGE} />
            ) : (
              <ListSurface>
                {childMeetings(history, child).map((meeting, index, all) => {
                  const mark = markColors(meeting.status, colors);
                  const label = meeting.status ? MARK[meeting.status].label : UNRECORDED;
                  return (
                    <View
                      key={meeting.date}
                      accessible
                      accessibilityLabel={`${meetingDateLabel(meeting.date)}, ${label}`}
                      style={[
                        { padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
                        index < all.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                      ]}
                    >
                      <Copy style={{ flex: 1, minWidth: 0 }}>{meetingDateLabel(meeting.date)}</Copy>
                      {meeting.status ? (
                        <StatusPill label={label} color={mark.color} soft={mark.soft} />
                      ) : (
                        <Copy kind="caption">{UNRECORDED}</Copy>
                      )}
                    </View>
                  );
                })}
              </ListSurface>
            )}
          </>
        )}
      </Screen>
    </MinistryTintProvider>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ alignItems: "flex-start", gap: 2, minWidth: 52 }}>
      <Copy kind="caption">{label}</Copy>
      <Copy style={{ fontWeight: "700", fontSize: 18, color: color ?? colors.text }}>{value}</Copy>
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
