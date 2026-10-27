import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, View } from "react-native";
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Newsreader_500Medium } from "@expo-google-fonts/newsreader";
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from "@expo-google-fonts/geist";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono";
import { AppThemeProvider, MinistryTintProvider, useAppTheme } from "@/theme";
import { AuthProvider, useAuth } from "@/data/auth-provider";
import { PortalProvider, usePortal } from "@/data/portal-provider";
import { defaultMinistry, ministryForSegments, type Ministry } from "@/data/navigation";
import { authenticatedRoutes, publicRoutes } from "@/data/route-access";
import { ViewAsBanner } from "@/components/view-as-banner";
import { AttendanceReminderBanner } from "@/components/attendance-reminder-banner";
import { DuoDiagnostics } from "@/components/duo-diagnostics";
import { DuoDock } from "@/components/duo-dock";
import { peopleTabLabel } from "@/data/duo-layout";
import { ActivityIndicator } from "react-native";
import LaunchScreen from "@/components/launch-screen";
import { useNavigationHeaderOptions } from "@/components/chrome";
import { AttendanceAccessory } from "@/components/attendance-accessory";
import { usePushNotificationRegistration } from "@/data/push-notifications";

export { ErrorBoundary } from "expo-router";
export const unstable_settings = { initialRouteName: "(tabs)" };

SplashScreen.setOptions({ duration: 500, fade: true });

// The signed-out counterpart to Navigation() below: its own real <Stack>,
// not a bare component, so sign-in and the public registration/sign-up
// screens (SMM-61) are real, addressable routes — reachable by a deep link,
// and able to push between each other — rather than one opaque screen with
// no navigator at all underneath it.
function AuthStack() {
  const headerOptions = useNavigationHeaderOptions();
  const { colors, isDark } = useAppTheme();
  const base = isDark ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          primary: colors.primary,
          background: colors.background,
          card: colors.surface,
          text: colors.text,
          border: colors.border,
        },
      }}
    >
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack screenOptions={headerOptions}>
        <Stack.Protected guard={false}>
          {authenticatedRoutes.map((name) => <Stack.Screen key={name} name={name} />)}
        </Stack.Protected>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="registration" options={{ title: "Get started" }} />
        <Stack.Screen name="registration/apply" options={{ title: "Servants Prep registration" }} />
        <Stack.Screen name="signup/parent" options={{ title: "Parent sign-up" }} />
        <Stack.Screen name="signup/servant" options={{ title: "Servant sign-up" }} />
        <Stack.Screen name="roster-signup" options={{ title: "Roster sign-up" }} />
      </Stack>
    </ThemeProvider>
  );
}

/** Tints everything under it, headers included, by the ministry of the active route. */
function RouteMinistryTint({ children }: { children: React.ReactNode }) {
  const segments = useSegments();
  const last = useRef<Ministry>("sundaySchool");
  const ministry = ministryForSegments(segments as string[], last.current);
  last.current = ministry;
  return <MinistryTintProvider ministry={ministry}>{children}</MinistryTintProvider>;
}

