import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, View } from "react-native";
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Newsreader_500Medium } from "@expo-google-fonts/newsreader";
import { AppThemeProvider, MinistryTintProvider, serifDisplay, serifHeading, useAppTheme } from "@/theme";
import { AuthProvider, useAuth } from "@/data/auth-provider";
import { PortalProvider, usePortal } from "@/data/portal-provider";
import { defaultMinistry } from "@/data/navigation";
import LaunchScreen from "@/components/launch-screen";
import { AttendanceAccessory } from "@/components/attendance-accessory";

export { ErrorBoundary } from "expo-router";
export const unstable_settings = { initialRouteName: "(tabs)" };

SplashScreen.setOptions({ duration: 500, fade: true });

// The signed-out counterpart to Navigation() below: its own real <Stack>,
// not a bare component, so sign-in and the public registration/sign-up
// screens (SMM-61) are real, addressable routes — reachable by a deep link,
// and able to push between each other — rather than one opaque screen with
// no navigator at all underneath it.
function AuthStack() {
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
      <Stack
        screenOptions={{
          headerTintColor: colors.primary,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerLargeTitle: false,
          headerTitleStyle: { fontFamily: serifHeading, color: colors.text },
        }}
      >
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="registration" options={{ title: "" }} />
        <Stack.Screen name="registration/apply" options={{ title: "" }} />
        <Stack.Screen name="signup/parent" options={{ title: "" }} />
        <Stack.Screen name="signup/servant" options={{ title: "" }} />
        <Stack.Screen name="roster-signup" options={{ title: "" }} />
      </Stack>
    </ThemeProvider>
  );
}

function Navigation() {
  const { colors, isDark } = useAppTheme();
  const { user } = useAuth();
  const { classes, loading } = usePortal();
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
      <Stack
        screenOptions={{
          headerTintColor: colors.primary,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          // Every "browse" destination (Academic years, Visitations, Age
          // groups, etc.) gets the reference's big serif title. Task-focused
          // and form-sheet screens below opt back out — a large title
          // doesn't fit a short sheet or a screen with a dynamic subtitle.
          headerLargeTitle: Platform.OS === "ios",
          headerLargeTitleStyle: { fontFamily: serifDisplay, color: colors.text },
          headerTitleStyle: { fontFamily: serifHeading, color: colors.text },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "" }} />
        <Stack.Screen name="(prep)" options={{ headerShown: false, title: "" }} />
        <Stack.Screen
          name="attendance/[classId]"
          options={{ title: "Take attendance", headerLargeTitle: false }}
        />
        <Stack.Screen
          name="lesson/[id]"
          options={{ title: "Weekly lesson", headerLargeTitle: false }}
        />
        <Stack.Screen
          name="notifications"
          options={{
            title: "Notifications",
            headerLargeTitle: false,
            presentation: Platform.OS === "ios" ? "formSheet" : "modal",
            sheetAllowedDetents: Platform.OS === "ios" ? [0.55, 0.92] : undefined,
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
            presentation: Platform.OS === "ios" ? "formSheet" : "card",
            sheetAllowedDetents:
              Platform.OS === "ios" ? [0.68, 0.95] : undefined,
            sheetInitialDetentIndex: Platform.OS === "ios" ? 1 : undefined,
            sheetGrabberVisible: Platform.OS === "ios",
            sheetExpandsWhenScrolledToEdge: Platform.OS === "ios",
          }}
        />
      </Stack>
      {/* Every in-progress draft today is a Sunday School class; revisit once
          Prep lesson attendance ships and the accessory needs to tint per
          the draft's own ministry instead of a fixed default. */}
      <MinistryTintProvider ministry="sundaySchool">
        <AttendanceAccessory />
      </MinistryTintProvider>
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
  const { user, loading } = useAuth();
  const [fontsLoaded] = useFonts({
    Newsreader_500Medium,
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
          <PortalProvider key={user.id}>
            <Navigation />
          </PortalProvider>
        ))}
      {showSplash && <LaunchScreen ready={ready} onFinished={finishSplash} />}
    </View>
  );
}
