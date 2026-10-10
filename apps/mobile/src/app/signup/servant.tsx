import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Brand, Button, Copy, Screen } from "@/components/ui";
import { Field, confirmAction } from "@/components/forms";
import { publicJson, publicRequest } from "@/data/public-api";
import {
  emptyServantSignupDraft,
  isDuplicateApplicationError,
  isServantSignupDraftDirty,
  validateServantSignup,
  type ServantSignupDraft,
} from "@/data/servant-signup";
import { useAppTheme } from "@/theme";

const DRAFT_KEY = "stmark.signup-servant-draft";

export default function ServantSignup() {
  const { colors } = useAppTheme();
  const blank = emptyServantSignupDraft();
  const [draft, setDraft] = useState<ServantSignupDraft>(blank);
  const draftReady = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(DRAFT_KEY);
        if (raw) setDraft(JSON.parse(raw));
      } catch {
        /* a corrupt draft is discarded, not fatal */
      } finally {
        draftReady.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    if (!draftReady.current) return;
    void SecureStore.setItemAsync(DRAFT_KEY, JSON.stringify(draft), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }).catch(() => undefined);
  }, [draft]);

  function requestBack() {
    if (!isServantSignupDraftDirty(draft, blank)) {
      router.back();
      return;
    }
    confirmAction("Discard this application?", "Your draft is saved and will still be here if you come back instead.", () => router.back(), true);
  }

  async function submit() {
    setError(null);
    setDuplicate(false);
    const validationError = validateServantSignup(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    try {
      await publicRequest(
        "/api/servant-applications/submit",
        publicJson({
          email: draft.email.trim(),
          fullName: draft.fullName.trim(),
          phone: draft.phone.trim(),
          currentGrade: draft.currentGrade.trim(),
        }),
      );
      await SecureStore.deleteItemAsync(DRAFT_KEY).catch(() => undefined);
      setDone(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to submit your application.";
      setDuplicate(isDuplicateApplicationError(message));
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
          <Copy style={{ fontWeight: "600", fontSize: 24 }}>Application submitted</Copy>
          <Copy kind="caption" style={{ textAlign: "center", maxWidth: 300 }}>
            A Super Admin reviews your application and shares a temporary password with you directly. This doesn&apos;t create your account yet.
          </Copy>
          <Button label="Back to sign in" onPress={() => router.replace("/sign-in")} />
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
          <Copy style={{ fontWeight: "600", fontSize: 22 }}>Servant sign-up</Copy>
          <Copy kind="caption" style={{ textAlign: "center", maxWidth: 300 }}>
            Request Sunday School servant access. Applications require approval.
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
        <Field label="Phone" value={draft.phone} onChange={(v) => setDraft((d) => ({ ...d, phone: v }))} disabled={busy} keyboardType="phone-pad" placeholder="Required" />
        <Field
          label="Grade served"
          value={draft.currentGrade}
          onChange={(v) => setDraft((d) => ({ ...d, currentGrade: v }))}
          disabled={busy}
          placeholder="e.g. 3rd grade"
        />

        <Copy kind="caption">
          A Super Admin reviews your application and shares a temporary password with you directly. You change it at first sign-in.
        </Copy>

        {error && (
          <View accessibilityLiveRegion="polite">
            <Copy color={colors.danger}>{error}</Copy>
          </View>
        )}

        <Button label={busy ? "Submitting…" : "Submit application"} disabled={busy} onPress={() => void submit()} />

        {duplicate && (
          <Button label="Sign in instead" secondary onPress={() => router.replace("/sign-in")} />
        )}

        <View style={{ alignItems: "center", gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Sign up as a parent" onPress={() => router.replace("/signup/parent")}>
            <Copy style={{ fontWeight: "500" }} color={colors.primary}>Sign up as a parent</Copy>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={requestBack}>
            <Copy style={{ fontWeight: "500" }} color={colors.muted}>Back</Copy>
          </Pressable>
        </View>
      </Screen>
    </>
  );
}
