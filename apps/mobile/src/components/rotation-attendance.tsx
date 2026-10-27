import { View } from "react-native";
import { router, type Href } from "expo-router";
import { Button, Copy, ListSurface, StatusPill, styles } from "@/components/ui";
import {
  ASYNC_BASIS_NOTE,
  ROTATION_COMPLETION_NOTE,
  ROTATION_WORKFLOW,
  activeRotation,
  rotationState,
  rotationWeekRows,
  type PrepAnalyticsSundaySchool,
  type RotationWeekState,
} from "@/data/rotation-attendance";
import { useAppTheme } from "@/theme";

/**
 * Where an async student is in their serving rotation, and which weeks count.
 * The weeks come from the server's analytics; this only labels them. A week
 * that has not started is "Upcoming" and is never drawn as a miss.
 */
export function RotationStatus({ sundaySchool, now }: { sundaySchool: PrepAnalyticsSundaySchool | null | undefined; now: Date }) {
  const { colors } = useAppTheme();
  const state = rotationState(sundaySchool, now);
  const active = activeRotation(sundaySchool);
  const weeks = active ? rotationWeekRows(active, now) : [];
  const tone = (value: RotationWeekState) =>
    value === "present"
      ? { color: colors.success, soft: colors.successSoft }
      : value === "missed"
        ? { color: colors.warning, soft: colors.warningSoft }
        : { color: colors.muted, soft: colors.hover };
  return (
    <ListSurface>
      <View style={{ padding: 16, gap: 4 }}>
        <Copy style={{ fontWeight: "600" }}>{state.title}</Copy>
        <Copy kind="caption">{state.detail}</Copy>
      </View>
      {weeks.map((week) => {
        const { color, soft } = tone(week.state);
        return (
          <View
            key={week.weekNumber}
            accessible
            accessibilityLabel={`Week ${week.weekNumber}, ${week.date}: ${week.label}`}
            style={[styles.compactRow, { borderTopWidth: 0.5, borderTopColor: colors.border }]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Copy style={{ fontWeight: "500" }}>Week {week.weekNumber}</Copy>
              <Copy kind="caption">{week.date}</Copy>
            </View>
            <StatusPill label={week.label} color={color} soft={soft} />
          </View>
        );
      })}
      {weeks.some((week) => week.state === "missed") && (
        <View style={{ padding: 16, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: colors.border }}>
          <Copy kind="caption">
            "Not credited" weeks count against the percentage until a servant approves your signed form, which credits all four weeks.
          </Copy>
        </View>
      )}
    </ListSurface>
  );
}

/** The signed four-week workflow and where it ends, for the student's own screen. */
export function RotationWorkflow() {
  const { colors } = useAppTheme();
  return (
    <ListSurface style={{ padding: 16, gap: 12 }}>
      <View style={{ gap: 10 }} accessibilityRole="list">
        {ROTATION_WORKFLOW.map((step, index) => (
          <View key={step} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }} accessible accessibilityLabel={`Step ${index + 1}: ${step}`}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.hover, alignItems: "center", justifyContent: "center" }}>
              <Copy kind="caption" style={{ fontWeight: "600" }}>{index + 1}</Copy>
            </View>
            <Copy style={{ flex: 1 }}>{step}</Copy>
          </View>
        ))}
      </View>
      <Copy kind="caption">{ROTATION_COMPLETION_NOTE}</Copy>
      <Button secondary label="Open rotations" onPress={() => router.push("/prep-serving" as Href)} />
    </ListSurface>
  );
}

/** For servants and mentors: an async student's attendance is rotation attendance, whatever lessons exist. */
export function AsyncBasisNote() {
  const { colors } = useAppTheme();
  return (
    <View style={{ padding: 14, borderRadius: 16, backgroundColor: colors.hover }}>
      <Copy kind="caption">{ASYNC_BASIS_NOTE}</Copy>
    </View>
  );
}
