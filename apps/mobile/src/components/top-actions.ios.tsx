import { Pressable } from "react-native";
import { router, Stack, type Href } from "expo-router";
import { InitialsAvatar } from "./ui";
import { useAuth } from "@/data/auth-provider";

/**
 * This file is the actual iOS implementation of TopActions (Metro resolves
 * `.ios.tsx` over the plain `.tsx` on iOS). Ministry switching lives on the
 * "More" page itself now (see components/ministry-switcher.tsx), not here.
 */
export function TopActions({
  unread = 0,
  notifications = false,
}: {
  unread?: number;
  notifications?: boolean;
}) {
  const { user } = useAuth();
  return (
    <Stack.Toolbar placement="right">
      {notifications && (
        <Stack.Toolbar.Button
          accessibilityLabel={`Notifications, ${unread} unread`}
          separateBackground
          onPress={() => router.push("/notifications")}
        >
          <Stack.Toolbar.Icon sf="bell" />
          <Stack.Toolbar.Label>Notifications</Stack.Toolbar.Label>
          {unread > 0 && (
            <Stack.Toolbar.Badge>{String(unread)}</Stack.Toolbar.Badge>
          )}
        </Stack.Toolbar.Button>
      )}
      {/* A person's monogram isn't one of the toolbar's fixed native
          primitives (icon/label/badge), so this is the one arbitrary-content
          slot (Stack.Toolbar.View) instead of Stack.Toolbar.Button. */}
      <Stack.Toolbar.View separateBackground>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Account"
          hitSlop={6}
          onPress={() => router.push("/account" as Href)}
          style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center" }}
        >
          <InitialsAvatar name={user?.name} size={30} />
        </Pressable>
      </Stack.Toolbar.View>
    </Stack.Toolbar>
  );
}
