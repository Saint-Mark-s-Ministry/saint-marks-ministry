import { useWindowDimensions, View } from "react-native";
import type { AttendanceStatus } from "@stmark/contracts";
import { Copy, StatusPill, styles } from "@/components/ui";
import { MARK, UNRECORDED, meetingDateLabel } from "@/data/individual-attendance";
import { rateTone } from "@/data/student-history";
import { useAppTheme } from "@/theme";

type Colors = ReturnType<typeof useAppTheme>["colors"];

export function markColors(status: AttendanceStatus | undefined, colors: Colors) {
  if (status === "PRESENT") return { color: colors.success, soft: colors.successSoft };
  if (status === "LATE") return { color: colors.warning, soft: colors.warningSoft };
  if (status === "ABSENT") return { color: colors.danger, soft: colors.dangerSoft };
  return { color: colors.muted, soft: colors.hover };
}

/** The rate's colour, by the same thresholds as the child's profile. */
export function rateColor(rate: number | null | undefined, colors: Colors) {
  const tone = rateTone(rate);
  return tone === "success" ? colors.success : tone === "warning" ? colors.warning : tone === "danger" ? colors.danger : colors.muted;
}

/** One saved mark as a letter chip; an unrecorded cell is a dash, never an absence. */
export function MarkChip({ status }: { status: AttendanceStatus | undefined }) {
  const { colors } = useAppTheme();
  const tone = markColors(status, colors);
  return (
    <View
      style={{
        minWidth: 30,
        minHeight: 30,
        paddingHorizontal: 6,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tone.soft,
      }}
    >
      <Copy kind="caption" color={tone.color} style={{ fontWeight: "700" }}>
        {status ? MARK[status].short : "—"}
      </Copy>
    </View>
  );
}

/** A date over its chip, so a strip of recent meetings reads as a row of columns. */
export function MeetingMark({ date, status }: { date: string; status: AttendanceStatus | undefined }) {
  return (
    <View style={{ alignItems: "center", gap: 3 }}>
      <Copy kind="caption" style={{ fontSize: 11 }}>
        {meetingDateLabel(date, false)}
      </Copy>
      <MarkChip status={status} />
    </View>
  );
}

export function FormerPill() {
  const { colors } = useAppTheme();
  return <StatusPill label="Former" color={colors.muted} soft={colors.hover} />;
}

/** Whether the largest Dynamic Type sizes need rows to stack instead of sit side by side. */
export function useLargeType() {
  // Reactive: a Dynamic Type change while the app is open re-renders the screen.
  return useWindowDimensions().fontScale > 1.6;
}

export function Legend() {
  const { colors } = useAppTheme();
  return (
    <View
      accessible
      accessibilityLabel={`P present, L late, A absent, E excused, dash ${UNRECORDED.toLowerCase()}`}
      style={[styles.row, { flexWrap: "wrap", gap: 8 }]}
    >
      {(Object.keys(MARK) as AttendanceStatus[]).map((status) => (
        <View key={status} style={[styles.row, { gap: 5 }]}>
          <MarkChip status={status} />
          <Copy kind="caption">{MARK[status].label}</Copy>
        </View>
      ))}
      <View style={[styles.row, { gap: 5 }]}>
        <MarkChip status={undefined} />
        <Copy kind="caption" color={colors.muted}>
          {UNRECORDED}
        </Copy>
      </View>
    </View>
  );
}
