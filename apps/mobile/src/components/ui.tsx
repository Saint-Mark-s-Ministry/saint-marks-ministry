import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  Animated,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SymbolView, type SFSymbol, type AndroidSymbol } from "expo-symbols";
import { useFocusEffect } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { serifDisplay, useAppTheme } from "@/theme";
import { dataLabel, useAuth } from "@/data/auth-provider";
import { NativeActionButton } from "./native-action-button";

export function Icon({
  ios,
  android,
  size = 22,
  color,
}: {
  ios: SFSymbol;
  android: AndroidSymbol;
  size?: number;
  color?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <SymbolView
      name={{ ios, android }}
      size={size}
      tintColor={color ?? colors.primary}
    />
  );
}

export function Screen({
  children,
  bottom = 32,
  refreshing = false,
  onRefresh,
  adjustForKeyboard = true,
  resetOnFocus = false,
}: PropsWithChildren<{
  bottom?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
  adjustForKeyboard?: boolean;
  resetOnFocus?: boolean;
}>) {
  const { colors } = useAppTheme();
  const scrollRef = useRef<ScrollView>(null);
  const topOffsetRef = useRef<number | null>(null);
  const userInteractedRef = useRef(false);
  const hasFocusedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!resetOnFocus) return;
      if (!hasFocusedRef.current) {
        hasFocusedRef.current = true;
        return;
      }

      // Native tabs intentionally preserve each tab's scroll position. These
      // primary destinations should instead reopen at their real system top.
      // The real top offset is captured from the native scroll view before the
      // first user drag. It is negative on iOS when a large-title navigation
      // bar contributes an adjusted inset; the reported contentInset remains
      // zero in that case, and scrolling to y=0 would collapse the title.
      let secondFrame: number | null = null;
      const firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          if (topOffsetRef.current === null) return;
          scrollRef.current?.scrollTo({
            y: topOffsetRef.current,
            animated: false,
          });
        });
      });
      return () => {
        cancelAnimationFrame(firstFrame);
        if (secondFrame !== null) cancelAnimationFrame(secondFrame);
      };
    }, [resetOnFocus]),
  );
  const captureTopOffset = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (userInteractedRef.current) return;
      const offset = event.nativeEvent.contentOffset.y;
      if (topOffsetRef.current === null) {
        topOffsetRef.current = offset;
      }
    },
    [],
  );
  return (
    <ScrollView
      ref={scrollRef}
      onScroll={captureTopOffset}
      onScrollBeginDrag={() => {
        userInteractedRef.current = true;
      }}
      scrollToOverflowEnabled={resetOnFocus}
      scrollEventThrottle={32}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets={adjustForKeyboard}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        ) : undefined
      }
      contentContainerStyle={[styles.screen, { paddingBottom: bottom }]}
    >
      {children}
    </ScrollView>
  );
}

