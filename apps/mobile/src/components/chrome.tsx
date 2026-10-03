import { useEffect, useState, type PropsWithChildren } from "react";
import {
  AccessibilityInfo,
  Platform,
  View,
  type ViewStyle,
} from "react-native";
import { Stack } from "expo-router";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { serifDisplay, serifHeading, useAppTheme } from "@/theme";

export function SectionStack() {
  const { colors } = useAppTheme();
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerLargeTitle: Platform.OS === "ios",
        headerLargeTitleStyle: { fontFamily: serifDisplay },
        headerTitleStyle: { fontFamily: serifHeading },
      }}
    />
  );
}

// Glass belongs to controls. Content cards always use an opaque surface.
export function GlassChrome({
  children,
  style,
  interactive = false,
}: PropsWithChildren<{ style?: ViewStyle; interactive?: boolean }>) {
  const { colors, isDark } = useAppTheme();
  const [reduceTransparency, setReduceTransparency] = useState(true);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (mounted) setReduceTransparency(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setReduceTransparency,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  if (
    Platform.OS === "ios" &&
    !reduceTransparency &&
    isGlassEffectAPIAvailable() &&
    isLiquidGlassAvailable()
  ) {
    return (
      <GlassView
        glassEffectStyle="regular"
        isInteractive={interactive}
        colorScheme={isDark ? "dark" : "light"}
        style={style}
      >
        {children}
      </GlassView>
    );
  }
  return (
    <View
      style={[
        style,
        {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
      ]}
    >
      {children}
    </View>
  );
}
