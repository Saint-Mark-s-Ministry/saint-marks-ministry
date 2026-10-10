import { View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Button, Copy, Icon, Screen } from "@/components/ui";
import { useAppTheme } from "@/theme";

/**
 * The artboard's "Roster sign-up" / "Roster sign-up done" flow — a public,
 * per-class shareable link that places a child directly onto a real class
 * roster with no review step (confirmed against the "done" artboard's own
 * copy: "[Child name] is on the Grade 3 Girls roster").
 *
 * Verified before building: there is no backend for this anywhere — no
 * web page, no API route, no per-class invite/code model (exhaustively
 * grepped `prisma/schema.prisma`, `app/api`, and `app/` on both this
 * branch and `main`). Every other onboarding path in this ticket places a
 * new record behind review (Servants Prep registration) or creates only
 * the submitter's own account (Parent/Servant sign-up) — this one alone
 * would write directly into a real class roster with no gate at all, which
 * is a meaningfully different, more sensitive capability to invent on a
 * mobile ticket's own initiative. Rather than fabricate that server
 * behavior (or a form that submits nowhere), this screen is an honest
 * placeholder: if a `stmarkportal://roster-signup` link is ever opened, it
 * explains the real state plainly instead of presenting a dead or fake
 * form.
 */
export default function RosterSignup() {
  const { colors } = useAppTheme();
  const { class: className } = useLocalSearchParams<{ class?: string }>();

  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <Screen>
        <View style={{ alignItems: "center", gap: 10, paddingTop: 60 }}>
          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.hover, alignItems: "center", justifyContent: "center" }}>
            <Icon ios="person.badge.clock" android="schedule" size={32} color={colors.text2} />
          </View>
          <Copy style={{ fontWeight: "600", fontSize: 22, textAlign: "center" }}>
            {className ? `${className} sign-up isn't available yet` : "Roster sign-up isn't available yet"}
          </Copy>
          <Copy kind="caption" style={{ textAlign: "center", maxWidth: 300 }}>
            Direct class sign-up links aren&apos;t built yet. Register your child from a parent account, or contact the class&apos;s servants directly.
          </Copy>
          <Button label="Sign up as a parent" onPress={() => router.replace("/signup/parent")} />
        </View>
      </Screen>
    </>
  );
}