export function Copy({
  children,
  kind = "body",
  color,
  style,
  numberOfLines,
  accessibilityLabel,
}: PropsWithChildren<{
  kind?: "title" | "heading" | "body" | "caption" | "eyebrow";
  color?: string;
  style?: StyleProp<import("react-native").TextStyle>;
  numberOfLines?: number;
  accessibilityLabel?: string;
}>) {
  const { colors } = useAppTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles[kind],
        {
          color:
            color ??
            (kind === "caption" || kind === "eyebrow"
              ? colors.muted
              : colors.text),
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function CopyableValue({
  value,
  label,
  kind = "body",
}: {
  value: string;
  label: string;
  kind?: "body" | "caption";
}) {
  const { colors } = useAppTheme();
  const [copied, setCopied] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    opacity.stopAnimation();
  }, [opacity]);
  const transition = (next: boolean) => {
    opacity.stopAnimation();
    Animated.timing(opacity, {
      toValue: 0,
      duration: 90,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setCopied(next);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    });
  };
  const copy = async () => {
    await Clipboard.setStringAsync(value);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    transition(true);
    resetTimer.current = setTimeout(() => transition(false), 1100);
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Copy ${label}`}
      accessibilityHint={value}
      onPress={() => void copy()}
      style={({ pressed }) => [
        styles.copyable,
        {
          backgroundColor: pressed ? colors.primarySoft : "transparent",
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <View style={{ gap: 2 }}>
        <Copy kind="caption">{label}</Copy>
        <View>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Copy kind={kind} style={{ opacity: 0 }}>
              {value}
            </Copy>
          </View>
          <Animated.View
            pointerEvents="none"
            style={[
              { position: "absolute", inset: 0 },
              { opacity },
            ]}
          >
            <Copy kind={kind} color={copied ? colors.success : undefined}>
              {copied ? "Copied" : value}
            </Copy>
          </Animated.View>
        </View>
      </View>
    </Pressable>
  );
}

export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function ListSurface({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        styles.listSurface,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
  testID,
  glass = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  testID?: string;
  glass?: boolean;
}) {
  return (
    <NativeActionButton
      label={label}
      secondary={secondary}
      disabled={disabled}
      testID={testID}
      glass={glass}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
          () => undefined,
        );
        onPress();
      }}
    />
  );
}

export function ConnectionBadge() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  if (user?.role !== "SUPER_ADMIN") return null;
  return (
    <View
      style={[
        styles.pill,
        { alignSelf: "flex-start", backgroundColor: colors.warningSoft },
      ]}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.warning,
        }}
      />
      <Copy kind="caption" color={colors.warning}>
        {dataLabel}
      </Copy>
    </View>
  );
}

export function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export function InitialsAvatar({
  name,
  size = 32,
  variant = "accent",
}: {
  name?: string | null;
  size?: number;
  /**
   * "accent": the signed-in account's own avatar (header, Account screen) —
   * tinted with the active ministry's accent, per the design source.
   * "neutral": someone else's avatar in a list (students, mentors, people
   * search results) — plain gray regardless of ministry, also per source.
   */
  variant?: "accent" | "neutral";
}) {
  const { colors } = useAppTheme();
  const bg = variant === "accent" ? colors.primarySoft : colors.hover;
  const fg = variant === "accent" ? colors.primary : colors.text2;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
      }}
    >
      <Text
        style={{
          color: fg,
          fontWeight: "600",
          fontSize: size * 0.38,
          letterSpacing: 0.3,
        }}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

export function Brand() {
  return (
    <View style={styles.row}>
      <Image
        source={require("../../../../public/sunday-school-favicon.png")}
        style={{ width: 44, height: 44 }}
        resizeMode="contain"
        accessibilityLabel="St. Mark church logo"
      />
      <View>
        <Copy kind="heading">St. Mark</Copy>
        <Copy kind="caption">MINISTRY PORTAL</Copy>
      </View>
    </View>
  );
}

export function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={{ gap: 5 }}>
      <Copy kind="heading">{title}</Copy>
      {subtitle && <Copy kind="caption">{subtitle}</Copy>}
    </View>
  );
}

/**
 * Placeholder for a destination whose real content ships in a later update
 * (SMM-32–61 own Servants Prep page content; this shell only owns the
 * destination existing and being reachable by the right roles).
 */
export function ComingSoon({
  title,
  icon,
}: {
  title: string;
  icon: SFSymbol;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: 32,
      }}
    >
      <Icon ios={icon} android="schedule" size={34} color={colors.muted} />
      <Copy kind="heading" style={{ textAlign: "center" }}>
        {title}
      </Copy>
      <Copy kind="caption" style={{ textAlign: "center" }}>
        Coming soon.
      </Copy>
    </View>
  );
}

export function RowLink({
  title,
  subtitle,
  onPress,
  icon,
  trailing,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.rowLink, { opacity: pressed ? 0.65 : 1 }]}
    >
      {icon}
      <View style={{ flex: 1, gap: 4 }}>
        <Copy style={{ fontWeight: "600" }}>{title}</Copy>
        {subtitle && <Copy kind="caption">{subtitle}</Copy>}
      </View>
      {trailing}
      <Icon
        ios="chevron.right"
        android="chevron_right"
        size={16}
        color={colors.muted}
      />
    </Pressable>
  );
}

export function CompactRow({
  title,
  subtitle,
  onPress,
  icon,
  trailing,
  divider = false,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  divider?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => [
        styles.compactRow,
        divider && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        { backgroundColor: pressed ? colors.primarySoft : "transparent" },
      ]}
    >
      {icon}
      <View style={{ flex: 1, gap: 2 }}>
        <Copy style={{ fontWeight: "600" }}>{title}</Copy>
        {subtitle && <Copy kind="caption">{subtitle}</Copy>}
      </View>
      {trailing}
      <Icon
        ios="chevron.right"
        android="chevron_right"
        size={14}
        color={colors.muted}
      />
    </Pressable>
  );
}

/** The small dot+label pill used for eligibility/status/activity badges — matches the design source's status chips exactly (dot, not color-only). */
export function StatusPill({
  label,
  color,
  soft,
}: {
  label: string;
  color: string;
  soft: string;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: soft }]}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Copy kind="caption" color={color}>
        {label}
      </Copy>
    </View>
  );
}

/** The 50px circular Call/Message/Email action buttons on Student detail. */
export function CircleIconButton({
  ios,
  android,
  label,
  onPress,
}: {
  ios: SFSymbol;
  android: AndroidSymbol;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => ({
        width: 50,
        height: 50,
        borderRadius: 25,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.hover,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon ios={ios} android={android} size={20} color={colors.text} />
    </Pressable>
  );
}

export function CalendarDate({ date }: { date: string }) {
  const { colors } = useAppTheme();
  const value = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  return (
    <View style={[styles.calendar, { backgroundColor: colors.primarySoft }]}>
      <Copy kind="caption" color={colors.primary}>
        {value
          .toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
          .toUpperCase()}
      </Copy>
      <Copy kind="heading" color={colors.primary}>
        {value.getUTCDate()}
      </Copy>
    </View>
  );
}

export function readableDate(date: string) {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString(
    "en-US",
    { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" },
  );
}

export const styles = StyleSheet.create({
  screen: {
    padding: 22,
    gap: 20,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  title: {
    fontFamily: serifDisplay,
    fontSize: 34,
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  // Section/card headings stay system sans at weight 600 — the design
  // source only uses Newsreader for the page title and a few hero numbers
  // (see theme.tsx), not general headings.
  heading: { fontWeight: "600", fontSize: 21, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 23 },
  caption: { fontSize: 13, lineHeight: 19 },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.7,
    textTransform: "uppercase",
  },
  card: { borderWidth: 1, borderRadius: 22, padding: 18, gap: 14 },
  listSurface: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 60,
    paddingVertical: 6,
  },
  compactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 62,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  copyable: {
    minHeight: 48,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  calendar: {
    width: 56,
    minHeight: 64,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
});
