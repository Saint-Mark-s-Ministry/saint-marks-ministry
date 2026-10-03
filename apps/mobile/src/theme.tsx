import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Appearance,
  Easing,
  StyleSheet,
  View,
  useColorScheme,
} from "react-native";

// Mirrors app/globals.css: the website's neutral surfaces and Sunday School
// maroon scale are the source of truth for native color decisions.
//
// The UI/UX reference pairs a dark theme with a gold accent (selected tab,
// icons, chips) and reserves burgundy for filled call-to-action buttons —
// burgundy text/icons directly on a near-black background reads poorly, but
// burgundy *inside* a solid button has its own contrast against the white
// label, so `action` (button fills) stays burgundy in both modes while
// `primary` (accents drawn straight on the background) switches to gold in
// dark mode only. Light mode already matches the reference there.
const light = {
  background: "#F7F7F5",
  surface: "#FFFFFF",
  text: "#0A0A0A",
  muted: "#737373",
  border: "#E5E5E5",
  primary: "#6B001A",
  primarySoft: "#F2ECEE",
  action: "#800020",
  onAction: "#FFFFFF",
  success: "#16A34A",
  successSoft: "#F0FDF4",
  warning: "#A16207",
  warningSoft: "#FEFCE8",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
  hero: "#5C1A1A",
  onHero: "#FFFFFF",
};
const dark: typeof light = {
  background: "#111113",
  surface: "#1C1C1E",
  text: "#F5F5F7",
  muted: "#98989D",
  border: "rgba(255, 255, 255, 0.08)",
  primary: "#CBA135",
  primarySoft: "rgba(255, 255, 255, 0.09)",
  action: "#800020",
  onAction: "#FFFFFF",
  success: "#4ADE80",
  successSoft: "rgba(20, 83, 45, 0.45)",
  warning: "#FACC15",
  warningSoft: "rgba(113, 63, 18, 0.45)",
  danger: "#FF6467",
  dangerSoft: "rgba(127, 29, 29, 0.45)",
  hero: "#5C1A1A",
  onHero: "#FFFFFF",
};

// The reference's serif display headings, loaded via @expo-google-fonts so no
// font files need to be vendored by hand. Body/caption text stays the system
// sans — only titles and section headings switch over (see components/ui.tsx).
export const serifDisplay = "PlayfairDisplay_700Bold";
export const serifHeading = "PlayfairDisplay_600SemiBold";

export type AppearancePreference = "system" | "light" | "dark";
type ResolvedAppearance = "light" | "dark";

const ThemeContext = createContext<{
  colors: typeof light;
  isDark: boolean;
  preference: AppearancePreference;
  setPreference: (value: AppearancePreference) => void;
} | null>(null);

export function AppThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const initialScheme: ResolvedAppearance = system === "dark" ? "dark" : "light";
  const [preference, setStoredPreference] =
    useState<AppearancePreference>("system");
  const [scheme, setScheme] = useState<ResolvedAppearance>(initialScheme);
  const [veilColor, setVeilColor] = useState(
    initialScheme === "dark" ? dark.background : light.background,
  );
  const veilOpacity = useRef(new Animated.Value(0)).current;
  const preferenceRef = useRef<AppearancePreference>("system");
  const schemeRef = useRef(initialScheme);
  const systemSchemeRef = useRef(initialScheme);
  const reduceMotionRef = useRef(false);
  const transitionRef = useRef(0);
  const isDark = scheme === "dark";
  const colors = isDark ? dark : light;

  const transitionTo = useCallback(
    (nextScheme: ResolvedAppearance) => {
      const transition = ++transitionRef.current;
      veilOpacity.stopAnimation();

      if (nextScheme === schemeRef.current) {
        veilOpacity.setValue(0);
        return;
      }

      if (reduceMotionRef.current) {
        schemeRef.current = nextScheme;
        setScheme(nextScheme);
        veilOpacity.setValue(0);
        return;
      }

      setVeilColor(
        nextScheme === "dark" ? dark.background : light.background,
      );
      Animated.timing(veilOpacity, {
        toValue: 0.72,
        duration: 130,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || transition !== transitionRef.current) return;

        schemeRef.current = nextScheme;
        setScheme(nextScheme);
        requestAnimationFrame(() => {
          Animated.timing(veilOpacity, {
            toValue: 0,
            duration: 220,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }).start();
        });
      });
    },
    [veilOpacity],
  );

  const setPreference = useCallback(
    (value: AppearancePreference) => {
      if (value === preferenceRef.current) return;
      preferenceRef.current = value;
      setStoredPreference(value);
      transitionTo(value === "system" ? systemSchemeRef.current : value);
    },
    [transitionTo],
  );

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) reduceMotionRef.current = enabled;
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        reduceMotionRef.current = enabled;
      },
    );
    return () => {
      mounted = false;
      subscription.remove();
      transitionRef.current += 1;
      veilOpacity.stopAnimation();
    };
  }, [veilOpacity]);

  useEffect(() => {
    if (preferenceRef.current !== "system") return;
    const nextScheme: ResolvedAppearance =
      system === "dark" ? "dark" : "light";
    systemSchemeRef.current = nextScheme;
    transitionTo(nextScheme);
  }, [system, transitionTo]);

  useEffect(() => {
    if (typeof Appearance?.setColorScheme !== "function") return;
    Appearance.setColorScheme(
      preference === "system" ? "unspecified" : preference,
    );
    return () => Appearance?.setColorScheme?.("unspecified");
  }, [preference]);
  return (
    <ThemeContext.Provider
      value={{
        colors,
        isDark,
        preference,
        setPreference,
      }}
    >
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {children}
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.transitionVeil,
            { backgroundColor: veilColor, opacity: veilOpacity },
          ]}
        />
      </View>
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("AppThemeProvider is missing");
  return value;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  transitionVeil: { zIndex: 1000 },
});
