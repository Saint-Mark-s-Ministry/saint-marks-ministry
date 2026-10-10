import { useEffect, useRef, useState } from "react";
import { Alert, Platform, Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as ImagePicker from "expo-image-picker";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { Brand, Button, Copy, Icon, Screen } from "@/components/ui";
import { Choice, Field, Toggle, confirmAction } from "@/components/forms";
import { publicJson, publicRequest, publicUpload } from "@/data/public-api";
import {
  GRADE_OPTIONS,
  STEP_LABELS,
  WIZARD_STEPS,
  canAdvanceFromStep,
  emptyRegistrationDraft,
  gradeLabel,
  isDuplicateRegistrationError,
  isRegistrationDraftDirty,
  validateProfileImage,
  validateRegistrationDraft,
  type RegistrationDraft,
  type WizardStep,
} from "@/data/registration-wizard";
import { useAppTheme } from "@/theme";

const DRAFT_KEY = "stmark.registration-draft";

export default function RegistrationApply() {
  const { colors } = useAppTheme();
  const today = new Date().toISOString().slice(0, 10);
  const blank = emptyRegistrationDraft();
  const [draft, setDraft] = useState<RegistrationDraft>(blank);
  const draftReady = useRef(false);
  const [stepIndex, setStepIndex] = useState(0);
  const step: WizardStep = WIZARD_STEPS[stepIndex];

  const [codeChecking, setCodeChecking] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeLabel, setCodeLabel] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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

  function requestClose() {
    if (!isRegistrationDraftDirty(draft, blank)) {
      router.back();
      return;
    }
    confirmAction("Discard this application?", "Your draft is saved and will still be here if you come back instead.", () => router.back(), true);
  }

  async function checkCode() {
    setCodeError(null);
    setCodeChecking(true);
    try {
      const result = await publicRequest<{ valid: boolean; message?: string; label?: string }>(
        "/api/registration/validate-code",
        publicJson({ code: draft.inviteCode.trim() }),
      );
      if (!result.valid) {
        // The real route's own non-disclosing message, shown as-is.
        setCodeError(result.message ?? "Invalid or expired invite code");
        return;
      }
      setCodeLabel(result.label ?? null);
      setStepIndex(1);
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : "Unable to check this code.");
    } finally {
      setCodeChecking(false);
    }
  }

  async function pickPhoto(source: "library" | "camera") {
    const permission =
      source === "library"
        ? await ImagePicker.requestMediaLibraryPermissionsAsync()
        : await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", source === "library" ? "Photo access is needed to choose a picture." : "Camera access is needed to take a picture.");
      return;
    }
    const result =
      source === "library"
        ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true, aspect: [1, 1] })
        : await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const problem = validateProfileImage({ mimeType: asset.mimeType ?? null, size: asset.fileSize ?? null });
    if (problem) {
      setUploadError(problem);
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const uploaded = await publicUpload<{ url: string; filename: string }>(
        "/api/registration/upload",
        { uri: asset.uri, name: asset.fileName ?? "profile.jpg" },
        { "x-invite-code": draft.inviteCode.trim() },
      );
      setDraft((d) => ({ ...d, profileImageUrl: uploaded.url, profileImageFilename: uploaded.filename }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Unable to upload. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setSubmitError(null);
    setDuplicate(false);
    const validationError = validateRegistrationDraft(draft, today);
    if (validationError) {
      setSubmitError(validationError);
      return;
    }
    setSubmitting(true);
    try {
      await publicRequest(
        "/api/registration/submit",
        publicJson({
          inviteCode: draft.inviteCode.trim(),
          email: draft.email.trim(),
          fullName: draft.fullName.trim(),
          dateOfBirth: draft.dateOfBirth,
          phone: draft.phone.trim(),
          previouslyServed: draft.previouslyServed,
          previousServiceLocation: draft.previousServiceLocation.trim() || undefined,
          currentlyServing: draft.currentlyServing,
          previouslyAttendedPrep: draft.previouslyAttendedPrep,
          previousPrepLocation: draft.previousPrepLocation.trim() || undefined,
          grade: draft.grade,
          profileImageUrl: draft.profileImageUrl,
          profileImageFilename: draft.profileImageFilename,
        }),
      );
      await SecureStore.deleteItemAsync(DRAFT_KEY).catch(() => undefined);
      setDone(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to submit your registration.";
      setDuplicate(isDuplicateRegistrationError(message));
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "", headerLeft: () => null, gestureEnabled: false }} />
        <View style={{ alignItems: "center", gap: 10, paddingTop: 60 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" }}>
            <Copy style={{ fontSize: 32, color: colors.success }}>✓</Copy>
          </View>
          <Copy style={{ fontWeight: "600", fontSize: 24 }}>Registration submitted</Copy>
          <Copy kind="caption" style={{ textAlign: "center", maxWidth: 300 }}>
            A coordinator reviews every application. This doesn&apos;t create your account or confirm a spot — you&apos;ll hear back by email once it&apos;s been reviewed.
          </Copy>
          <Button label="Back to sign in" onPress={() => router.replace("/sign-in")} />
        </View>
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerLeft: () =>
            stepIndex === 0 ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={requestClose}>
                <Icon ios="xmark" android="close" />
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => setStepIndex((i) => i - 1)}>
                <Icon ios="chevron.left" android="arrow_back" />
              </Pressable>
            ),
        }}
      />
      <Screen>
        {step === "code" && (
          <View style={{ alignItems: "center", gap: 8, paddingTop: 6 }}>
            <Brand />
            <Copy style={{ fontWeight: "600", fontSize: 22, textAlign: "center" }}>Servants Prep registration</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>Enter the invite code you were given.</Copy>
          </View>
        )}

        {step !== "code" && (
          <View style={{ gap: 4 }}>
            <Copy kind="caption">{codeLabel ?? "Servants Prep registration"} · invite code {draft.inviteCode.trim().toUpperCase()}</Copy>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {WIZARD_STEPS.map((s, i) => (
                <View key={s} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= stepIndex ? colors.primary : colors.hover }} />
              ))}
            </View>
            <Copy kind="caption">
              Step {stepIndex + 1} of {WIZARD_STEPS.length} · {STEP_LABELS[step]}
            </Copy>
          </View>
        )}

        {step === "code" && (
          <>
            <Field label="Invite code" value={draft.inviteCode} onChange={(v) => setDraft((d) => ({ ...d, inviteCode: v }))} disabled={codeChecking} placeholder="e.g. FALL26-7QX" />
            {codeError && (
              <View accessibilityLiveRegion="polite">
                <Copy color={colors.danger}>{codeError}</Copy>
              </View>
            )}
            <Button label={codeChecking ? "Checking…" : "Continue"} disabled={codeChecking || !draft.inviteCode.trim()} onPress={() => void checkCode()} />
          </>
        )}

        {step === "personal" && (
          <>
            <Field label="Full name" value={draft.fullName} onChange={(v) => setDraft((d) => ({ ...d, fullName: v }))} placeholder="Required" />
            <Field label="Email" value={draft.email} onChange={(v) => setDraft((d) => ({ ...d, email: v }))} keyboardType="email-address" placeholder="name@example.com" />
            <Field label="Phone" value={draft.phone} onChange={(v) => setDraft((d) => ({ ...d, phone: v }))} keyboardType="phone-pad" placeholder="(555) 123-4567" />
            <View style={{ gap: 7 }}>
              <Copy kind="caption">Date of birth</Copy>
              <DateTimePicker
                value={draft.dateOfBirth ? new Date(`${draft.dateOfBirth}T00:00:00`) : new Date()}
                mode="date"
                maximumDate={new Date()}
                display={Platform.OS === "ios" ? "compact" : "default"}
                onValueChange={(_, date) => setDraft((d) => ({ ...d, dateOfBirth: date.toISOString().slice(0, 10) }))}
                accentColor={colors.primary}
              />
            </View>
            <Choice
              label="Grade"
              value={draft.grade}
              onChange={(v) => setDraft((d) => ({ ...d, grade: v as RegistrationDraft["grade"] }))}
              options={GRADE_OPTIONS.map((g) => ({ value: g, label: gradeLabel(g) }))}
            />
            <Copy kind="caption">Start in Year 1 — every new application begins there.</Copy>
            <Button label="Continue" disabled={!canAdvanceFromStep("personal", draft, today)} onPress={() => setStepIndex(2)} />
          </>
        )}

        {step === "history" && (
          <>
            <Toggle label="Have you served before?" value={!!draft.previouslyServed} onChange={(v) => setDraft((d) => ({ ...d, previouslyServed: v }))} />
            {draft.previouslyServed && (
              <Field label="Where did you serve?" value={draft.previousServiceLocation} onChange={(v) => setDraft((d) => ({ ...d, previousServiceLocation: v }))} />
            )}
            <Toggle label="Currently serving elsewhere?" value={!!draft.currentlyServing} onChange={(v) => setDraft((d) => ({ ...d, currentlyServing: v }))} />
            <Toggle label="Attended Servants Prep before?" value={!!draft.previouslyAttendedPrep} onChange={(v) => setDraft((d) => ({ ...d, previouslyAttendedPrep: v }))} />
            {draft.previouslyAttendedPrep && (
              <Field label="Where did you attend?" value={draft.previousPrepLocation} onChange={(v) => setDraft((d) => ({ ...d, previousPrepLocation: v }))} />
            )}
            <Button label="Continue" disabled={!canAdvanceFromStep("history", draft, today)} onPress={() => setStepIndex(3)} />
          </>
        )}

        {step === "photo" && (
          <>
            <Copy kind="caption">A clear photo of your face.</Copy>
            {draft.profileImageUrl ? (
              <Copy>✓ {draft.profileImageFilename}</Copy>
            ) : (
              <Copy kind="caption">No photo added yet.</Copy>
            )}
            {uploadError && <Copy color={colors.danger}>{uploadError}</Copy>}
            <Button label={uploading ? "Uploading…" : "Choose from library"} secondary disabled={uploading} onPress={() => void pickPhoto("library")} />
            <Button label={uploading ? "Uploading…" : "Take a photo"} secondary disabled={uploading} onPress={() => void pickPhoto("camera")} />

            {submitError && (
              <View accessibilityLiveRegion="polite">
                <Copy color={colors.danger}>{submitError}</Copy>
              </View>
            )}
            <Button label={submitting ? "Submitting…" : "Submit registration"} disabled={submitting || !canAdvanceFromStep("photo", draft, today)} onPress={() => void submit()} />
            {duplicate && <Button label="Sign in instead" secondary onPress={() => router.replace("/sign-in")} />}
          </>
        )}
      </Screen>
    </>
  );
}
