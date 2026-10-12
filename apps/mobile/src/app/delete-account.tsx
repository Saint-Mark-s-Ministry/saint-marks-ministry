import { useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { Stack } from "expo-router";
import { Copy, ListSurface, Screen } from "@/components/ui";
import { Field } from "@/components/forms";
import { ApiError } from "@/data/api-client";
import { useAuth } from "@/data/auth-provider";
import { request } from "@/data/resources";
import {
  DELETION_SUMMARY,
  canDeleteOwnAccount,
  deletionErrorMessage,
  validateDeletionPassword,
} from "@/data/account-deletion";
import { serifDisplay, useAppTheme } from "@/theme";

/**
 * Permanently delete your own account (App Store guideline 5.1.1(v)). The
 * server deletes with the same routine an administrator uses and refuses when
 * the account holds records the church must keep; this screen explains that
 * rather than claiming success.
 */
export default function DeleteAccount() {
  const { user, signOut } = useAuth();
  const { colors } = useAppTheme();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const allowed = canDeleteOwnAccount(user?.role);

  async function remove() {
    if (inFlight.current || busy) return;
    const problem = validateDeletionPassword(password);
    if (problem) {
      setError(problem);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await request("/api/account/delete", "POST", { password });
    } catch (caught) {
      const status = caught instanceof ApiError ? caught.status : null;
      setError(deletionErrorMessage(status, caught instanceof ApiError ? caught.message : undefined));
      inFlight.current = false;
      setBusy(false);
      return;
    }
    // Only now, with the server's confirmation, is the person signed out.
    setPassword("");
    await signOut();
    Alert.alert("Account deleted", "Your account has been deleted.");
  }

  function confirm() {
    const problem = validateDeletionPassword(password);
    if (problem) {
      setError(problem);
      return;
    }
    Alert.alert(
      "Delete your account?",
      "This permanently deletes your account and can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete account", style: "destructive", onPress: () => void remove() },
      ],
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <Screen>
        <View style={{ paddingHorizontal: 4, gap: 4 }}>
          <Copy style={{ fontFamily: serifDisplay, fontSize: 34, lineHeight: 36, fontWeight: "500" }}>
            Delete account
          </Copy>
          <Copy kind="caption">{user?.email ?? ""}</Copy>
        </View>

        {!allowed && (
          <ListSurface style={{ padding: 16, gap: 6 }}>
            <Copy style={{ fontWeight: "600" }}>Not available here</Copy>
            <Copy kind="caption">
              Super administrators can't delete their own account. Ask another super administrator to do it.
            </Copy>
          </ListSurface>
        )}

        {allowed && (
          <>
            <ListSurface style={{ padding: 16, gap: 10 }}>
              <Copy style={{ fontWeight: "600" }}>Before you continue</Copy>
              {DELETION_SUMMARY.map((line) => (
                <Copy key={line} kind="caption">• {line}</Copy>
              ))}
            </ListSurface>

            <Field
              label="Your password"
              value={password}
              onChange={(value) => {
                setPassword(value);
                if (error) setError(null);
              }}
              secureTextEntry
              disabled={busy}
              error={error ?? undefined}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete my account"
              accessibilityState={{ disabled: busy || !password }}
              disabled={busy || !password}
              onPress={confirm}
              style={{
                minHeight: 52,
                borderRadius: 26,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.danger,
                opacity: busy || !password ? 0.45 : 1,
              }}
            >
              <Copy style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 17 }}>
                {busy ? "Deleting…" : "Delete my account"}
              </Copy>
            </Pressable>
          </>
        )}
      </Screen>
    </>
  );
}
