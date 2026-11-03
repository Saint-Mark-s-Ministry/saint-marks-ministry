import { Pressable } from "react-native";
import { Copy } from "@/components/ui";
import { feedback } from "@/data/haptics";
import { useAppTheme } from "@/theme";

/**
 * The live exam's own capsule button. A plain Pressable, not the shared SwiftUI-hosted button: Start, Resume and Submit are the
 * actions a student cannot do without, and a native host that sizes itself from a layout pass was seen not to appear on the
 * Resume card. This always renders, takes Dynamic Type, and is found by its label.
 */
export function ExamActionButton({
  label,
  onPress,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        feedback("action");
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: 52,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 26,
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "stretch",
        backgroundColor: secondary ? colors.hover : colors.action,
        borderWidth: secondary ? 1 : 0,
        borderColor: colors.border,
        opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
      })}
    >
      <Copy maxFontSizeMultiplier={1.4} style={{ fontWeight: "600", textAlign: "center" }} color={secondary ? colors.primary : colors.onAction}>
        {label}
      </Copy>
    </Pressable>
  );
}
