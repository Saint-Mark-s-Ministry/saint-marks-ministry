import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { Brand, Button, Card, Copy, Screen } from "@/components/ui";
import { apiOrigin, useAuth } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";
import { PasswordForm } from "@/components/password-form";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen>
        <View style={{ height: 60 }} />
        <Brand />
        {loading ? (
          <ActivityIndicator
            accessibilityLabel="Connecting"
            color={colors.primary}
          />
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
            <Copy kind="title">Sign in</Copy>
            <Copy>Use your ministry account.</Copy>
            <Card>
              <Copy kind="caption">Email</Copy>
              <TextInput
                accessibilityLabel="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="username"
                autoComplete="email"
                style={{
                  color: colors.text,
                  backgroundColor: colors.background,
                  padding: 14,
                  borderRadius: 12,
                  fontSize: 17,
                }}
              />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Copy kind="caption">Password</Copy>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${passwordVisible ? "Hide" : "Show"} password`}
                  disabled={busy}
                  hitSlop={10}
                  onPress={() => setPasswordVisible((visible) => !visible)}
                >
                  <Copy
                    kind="caption"
                    color={busy ? colors.muted : colors.primary}
                  >
                    {passwordVisible ? "Hide" : "Show"}
                  </Copy>
                </Pressable>
              </View>
              <TextInput
                accessibilityLabel="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!passwordVisible}
                textContentType="password"
                autoComplete="current-password"
                autoCapitalize="none"
                returnKeyType="go"
                onSubmitEditing={() => {
                  if (email && password && !busy) void submit();
                }}
                style={{
                  color: colors.text,
                  backgroundColor: colors.background,
                  padding: 14,
                  borderRadius: 12,
                  fontSize: 17,
                }}
              />
              {(error || connectionError) && (
                <Copy color={colors.danger}>{error || connectionError}</Copy>
              )}
              <Button
                label={busy ? "Signing in…" : "Sign in"}
                disabled={busy || !email.trim() || !password || !apiOrigin}
                onPress={() => void submit()}
              />
            </Card>
            {connectionError && (
              <Button
                label="Retry connection"
                secondary
                onPress={() => void retry()}
              />
            )}
            <Copy kind="caption">
              Your classes and permissions come from the connected portal.
              Attendance saves there securely.
            </Copy>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
