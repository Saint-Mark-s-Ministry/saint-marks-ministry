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
        // headerTintColor above is for bar buttons/back chevrons — the
        // design source keeps the title itself in neutral ink regardless of
        // ministry accent, so it needs its own explicit color here.
        headerLargeTitleStyle: { fontFamily: serifDisplay, color: colors.text },
        headerTitleStyle: { fontFamily: serifHeading, color: colors.text },
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
