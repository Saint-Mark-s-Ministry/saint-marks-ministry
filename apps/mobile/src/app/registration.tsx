import { Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import { Copy, Icon, ListSurface, RowLink, Screen } from "@/components/ui";
import { serifDisplay, useAppTheme } from "@/theme";

// The chooser/entry flow this ticket's own Scope calls for — no artboard
// depicts one (every Registration/sign-up artboard is a destination form
// already past this step), so this list is built from that Scope text,
// matching this app's own established "destination list" convention
// (Ministry switcher, More) rather than inventing new visual language.
export default function Registration() {
  const { colors } = useAppTheme();
  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <Screen>
        <View style={{ paddingHorizontal: 4, gap: 4 }}>
          <Copy style={{ fontFamily: serifDisplay, fontSize: 34, lineHeight: 36, fontWeight: "500" }}>
            Get started
          </Copy>
          <Copy kind="caption">Choose how you&apos;d like to join St. Mark Ministry Portal.</Copy>
        </View>

        <ListSurface>
          <RowLink
            title="Servants Prep registration"
            subtitle="For new applicants with an invite code"
            icon={<Icon ios="person.badge.plus" android="person_add" size={18} color={colors.primary} />}
            onPress={() => router.push("/registration/apply")}
          />
          <View style={{ height: 0.5, marginLeft: 58, backgroundColor: colors.border }} />
          <RowLink
            title="Sign up as a parent"
            subtitle="Create an account to register your child"
            icon={<Icon ios="person.2" android="people" size={18} color={colors.primary} />}
            onPress={() => router.push("/signup/parent")}
          />
          <View style={{ height: 0.5, marginLeft: 58, backgroundColor: colors.border }} />
          <RowLink
            title="Sign up as a servant"
            subtitle="Request Sunday School servant access"
            icon={<Icon ios="hands.sparkles" android="volunteer_activism" size={18} color={colors.warning} />}
            onPress={() => router.push("/signup/servant")}
          />
        </ListSurface>

        <Pressable accessibilityRole="button" accessibilityLabel="Already have an account? Sign in" onPress={() => router.back()}>
          <Copy style={{ textAlign: "center", fontWeight: "500" }} color={colors.primary}>
            Already have an account? Sign in
          </Copy>
        </Pressable>
      </Screen>
    </>
  );
}
