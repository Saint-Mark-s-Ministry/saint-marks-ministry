import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { AppThemeProvider, useAppTheme } from "@/theme";
import { AuthProvider, useAuth } from "@/data/auth-provider";
import { PortalProvider, usePortal } from "@/data/portal-provider";
import { defaultMinistry } from "@/data/navigation";
import SignIn from "@/components/sign-in";
import LaunchScreen from "@/components/launch-screen";
import { AttendanceAccessory } from "@/components/attendance-accessory";

export { ErrorBoundary } from "expo-router";
export const unstable_settings = { initialRouteName: "(tabs)" };

SplashScreen.setOptions({ duration: 500, fade: true });

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
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "" }} />
        <Stack.Screen name="(prep)" options={{ headerShown: false, title: "" }} />
        <Stack.Screen
          name="attendance/[classId]"
          options={{ title: "Take attendance" }}
        />
        <Stack.Screen name="lesson/[id]" options={{ title: "Weekly lesson" }} />
        <Stack.Screen
          name="notifications"
          options={{
            title: "Notifications",
            presentation: Platform.OS === "ios" ? "formSheet" : "modal",
            sheetAllowedDetents: Platform.OS === "ios" ? [0.55, 0.92] : undefined,
            sheetInitialDetentIndex: Platform.OS === "ios" ? 1 : undefined,
            sheetGrabberVisible: Platform.OS === "ios",
            sheetExpandsWhenScrolledToEdge: Platform.OS === "ios",
          }}
        />
        <Stack.Screen
          name="account"
          options={{
            title: "Account",
            presentation: Platform.OS === "ios" ? "formSheet" : "card",
            sheetAllowedDetents:
              Platform.OS === "ios" ? [0.68, 0.95] : undefined,
            sheetInitialDetentIndex: Platform.OS === "ios" ? 1 : undefined,
            sheetGrabberVisible: Platform.OS === "ios",
            sheetExpandsWhenScrolledToEdge: Platform.OS === "ios",
          }}
        />
      </Stack>
      <AttendanceAccessory />
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
  const [showSplash, setShowSplash] = useState(true);
  const finishSplash = useCallback(() => setShowSplash(false), []);

  return (
    <View style={{ flex: 1, backgroundColor: "#5C1A1A" }}>
      {!loading &&
        (!user || user.mustChangePassword ? (
          <SignIn />
        ) : (
          <PortalProvider key={user.id}>
            <Navigation />
          </PortalProvider>
        ))}
      {showSplash && (
        <LaunchScreen ready={!loading} onFinished={finishSplash} />
      )}
    </View>
  );
}
