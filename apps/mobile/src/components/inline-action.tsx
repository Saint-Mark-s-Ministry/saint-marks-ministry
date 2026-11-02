import { Pressable } from "react-native";
import { Copy } from "@/components/ui";
import { feedback } from "@/data/haptics";
import { useAppTheme } from "@/theme";

/**
 * A small action inside a list row. A plain pressable rather than the app's native button: a list can hold dozens
 * of rows, and a SwiftUI host per button is both heavy and, at this count, not reliably drawn.
 */
export function InlineAction({ label, onPress, disabled, destructive = false, accessibilityLabel }: { label: string; onPress: () => void; disabled?: boolean; destructive?: boolean; accessibilityLabel?: string }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => { feedback("action"); onPress(); }}
      style={({ pressed }) => ({
        minHeight: 44, paddingHorizontal: 16, justifyContent: "center", borderRadius: 12, borderWidth: 1,
        borderColor: destructive ? colors.danger : colors.border, backgroundColor: pressed ? colors.hover : colors.surface,
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Copy style={{ fontSize: 14, fontWeight: "600" }} color={destructive ? colors.danger : colors.primary}>{label}</Copy>
    </Pressable>
  );
}
