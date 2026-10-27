import { Pressable, View } from "react-native";
import { router, useSegments, type Href } from "expo-router";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Copy } from "./ui";
import { useDuo } from "@/data/use-duo";
import { dockItems, dockSelected, dockVisible, type DockMinistry } from "@/data/duo-layout";
import { useAppTheme } from "@/theme";

/**
 * The tab bar, kept on the trailing edge of a foldable on every screen. Inside the tab groups the system
 * draws its own vertical bar there; a screen pushed over the tabs (Take attendance, a lesson, a profile)
 * covers that bar, so this draws the same five tabs in the same place until the person goes back.
 * It renders nothing on any other device.
 */
export function DuoDock({ ministry, peopleLabel }: { ministry: DockMinistry; peopleLabel: string }) {
  const duo = useDuo();
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  const selectedRef = useRef("home");
  selectedRef.current = dockSelected(segments, selectedRef.current);
  if (!dockVisible(duo, segments)) return null;
  const items = dockItems(ministry, peopleLabel);
  const side = duo.verticalBarEdge === "leading" ? { left: 0 } : { right: 0 };
  const main = items.slice(0, -1);
  const search = items[items.length - 1];

  const renderItem = (item: (typeof items)[number]) => {
    const selected = item.name === selectedRef.current;
    const color = selected ? colors.primary : colors.muted;
    return (
      <Pressable
        key={item.name}
        accessibilityRole="tab"
        accessibilityLabel={item.label}
        accessibilityState={{ selected }}
        onPress={() => router.navigate(item.href as Href)}
        style={{ width: 61, minHeight: 56, alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 16, backgroundColor: selected ? colors.primarySoft : "transparent" }}
      >
        <SymbolView name={(selected ? item.sfSelected : item.sf) as SFSymbol} size={22} tintColor={color} accessibilityElementsHidden />
        <Copy kind="caption" color={color} maxFontSizeMultiplier={1} numberOfLines={1}>{item.label}</Copy>
      </Pressable>
    );
  };

  return (
    <View
      pointerEvents="box-none"
      accessibilityRole="tabbar"
      accessibilityLabel="Tabs"
      style={{ position: "absolute", top: 0, bottom: 0, width: Math.max(79, duo.insets.right || 0) || 79, ...side, justifyContent: "space-between", alignItems: "center", paddingTop: insets.top + 56, paddingBottom: insets.bottom + 12 }}
    >
      <View style={{ width: 69, alignItems: "center", gap: 4, paddingVertical: 8, borderRadius: 24, backgroundColor: isDark ? "rgba(28,28,30,0.86)" : "rgba(255,255,255,0.86)", borderWidth: 1, borderColor: colors.border }}>
        {main.map(renderItem)}
      </View>
      <View style={{ width: 69, alignItems: "center", paddingVertical: 8, borderRadius: 24, backgroundColor: isDark ? "rgba(28,28,30,0.86)" : "rgba(255,255,255,0.86)", borderWidth: 1, borderColor: colors.border }}>
        {renderItem(search)}
      </View>
    </View>
  );
}
