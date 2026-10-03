import { router, Stack, type Href } from "expo-router";

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
      <Stack.Toolbar.Button
        accessibilityLabel="Account"
        separateBackground
        onPress={() => router.push("/account" as Href)}
      >
        <Stack.Toolbar.Icon sf="person.crop.circle.fill" />
        <Stack.Toolbar.Label>Account</Stack.Toolbar.Label>
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
}
