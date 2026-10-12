import { Button, Host } from "@expo/ui";
import { useAppTheme } from "@/theme";

export type NativeActionButtonProps = {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  testID?: string;
  glass?: boolean;
};

// Android resolves this implementation to native Material 3 controls. iOS has
// a platform file that opts into SwiftUI's Liquid Glass button styles.
export function NativeActionButton({
  label,
  onPress,
  secondary = false,
  disabled = false,
  testID,
}: NativeActionButtonProps) {
  const { colors, isDark } = useAppTheme();
  return (
    <Host
      colorScheme={isDark ? "dark" : "light"}
      seedColor={secondary ? colors.primary : colors.action}
      style={{ alignSelf: "stretch", height: 52 }}
    >
      <Button
        label={label}
        onPress={onPress}
        disabled={disabled}
        testID={testID}
        variant={secondary ? "outlined" : "filled"}
        style={{ width: "100%", height: 52, borderRadius: 16 }}
      />
    </Host>
  );
}
