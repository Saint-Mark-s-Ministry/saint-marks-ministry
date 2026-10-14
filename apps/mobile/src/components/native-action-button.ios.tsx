import { useState } from "react";
import { Platform, View } from "react-native";
import { Button, Host, Text as SwiftText } from "@expo/ui/swift-ui";
import {
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
  foregroundStyle,
  frame,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useAppTheme } from "@/theme";
import type { NativeActionButtonProps } from "./native-action-button";

// The glass button styles exist only on iOS 26 and later. Below that, SwiftUI's
// "automatic" style drops the filled capsule, so primary actions would read as
// plain text. Use the bordered styles there instead.
const SUPPORTS_GLASS = parseInt(String(Platform.Version), 10) >= 26;

export function NativeActionButton({
  label,
  onPress,
  secondary = false,
  disabled = false,
  testID,
  glass = false,
}: NativeActionButtonProps) {
  const { colors, isDark } = useAppTheme();
  const [width, setWidth] = useState(0);
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ alignSelf: "stretch", height: 52 }}
    >
      {width > 0 && (
        <Host
          colorScheme={isDark ? "dark" : "light"}
          seedColor={secondary || glass ? colors.primary : colors.action}
          style={{ width, height: 52 }}
        >
          <Button
            onPress={onPress}
            testID={testID}
            modifiers={[
              buttonStyle(
                glass || secondary
                  ? SUPPORTS_GLASS ? "glass" : "bordered"
                  : SUPPORTS_GLASS ? "glassProminent" : "borderedProminent",
              ),
              buttonBorderShape("capsule"),
              controlSize("large"),
              tint(secondary || glass ? colors.primary : colors.action),
              disabledModifier(disabled),
            ]}
          >
            <SwiftText
              modifiers={[
                foregroundStyle(
                  secondary || glass
                    ? isDark
                      ? colors.text
                      : colors.primary
                    : colors.onAction,
                ),
                frame({ width: Math.max(0, width - 32), minHeight: 28 }),
              ]}
            >
              {label}
            </SwiftText>
          </Button>
        </Host>
      )}
    </View>
  );
}
