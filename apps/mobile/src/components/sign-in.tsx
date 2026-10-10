import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { Brand, Button, Card, Copy, Screen, StatusPill } from "@/components/ui";
import { apiOrigin, useAuth } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";
import { PasswordForm } from "@/components/password-form";
import { canSubmitSignIn, looksLikeEmail, signInFailureKind } from "@/data/sign-in";

export default function SignIn() {
  const {
    user,
    loading,
    error: connectionError,
    signIn,
    signOut,
    retry,
  } = useAuth();
  const { colors } = useAppTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    setOffline(false);
    try {
      await signIn(email, password);
      setPassword("");
    } catch (err) {
      setOffline(signInFailureKind(err) === "offline");
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  const emailInvalid = emailTouched && email.trim().length > 0 && !looksLikeEmail(email);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen>
        <View style={{ height: 20 }} />
        {loading ? (
          <>
            <Brand />
            <ActivityIndicator accessibilityLabel="Connecting" color={colors.primary} />
          </>
        ) : user?.mustChangePassword ? (
          <Card>
            <Copy kind="title">Change your password</Copy>
            <Copy>Your account was created with a temporary password.</Copy>
            <PasswordForm forced />
            <Button
              label="Log out instead"
              secondary
              onPress={() => void signOut()}
            />
          </Card>
        ) : (
          <>
            <View style={{ alignItems: "center", gap: 10, paddingTop: 10 }}>
              <Brand />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <StatusPill label="Servants Prep" color={colors.primary} soft={colors.primarySoft} />
                <StatusPill label="Sunday School" color={colors.warning} soft={colors.warningSoft} />
              </View>
              <Copy kind="caption" style={{ textAlign: "center", maxWidth: 290 }}>
                Sign in once to reach every ministry connected to your account.
              </Copy>
            </View>

            <View style={{ backgroundColor: colors.surface, borderRadius: 24, overflow: "hidden" }}>
              <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 16, gap: 12 }}>
                <Copy style={{ width: 76, fontSize: 15.5 }}>Email</Copy>
                <TextInput
                  accessibilityLabel="Email"
                  accessibilityHint={emailInvalid ? "Enter a valid email address" : undefined}
                  value={email}
                  onChangeText={setEmail}
                  onBlur={() => setEmailTouched(true)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="username"
                  autoComplete="email"
                  placeholder="name@example.com"
                  placeholderTextColor={colors.muted}
                  editable={!busy}
                  style={{ flex: 1, color: colors.text, fontSize: 16 }}
                />
              </View>
              <View style={{ height: 0.5, backgroundColor: colors.border, marginLeft: 16 }} />
              <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 16, gap: 12 }}>
                <Copy style={{ width: 76, fontSize: 15.5 }}>Password</Copy>
                <TextInput
                  accessibilityLabel="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!passwordVisible}
                  textContentType="password"
                  autoComplete="current-password"
                  autoCapitalize="none"
                  placeholder="Required"
                  placeholderTextColor={colors.muted}
                  returnKeyType="go"
                  editable={!busy}
                  onSubmitEditing={() => {
                    if (canSubmitSignIn(email, password, !!apiOrigin) && !busy) void submit();
                  }}
                  style={{ flex: 1, color: colors.text, fontSize: 16 }}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${passwordVisible ? "Hide" : "Show"} password`}
                  disabled={busy}
                  hitSlop={10}
                  onPress={() => setPasswordVisible((visible) => !visible)}
                >
                  <Copy kind="caption" color={busy ? colors.muted : colors.primary}>
                    {passwordVisible ? "Hide" : "Show"}
                  </Copy>
                </Pressable>
              </View>
            </View>

            {emailInvalid && !error && (
              <Copy kind="caption" color={colors.warning}>Enter a valid email address.</Copy>
            )}

            {(error || connectionError) && (
              <View accessibilityLiveRegion="polite">
                <Copy color={colors.danger}>{error || connectionError}</Copy>
              </View>
            )}

            <Button
              label={busy ? "Signing in…" : "Sign in"}
              disabled={busy || !canSubmitSignIn(email, password, !!apiOrigin)}
              onPress={() => void submit()}
            />

            {(offline || connectionError) && (
              <Button label="Retry connection" secondary onPress={() => void (connectionError ? retry() : submit())} />
            )}

            <View style={{ alignItems: "center", gap: 10, paddingTop: 6 }}>
              <Copy kind="caption">New here?</Copy>
              <Pressable onPress={() => void Linking.openURL(`${apiOrigin}/signup/parent`)}>
                <Copy style={{ fontWeight: "500" }} color={colors.primary}>Register your child for Sunday School</Copy>
              </Pressable>
              <Pressable onPress={() => void Linking.openURL(`${apiOrigin}/signup/servant`)}>
                <Copy style={{ fontWeight: "500" }} color={colors.primary}>Sign up as a Sunday School servant</Copy>
              </Pressable>
              <Copy kind="caption" style={{ textAlign: "center", paddingTop: 6 }}>
                Can't sign in? Contact your ministry coordinator or admin.
              </Copy>
            </View>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
