import { Linking, Pressable, View } from "react-native";
import { Copy } from "@/components/ui";
import { apiOrigin } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";

/**
 * Privacy Policy and Terms of Service, reachable from every screen that can be
 * seen before signing in (App Store guideline 5.1.1(i)). On a form that creates
 * an account or collects someone's details, `consent` adds the line that says
 * continuing means agreeing to them.
 */
export function LegalLinks({ consent = false }: { consent?: boolean }) {
  const { colors } = useAppTheme();
  const open = (path: string) => void Linking.openURL(`${apiOrigin}${path}`).catch(() => undefined);
  return (
    <View style={{ gap: 4, alignItems: "center", paddingTop: 8 }}>
      {consent && (
        <Copy kind="caption" style={{ textAlign: "center" }}>
          By continuing you agree to the Terms of Service and acknowledge the Privacy Policy.
        </Copy>
      )}
      <View style={{ flexDirection: "row", gap: 24, justifyContent: "center" }}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Privacy Policy, opens in your browser"
          hitSlop={8}
          onPress={() => open("/privacy")}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Copy kind="caption" color={colors.primary}>Privacy Policy</Copy>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Terms of Service, opens in your browser"
          hitSlop={8}
          onPress={() => open("/terms")}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Copy kind="caption" color={colors.primary}>Terms of Service</Copy>
        </Pressable>
      </View>
    </View>
  );
}
