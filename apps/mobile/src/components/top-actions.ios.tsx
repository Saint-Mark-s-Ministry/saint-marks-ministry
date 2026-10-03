import { router, Stack, type Href } from "expo-router";
import { useAuth } from "@/data/auth-provider";
import { usePortal } from "@/data/portal-provider";
import { availableMinistries, MINISTRY_NAMES, type Ministry } from "@/data/navigation";

/**
 * Mirrors the web MinistrySwitcher: only renders when more than one
 * ministry is available. This file is the actual iOS implementation of
 * TopActions (Metro resolves `.ios.tsx` over the plain `.tsx` on iOS).
 * Stack.Toolbar validates its direct children by component identity, so the
 * switcher's <Stack.Toolbar.Menu> must be inlined here rather than returned
 * from a wrapping component (that renders as an opaque "MinistryMenu" to
 * the toolbar and is rejected).
 */
export function TopActions({
  unread = 0,
  notifications = false,
  ministry = "sundaySchool",
}: {
  unread?: number;
  notifications?: boolean;
  ministry?: Ministry;
}) {
  const { user } = useAuth();
  const { classes } = usePortal();
  const ministryOptions = user ? availableMinistries(user, classes.length > 0) : [];
  return (
    <Stack.Toolbar placement="right">
      {ministryOptions.length > 1 && (
        <Stack.Toolbar.Menu
          accessibilityLabel="Switch ministry"
          separateBackground
          icon="arrow.triangle.2.circlepath"
          title="Switch ministry"
        >
          {ministryOptions.map((option) => (
            <Stack.Toolbar.MenuAction
              key={option.id}
              isOn={option.id === ministry}
              onPress={() => {
                if (option.id === ministry) return;
                router.replace(option.id === "prep" ? "/(prep)/home" : "/(tabs)/home");
              }}
            >
              {MINISTRY_NAMES[option.id]}
            </Stack.Toolbar.MenuAction>
          ))}
        </Stack.Toolbar.Menu>
      )}
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
