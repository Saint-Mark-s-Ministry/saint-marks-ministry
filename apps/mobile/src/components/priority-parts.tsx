import { Pressable, View } from "react-native";
import { Copy, Icon, StatusPill } from "@/components/ui";
import { PRIORITY_LABEL, priorityToggleLabel } from "@/data/visitation-priority";
import type { PriorityNotice } from "@/data/use-visitation-priority";
import { useAppTheme } from "@/theme";

/** The star beside a child: a 44pt control apart from the row's own tap. */
export function PriorityStar({
  name,
  on,
  saving,
  onToggle,
}: {
  name: string;
  on: boolean;
  saving: boolean;
  onToggle: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={priorityToggleLabel(name, on)}
      accessibilityState={{ selected: on, busy: saving }}
      disabled={saving}
      onPress={onToggle}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: on ? colors.warningSoft : pressed ? colors.primarySoft : colors.hover,
        opacity: saving ? 0.55 : 1,
      })}
    >
      <Icon ios={on ? "star.fill" : "star"} android={on ? "star" : "star_border"} size={18} color={on ? colors.warning : colors.text2} />
    </Pressable>
  );
}

/** The visible label, for everyone who can see the flag, whether or not they can change it. */
export function PriorityPill() {
  const { colors } = useAppTheme();
  return <StatusPill label={PRIORITY_LABEL} color={colors.warning} soft={colors.warningSoft} />;
}

/** Said after a save, or why it did not stick; read out by a screen reader. */
export function PriorityNoticeBanner({ notice, onDismiss }: { notice: PriorityNotice | null; onDismiss: () => void }) {
  const { colors } = useAppTheme();
  if (!notice) return null;
  const error = notice.kind === "error";
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole={error ? "alert" : undefined}
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        padding: 14,
        borderRadius: 18,
        backgroundColor: error ? colors.dangerSoft : colors.hover,
      }}
    >
      <Copy style={{ flex: 1 }} color={error ? colors.danger : colors.text2}>{notice.message}</Copy>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss message" onPress={onDismiss} hitSlop={8} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: -12, marginRight: -8 }}>
        <Icon ios="xmark" android="close" size={14} color={colors.muted} />
      </Pressable>
    </View>
  );
}
