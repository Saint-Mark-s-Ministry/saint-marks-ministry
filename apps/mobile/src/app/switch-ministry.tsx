import { Platform, Pressable, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { Copy, Icon, ListSurface, Screen, SectionTitle, styles } from "@/components/ui";
import { useAppTheme } from "@/theme";
import { useAuth } from "@/data/auth-provider";
import { usePortal } from "@/data/portal-provider";
import { availableMinistries, type Ministry } from "@/data/navigation";

/**
 * Formsheet presented from the ministry switcher pill on "More". Picking a
 * different ministry replaces the whole stack with that ministry's tab
 * group — native tab bars can't swap their own trigger set at runtime, so
 * this is the same route-replace the old toolbar switcher used.
 */
export default function SwitchMinistry() {
  const { current } = useLocalSearchParams<{ current: Ministry }>();
  const { user } = useAuth();
  const { classes } = usePortal();
  const { colors } = useAppTheme();
  const options = user ? availableMinistries(user, classes.length > 0) : [];
  return (
    <>
      <Stack.Screen
        options={{
          title: "Switch ministry",
          headerRight:
            Platform.OS === "android"
              ? () => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    onPress={() => router.back()}
                    style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
                  >
                    <Icon ios="xmark" android="close" />
                  </Pressable>
                )
              : undefined,
        }}
      />
      {Platform.OS === "ios" && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button accessibilityLabel="Close" icon="xmark" onPress={() => router.back()} />
        </Stack.Toolbar>
      )}
      <Screen>
        <View style={{ gap: 10 }}>
          <SectionTitle title="Ministries" subtitle="Everything connected to your account." />
          <ListSurface>
            {options.map((option, index) => (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected: option.id === current }}
                onPress={() => {
                  void Haptics.selectionAsync().catch(() => undefined);
                  if (option.id === current) {
                    router.back();
                    return;
                  }
                  router.replace(option.id === "prep" ? "/(prep)/home" : "/(tabs)/home");
                }}
                style={({ pressed }) => [
                  styles.compactRow,
                  index < options.length - 1 && {
                    borderBottomWidth: 0.5,
                    borderBottomColor: colors.border,
                  },
                  { backgroundColor: pressed ? colors.primarySoft : "transparent" },
                ]}
              >
                <Copy style={{ flex: 1, fontWeight: "600" }}>{option.name}</Copy>
                {option.id === current && (
                  <Icon ios="checkmark" android="check" size={18} color={colors.primary} />
                )}
              </Pressable>
            ))}
          </ListSurface>
          <Copy kind="caption">Sign in once to reach every ministry connected to your account.</Copy>
        </View>
      </Screen>
    </>
  );
}
