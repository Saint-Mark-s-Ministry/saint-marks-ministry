import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Copy } from "./ui";
import { useAction } from "./forms";
import { useAuth } from "@/data/auth-provider";
import { viewAsRemainingLabel } from "@/data/view-as";
import { useAppTheme } from "@/theme";

export function ViewAsBanner() {
  const { user, viewingAs, viewAs, switchingIdentity } = useAuth();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const action = useAction();
  const [now, setNow] = useState(() => Date.now());
  const active = !!viewingAs;
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [active]);
  if (!viewingAs) return null;
  const remaining = viewAsRemainingLabel(viewingAs.expiresAt, now);
  const busy = action.busy || switchingIdentity;
  // The ministry tint is translucent for Sunday School; lay it over the page colour so the text always sits on a solid surface.
  return <View style={{ backgroundColor: colors.background }}><View style={{ paddingTop: insets.top, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: colors.primarySoft }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel="Change viewed account" accessibilityValue={{ text: `Read-only. ${remaining}` }} onPress={() => router.push("/view-as")} style={{ flex: 1, minHeight: 44, justifyContent: "center" }}>
        <Copy kind="caption" color={colors.text} maxFontSizeMultiplier={1.3}>View as · Read-only · {remaining}</Copy>
        <Copy numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontWeight: "600" }}>{user?.name ?? user?.email}</Copy>
      </Pressable>
      <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel="Stop viewing as this user" onPress={() => void action.run(async () => { await viewAs(null); })} style={{ minWidth: 44, minHeight: 44, justifyContent: "center" }}>
        <Copy color={colors.text} maxFontSizeMultiplier={1.3} style={{ fontWeight: "600" }}>{busy ? "Stopping…" : "Stop"}</Copy>
      </Pressable>
    </View>
  </View></View>;
}
