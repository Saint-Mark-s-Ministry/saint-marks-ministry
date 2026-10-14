import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Copy } from "./ui";
import { useAction } from "./forms";
import { useAuth } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";

export function ViewAsBanner() {
  const { user, viewingAs, viewAs, switchingIdentity } = useAuth();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const action = useAction();
  if (!viewingAs) return null;
  const busy = action.busy || switchingIdentity;
  return <View style={{ paddingTop: insets.top, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: colors.primarySoft }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel="Change viewed account" onPress={() => router.push("/view-as")} style={{ flex: 1, minHeight: 44, justifyContent: "center" }}>
        <Copy kind="caption" color={colors.text}>View as · Read-only</Copy>
        <Copy numberOfLines={1} style={{ fontWeight: "600" }}>{user?.name ?? user?.email}</Copy>
      </Pressable>
      <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel="Stop viewing as this user" onPress={() => void action.run(async () => { await viewAs(null); })} style={{ minWidth: 44, minHeight: 44, justifyContent: "center" }}>
        <Copy color={colors.text} style={{ fontWeight: "600" }}>{busy ? "Stopping…" : "Stop"}</Copy>
      </Pressable>
    </View>
  </View>;
}