function Navigation() {
  const headerOptions = useNavigationHeaderOptions();
  const { colors, isDark } = useAppTheme();
  const { user } = useAuth();
  const { classes, loading } = usePortal();
  const segments = useSegments();
  const lastMinistry = useRef<Ministry>("sundaySchool");
  const ministry = ministryForSegments(segments as string[], lastMinistry.current);
  lastMinistry.current = ministry;
  const base = isDark ? DarkTheme : DefaultTheme;
  // Route to the right ministry once, as soon as we know whether this
  // account has Sunday School access (classes finished loading). A manual
  // switcher choice afterwards is a deliberate navigation, not re-routed.
  const autoRouted = useRef(false);
  useEffect(() => {
    if (autoRouted.current || loading || !user) return;
    autoRouted.current = true;
    const ministry = defaultMinistry(user, classes.length > 0);
    if (ministry === "prep") router.replace("/(prep)/home");
  }, [loading, classes.length, user]);
  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          primary: colors.primary,
          background: colors.background,
          card: colors.surface,
          text: colors.text,
          border: colors.border,
        },
      }}
    >
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={{ flex: 1 }}>
      <ViewAsBanner />
      {/* Class-attendance reminders: throughout Sunday School (not Servants Prep), signed in. */}
      {user && ministry === "sundaySchool" && <AttendanceReminderBanner />}
      <View style={{ flex: 1 }}>
      <Stack screenOptions={headerOptions}>
        <Stack.Protected guard={false}>
          {publicRoutes.map((name) => <Stack.Screen key={name} name={name} />)}
        </Stack.Protected>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "", animation: "fade", animationDuration: 220 }} />
        <Stack.Screen name="(prep)" options={{ headerShown: false, title: "", animation: "fade", animationDuration: 220 }} />
        <Stack.Screen
          name="attendance/[classId]"
          options={{ title: "Take attendance" }}
        />
        <Stack.Screen
          name="lesson/[id]"
          options={{ title: "Weekly lesson" }}
        />
        <Stack.Screen
          name="notifications"
          options={{
            title: "Notifications",
            headerLargeTitle: false,
            headerTransparent: false,
            presentation: Platform.OS === "ios" ? "formSheet" : "modal",
            sheetAllowedDetents: Platform.OS === "ios" ? [0.55, 0.92] : undefined,
            sheetInitialDetentIndex: Platform.OS === "ios" ? 1 : undefined,
            sheetGrabberVisible: Platform.OS === "ios",
            sheetExpandsWhenScrolledToEdge: Platform.OS === "ios",
          }}
        />
        <Stack.Screen
          name="attendance-history/[classId]"
          options={{ title: "Individual history" }}
        />
        <Stack.Screen
          name="attendance-child/[childId]"
          options={{
            title: "Attendance",
            headerLargeTitle: false,
            headerTransparent: false,
            presentation: Platform.OS === "ios" ? "formSheet" : "modal",
            sheetAllowedDetents: Platform.OS === "ios" ? [0.62, 0.95] : undefined,
            sheetInitialDetentIndex: Platform.OS === "ios" ? 1 : undefined,
            sheetGrabberVisible: Platform.OS === "ios",
            sheetExpandsWhenScrolledToEdge: Platform.OS === "ios",
          }}
        />
        <Stack.Screen
          name="student-history/[id]"
          options={{
            title: "History",
            headerLargeTitle: false,
            headerTransparent: false,
            presentation: Platform.OS === "ios" ? "formSheet" : "modal",
            sheetAllowedDetents: Platform.OS === "ios" ? [0.62, 0.95] : undefined,
            sheetInitialDetentIndex: Platform.OS === "ios" ? 1 : undefined,
            sheetGrabberVisible: Platform.OS === "ios",
            sheetExpandsWhenScrolledToEdge: Platform.OS === "ios",
          }}
        />
        <Stack.Screen
          name="switch-ministry"
          options={{
            title: "Switch ministry",
            headerLargeTitle: false,
            headerTransparent: false,
            presentation: Platform.OS === "ios" ? "formSheet" : "modal",
            sheetAllowedDetents: Platform.OS === "ios" ? [0.4] : undefined,
            sheetInitialDetentIndex: 0,
            sheetGrabberVisible: Platform.OS === "ios",
          }}
        />
        <Stack.Screen
          name="account"
          options={{
            title: "Account",
            headerLargeTitle: false,
            headerTransparent: false,
            presentation: Platform.OS === "ios" ? "formSheet" : "card",
            sheetAllowedDetents:
              Platform.OS === "ios" ? [0.68, 0.95] : undefined,
            sheetInitialDetentIndex: Platform.OS === "ios" ? 1 : undefined,
            sheetGrabberVisible: Platform.OS === "ios",
            sheetExpandsWhenScrolledToEdge: Platform.OS === "ios",
          }}
        />
      </Stack>
      </View>
      </View>
      {/* Every in-progress draft today is a Sunday School class; revisit once
          Prep lesson attendance ships and the accessory needs to tint per
          the draft's own ministry instead of a fixed default. */}
      <MinistryTintProvider ministry="sundaySchool">
        <AttendanceAccessory />
      </MinistryTintProvider>
      <DuoDiagnostics />
      {user && (
        <MinistryTintProvider ministry={ministry}>
          <DuoDock ministry={ministry} peopleLabel={peopleTabLabel(ministry, user.role)} />
        </MinistryTintProvider>
      )}
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <AuthProvider>
        <AuthenticatedApp />
      </AuthProvider>
    </AppThemeProvider>
  );
}

function AuthenticatedApp() {
  const { user, loading, viewingAs, switchingIdentity } = useAuth();
  const { colors } = useAppTheme();
  // Register this device for native push (and handle taps on a push) for the
  // person who is actually signed in. While an administrator is viewing as
  // someone else the device stays bound to the administrator: the viewed
  // person's pushes must never be redirected to this phone.
  usePushNotificationRegistration(
    viewingAs?.originalId ?? (user && !user.mustChangePassword ? user.id : undefined),
  );
  const [fontsLoaded] = useFonts({
    Newsreader_500Medium,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_400Regular,
  });
  const ready = !loading && fontsLoaded;
  const [showSplash, setShowSplash] = useState(true);
  const finishSplash = useCallback(() => setShowSplash(false), []);

  // Preserve the intended deep link across sign-in (SMM-59): while signed
  // out, there's no <Stack> mounted at all to receive one, so capture it —
  // both a cold-start URL and one opened while already sitting on the sign-
  // in screen — and replay it once the real navigator exists, rather than
  // silently losing it the moment Navigation remounts at its default route.
  const pendingUrl = useRef<string | null>(null);
  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (user) return;
    let active = true;
    void Linking.getInitialURL().then((url) => {
      if (active && url) pendingUrl.current = url;
    });
    const subscription = Linking.addEventListener("url", ({ url }) => {
      pendingUrl.current = url;
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [user]);
  useEffect(() => {
    const justSignedIn = !!user && !wasSignedIn.current;
    wasSignedIn.current = !!user;
    if (!justSignedIn || !pendingUrl.current) return;
    const url = pendingUrl.current;
    pendingUrl.current = null;
    // Navigation's own <Stack> mounts this same render pass; give it one
    // tick to exist before replaying the link through it.
    const timeout = setTimeout(() => void Linking.openURL(url), 50);
    return () => clearTimeout(timeout);
  }, [user]);

  return (
    <View style={{ flex: 1, backgroundColor: "#5C1A1A" }}>
      {ready &&
        (!user || user.mustChangePassword ? (
          <AuthStack />
        ) : (
          <PortalProvider key={`${user.id}:${viewingAs?.originalId ?? ""}`}>
            <RouteMinistryTint>
              <Navigation />
            </RouteMinistryTint>
          </PortalProvider>
        ))}
      {switchingIdentity && <View accessibilityViewIsModal style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}><ActivityIndicator accessibilityLabel="Changing viewed account" /></View>}
      {showSplash && <LaunchScreen ready={ready} onFinished={finishSplash} />}
    </View>
  );
}
