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

// Exact tokens from the UI/UX reference's design-system page ("01 Color"),
// not approximations. Each ministry carries its own accent everywhere it
// shows up — tab tint, buttons, chips, icons — maroon for Servants Prep,
// gold for Sunday School; a screen reached outside either ministry's tab
// group (Account, Notifications, Academic years, the switcher sheet itself)
// falls back to the maroon/Prep identity, matching the reference's own
// default. See MinistryTintProvider / useAppTheme below for how the active
// ministry resolves `primary`/`action`/`onAction`/`primarySoft`.
const light = {
  background: "#F5F3F0", // canvas
  surface: "#FFFFFF",
  raised: "#FAF8F6",
  hover: "#F1EEEA",
  border: "#E6E1DB",
  borderStrong: "#D5CEC6",
  text: "#1B1817",
  text2: "#57504B",
  muted: "#736B65", // text-3, 4.5:1 min
  success: "#1E7A4C",
  successSoft: "#E5F2EA",
  warning: "#955A00",
  warningSoft: "#FEFCE8",
  danger: "#B93A26",
  dangerSoft: "#FEF2F2",
  info: "#2D5F9A",
  hero: "#5C1A1A",
  onHero: "#FFFFFF",
  // Prep: buttons/mark vs. the lighter "mode active" marker are the same
  // value in light mode (deep maroon reads fine directly on a light bg).
  accentPrep: "#800020",
  actionPrep: "#800020",
  // Sunday School: one gold value serves both roles in both themes — it's
  // already light enough to need dark ink, so there's no separate pastel
  // "marker" variant the way Prep needs on a dark background.
  accentGold: "#8A6A1C",
  onGold: "#1B1817",
};
const dark: typeof light = {
  background: "#131211",
  surface: "#1A1918",
  raised: "#201E1D",
  hover: "#282523",
  border: "#2B2826",
  borderStrong: "#3A3633",
  text: "#EEEAE6",
  text2: "#B6AFA9",
  muted: "#958E88",
  success: "#62C08E",
  successSoft: "rgba(98, 192, 142, 0.18)",
  warning: "#E6A94F",
  warningSoft: "rgba(113, 63, 18, 0.45)",
  danger: "#F0806F",
  dangerSoft: "rgba(127, 29, 29, 0.45)",
  info: "#86AEE0",
  hero: "#5C1A1A",
  onHero: "#FFFFFF",
  // Prep in dark mode splits the role: a pale rose for tint drawn straight
  // on the near-black background (tab icon/label, switcher chevron, today
  // marker), and a deeper rose for solid button fills, which has its own
  // contrast against the white label instead of against the page background.
  accentPrep: "#F08BA3",
  actionPrep: "#A3213F",
  accentGold: "#D6B062",
  onGold: "#1B1817",
};

function withAlpha(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// The reference's design source (not just the PDF export) specifies
// Newsreader for display text — confirmed against project/iOS-Home-*.dc.html's
// literal `font-family: 'Newsreader'` — not Playfair Display, which was a
// guess from screenshots alone. It's used narrowly: the big page title and a
// handful of hero numbers (e.g. "Lesson 2 of 11"), not general section
// headings — those stay system sans at weight 600, per the same source.
export const serifDisplay = "Newsreader_500Medium";
export const serifHeading = "Newsreader_500Medium";

export type AppearancePreference = "system" | "light" | "dark";
type ResolvedAppearance = "light" | "dark";

export type MinistryTint = "prep" | "sundaySchool";
const MinistryTintContext = createContext<MinistryTint>("prep");

/**
 * Wraps a ministry's screens so every `useAppTheme()` call inside them
 * resolves `primary`/`action`/`onAction`/`primarySoft` to that ministry's
 * accent. Wrap the (tabs) and (prep) tab-group layouts with this once each;
 * every nested screen inherits it automatically. A handful of root-level
 * routes that are Sunday-School content but sit outside the (tabs) group
 * (roster, visitations, feedback, etc.) wrap themselves individually.
 * Anything left unwrapped — Account, Notifications, the switcher sheet,
 * Academic years — falls back to "prep", matching the reference's own
 * default identity for cross-ministry chrome.
 */
export function MinistryTintProvider({
  ministry,
  children,
}: PropsWithChildren<{ ministry: MinistryTint }>) {
  return (
    <MinistryTintContext.Provider value={ministry}>
      {children}
    </MinistryTintContext.Provider>
  );
}

type BaseColors = typeof light;
export type ThemeColors = BaseColors & {
  primary: string;
  primarySoft: string;
  action: string;
  onAction: string;
};

const ThemeContext = createContext<{
  colors: BaseColors;
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
  const ministry = useContext(MinistryTintContext);
  const { colors: base, isDark } = value;
  const isGold = ministry === "sundaySchool";
  const primary = isGold ? base.accentGold : base.accentPrep;
  const colors: ThemeColors = {
    ...base,
    primary,
    primarySoft: withAlpha(primary, isDark ? 0.16 : 0.1),
    action: isGold ? base.accentGold : base.actionPrep,
    onAction: isGold ? base.onGold : "#FFFFFF",
  };
  return { ...value, colors };
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  transitionVeil: { zIndex: 1000 },
});
