import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import * as SecureStore from "expo-secure-store";
import { Button, Copy, ListSurface, Screen, styles } from "@/components/ui";
import { Choice, Field } from "@/components/forms";
import { ApiError } from "@/data/api-client";
import { useAuth } from "@/data/auth-provider";
import { request } from "@/data/resources";
import {
  DRAFT_KEY,
  EMPTY_FORM,
  GENDER_OPTIONS,
  LEVELS,
  levelLabel,
  canViewFamily,
  isoDay,
  parseDraft,
  requiredProgress,
  serializeDraft,
  validateRegistration,
  type FormErrors,
  type RegistrationForm,
} from "@/data/parent-children";
import { serifDisplay, useAppTheme } from "@/theme";

const DEFAULT_BIRTH_DAY = new Date(2015, 0, 1);

export default function ParentRegister() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = canViewFamily(user?.role);

  const [form, setForm] = useState<RegistrationForm>(EMPTY_FORM);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A ref, so a double tap can't send the same registration twice.
  const inFlight = useRef(false);

  // Restore whatever was typed before an interruption. A damaged draft is ignored.
  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(DRAFT_KEY)
      .then((raw) => {
        if (!active) return;
        const saved = parseDraft(raw);
        if (saved) setForm(saved);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setDraftLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Save as the person types, after a short pause, so nothing is lost if the app is interrupted.
  useEffect(() => {
    if (!draftLoaded) return;
    const timer = setTimeout(() => {
      SecureStore.setItemAsync(DRAFT_KEY, serializeDraft(form)).catch(() => undefined);
    }, 400);
    return () => clearTimeout(timer);
  }, [form, draftLoaded]);

  const errors: FormErrors = validateRegistration(form, new Date());
  const shown: FormErrors = showErrors ? errors : {};
  const progress = requiredProgress(form);
  const errorCount = Object.keys(errors).length;

  const set = (key: keyof RegistrationForm) => (value: string) => {
    setServerError(null);
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function submit() {
    if (inFlight.current || busy) return;
    setServerError(null);
    if (errorCount > 0) {
      setShowErrors(true);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const firstName = form.firstName.trim();
      const lastName = form.lastName.trim();
      const query = new URLSearchParams({ firstName, lastName, birthDate: form.birthDate });
      // Check for a duplicate before sending. The server checks again on submit.
      const check = await request<{ duplicate: "linked" | "pending" | null }>(`/api/parent/children/duplicate-check?${query}`);
      if (check.duplicate) {
        Alert.alert(
          "This child is already listed",
          check.duplicate === "linked"
            ? "This child is already linked to your family. Check My children."
            : "A registration for this child is already waiting for review. Check Registrations.",
        );
        return;
      }
      await request("/api/parent/children/register", "POST", {
        firstName,
        lastName,
        birthDate: form.birthDate,
        intendedLevel: form.level,
        gender: form.gender || null,
        guardianName: form.guardianName.trim(),
        guardianPhone: form.guardianPhone.trim(),
        guardianEmail: form.guardianEmail.trim() || null,
        notes: form.notes.trim() || null,
      });
      // Only a successful submit clears the draft. Anything else keeps every entry.
      await SecureStore.deleteItemAsync(DRAFT_KEY).catch(() => undefined);
      setForm(EMPTY_FORM);
      setShowErrors(false);
      Alert.alert(
        "Registration sent",
        "A coordinator will review it. You'll see the outcome, and the class once one is chosen, under My children.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setServerError("This child is already on your family's list. Check My children or Registrations.");
      } else if (error instanceof ApiError) {
        // The server's messages here are written for the person entering the form.
        setServerError(error.message);
      } else {
        setServerError("Couldn't reach the server. Your entries are saved on this device. Submit again once you're connected.");
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function discardDraft() {
    Alert.alert("Discard this registration?", "The entries on this screen will be cleared. This can't be undone.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          setForm(EMPTY_FORM);
          setShowErrors(false);
          setServerError(null);
          SecureStore.deleteItemAsync(DRAFT_KEY).catch(() => undefined);
        },
      },
    ]);
  }

  if (!canView) {
    return (
      <>
        <Stack.Screen options={{ title: "Register a child" }} />
        <Screen>
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>Only parents can register a child.</Copy>
          </View>
        </Screen>
      </>
    );
  }

  return (
    <>
      {/* The large heading below carries the title; an empty bar title avoids repeating it. */}
      <Stack.Screen options={{ title: "" }} />
      <Screen>
        <View style={{ paddingHorizontal: 4, gap: 2 }}>
          <Copy style={{ fontFamily: serifDisplay, fontSize: 34, lineHeight: 36, fontWeight: "500" }}>Register a child</Copy>
          <Copy kind="caption">St. Mark Sunday School</Copy>
        </View>

        <ListSurface>
          <View style={{ padding: 16, gap: 4 }}>
            <Copy style={{ fontWeight: "600" }}>
              {progress.done} of {progress.total} required fields
            </Copy>
            <Copy kind="caption">Saved on this device as you type. A coordinator reviews every registration.</Copy>
          </View>
        </ListSurface>

        <Section title="Child">
          <Field label="First name" value={form.firstName} onChange={set("firstName")} disabled={busy} />
          <FieldError message={shown.firstName} />
          <Field label="Last name" value={form.lastName} onChange={set("lastName")} disabled={busy} />
          <FieldError message={shown.lastName} />

          <View style={{ gap: 7 }}>
            <Copy kind="caption">Birth date</Copy>
            <DateTimePicker
              value={form.birthDate ? new Date(`${form.birthDate}T12:00:00`) : DEFAULT_BIRTH_DAY}
              mode="date"
              display="compact"
              onValueChange={(_, date) => set("birthDate")(isoDay(date))}
              accentColor={colors.primary}
            />
            <FieldError message={shown.birthDate} />
          </View>

          <View style={{ gap: 7 }}>
            <Copy kind="caption">Grade level</Copy>
            <ListSurface>
              {LEVELS.map((level, index) => {
                const selected = form.level === level;
                return (
                  <Pressable
                    key={level}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, disabled: busy }}
                    accessibilityLabel={levelLabel(level)}
                    disabled={busy}
                    onPress={() => set("level")(level)}
                    style={({ pressed }) => [
                      { minHeight: 44, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: pressed ? colors.hover : "transparent" },
                      index < LEVELS.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                    ]}
                  >
                    <Copy style={{ fontWeight: selected ? "600" : "400" }}>{levelLabel(level)}</Copy>
                    {selected && <Copy style={{ color: colors.primary, fontWeight: "700" }}>✓</Copy>}
                  </Pressable>
                );
              })}
            </ListSurface>
            <FieldError message={shown.level} />
          </View>

          <Choice label="Gender" value={form.gender} options={GENDER_OPTIONS} onChange={set("gender")} disabled={busy} />
        </Section>

        <Section title="Guardian contact">
          <Field label="Your name" value={form.guardianName} onChange={set("guardianName")} disabled={busy} />
          <FieldError message={shown.guardianName} />
          <Field label="Phone" value={form.guardianPhone} onChange={set("guardianPhone")} keyboardType="phone-pad" placeholder="(555) 123-4567" disabled={busy} />
          <FieldError message={shown.guardianPhone} />
          <Field label="Email (optional)" value={form.guardianEmail} onChange={set("guardianEmail")} keyboardType="email-address" placeholder="name@example.com" disabled={busy} />
          <FieldError message={shown.guardianEmail} />
        </Section>

        <Section title="Notes (optional)">
          <Field label="Anything the coordinator should know" value={form.notes} onChange={set("notes")} multiline disabled={busy} />
        </Section>

        {showErrors && errorCount > 0 && (
          <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.dangerSoft }}>
            <Copy style={{ fontWeight: "600" }} color={colors.danger}>
              Fix {errorCount} {errorCount === 1 ? "field" : "fields"} to submit
            </Copy>
          </View>
        )}

        {serverError && (
          <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.dangerSoft }}>
            <Copy color={colors.danger}>{serverError}</Copy>
          </View>
        )}

        <Button label={busy ? "Submitting…" : "Submit registration"} disabled={busy} onPress={() => void submit()} />
        <Button label="Discard entries" secondary disabled={busy} onPress={discardDraft} />
      </Screen>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Copy style={{ fontSize: 17, fontWeight: "600", paddingHorizontal: 4 }}>{title}</Copy>
      <ListSurface>
        <View style={{ padding: 16, gap: 10 }}>{children}</View>
      </ListSurface>
    </View>
  );
}

function FieldError({ message }: { message?: string }) {
  const { colors } = useAppTheme();
  if (!message) return null;
  return (
    <View style={styles.row}>
      <Copy kind="caption" color={colors.danger}>{message}</Copy>
    </View>
  );
}
