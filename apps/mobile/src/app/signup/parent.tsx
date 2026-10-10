import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Brand, Button, Copy, Screen } from "@/components/ui";
import { Field, confirmAction } from "@/components/forms";
import { publicJson, publicRequest } from "@/data/public-api";
import {
  emptyParentSignupDraft,
  isDuplicateAccountError,
  isParentSignupDraftDirty,
  validateParentSignup,
  type ParentSignupDraft,
} from "@/data/parent-signup";
import { useAppTheme } from "@/theme";

// Non-sensitive fields only (name/email/phone) survive an interruption —
// password/confirm are never written to disk, same reasoning as the
// Change Password screen: a lost password just means re-typing it, not a
// security smell.
const DRAFT_KEY = "stmark.signup-parent-draft";

export default function ParentSignup() {
  const { colors } = useAppTheme();
  const blank = emptyParentSignupDraft();
  const [draft, setDraft] = useState<ParentSignupDraft>(blank);
  const draftReady = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(DRAFT_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Pick<ParentSignupDraft, "fullName" | "email" | "phone">;
          setDraft((d) => ({ ...d, ...saved }));
        }
      } catch {
        /* a corrupt draft is discarded, not fatal */
      } finally {
        draftReady.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    if (!draftReady.current) return;
    void SecureStore.setItemAsync(
      DRAFT_KEY,
      JSON.stringify({ fullName: draft.fullName, email: draft.email, phone: draft.phone }),
      { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
    ).catch(() => undefined);
  }, [draft.fullName, draft.email, draft.phone]);

  function requestBack() {
    if (!isParentSignupDraftDirty(draft, blank)) {
      router.back();
      return;
    }
    confirmAction("Discard this form?", "Your name, email, and phone are saved, but your password isn't.", () => router.back(), true);
  }

  async function submit() {
    setError(null);
    setDuplicate(false);
    const validationError = validateParentSignup(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    try {
      await publicRequest(
        "/api/auth/signup/parent",
        publicJson({
          email: draft.email.trim(),
          fullName: draft.fullName.trim(),
          phone: draft.phone.trim() || undefined,
          password: draft.password,
          confirmPassword: draft.confirmPassword,
        }),
      );
      await SecureStore.deleteItemAsync(DRAFT_KEY).catch(() => undefined);
      setDone(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create your account.";
      setDuplicate(isDuplicateAccountError(message));
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "" }} />
        <View style={{ alignItems: "center", gap: 10, paddingTop: 60 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" }}>
            <Copy style={{ fontSize: 32, color: colors.success }}>✓</Copy>
          </View>
          <Copy style={{ fontWeight: "600", fontSize: 24 }}>Account created</Copy>
          <Copy kind="caption" style={{ textAlign: "center", maxWidth: 280 }}>
            Sign in with your new password to register your children for Sunday School.
          </Copy>
          <Button label="Sign in" onPress={() => router.replace("/sign-in")} />
        </View>
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <Screen>
        <View style={{ alignItems: "center", gap: 8, paddingTop: 6 }}>
          <Brand />
          <Copy style={{ fontWeight: "600", fontSize: 22 }}>Parent sign up</Copy>
          <Copy kind="caption" style={{ textAlign: "center", maxWidth: 300 }}>
            Create an account to register your child for Sunday School.
          </Copy>
        </View>

        <Field label="Full name" value={draft.fullName} onChange={(v) => setDraft((d) => ({ ...d, fullName: v }))} disabled={busy} placeholder="Required" />
        <Field
          label="Email"
          value={draft.email}
          onChange={(v) => setDraft((d) => ({ ...d, email: v }))}
          disabled={busy}
          keyboardType="email-address"
          placeholder="name@example.com"
        />
        <Field
          label="Phone"
          value={draft.phone}
          onChange={(v) => setDraft((d) => ({ ...d, phone: v }))}
          disabled={busy}
          keyboardType="phone-pad"
          placeholder="Optional"
        />
        <Field
          label="Password"
          value={draft.password}
          onChange={(v) => setDraft((d) => ({ ...d, password: v }))}
          disabled={busy}
          secureTextEntry
          placeholder="Minimum 8 characters"
        />
        <Field
          label="Confirm"
          value={draft.confirmPassword}
          onChange={(v) => setDraft((d) => ({ ...d, confirmPassword: v }))}
          disabled={busy}
          secureTextEntry
          placeholder="Required"
        />

        {error && (
          <View accessibilityLiveRegion="polite">
            <Copy color={colors.danger}>{error}</Copy>
          </View>
        )}

        <Button label={busy ? "Creating…" : "Create account"} disabled={busy} onPress={() => void submit()} />

        {duplicate && (
          <Button label="Sign in instead" secondary onPress={() => router.replace("/sign-in")} />
        )}

        <View style={{ alignItems: "center", gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Log in instead" onPress={requestBack}>
            <Copy style={{ fontWeight: "500" }} color={colors.primary}>Log in instead</Copy>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Sign up as a servant" onPress={() => router.replace("/signup/servant")}>
            <Copy style={{ fontWeight: "500" }} color={colors.primary}>Sign up as a servant</Copy>
          </Pressable>
        </View>
      </Screen>
    </>
  );
}
