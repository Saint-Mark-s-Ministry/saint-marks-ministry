import { useEffect, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { MenuView } from "@expo/ui/community/menu";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import * as SecureStore from "expo-secure-store";
import type { SundaySchoolPhoneCallOutcome } from "@stmark/contracts";
import { Button, Copy, Icon } from "@/components/ui";
import { Field, useAction } from "@/components/forms";
import { endpoint, request } from "@/data/resources";
import {
  CALL_NOTE_MAX_LENGTH,
  CALL_OUTCOMES,
  callOutcomeLabel,
  emptyCallDraft,
  isCallDraftDirty,
  validateCallDraft,
} from "@/data/sunday-school-phone-calls";
import { useAppTheme } from "@/theme";

export function PhoneCallEntrySheet({
  childId,
  childName,
  draftKey,
  onClose,
  onSaved,
}: {
  childId: string;
  childName: string;
  /** A stable per-user-per-child key, so a draft survives dismissal/backgrounding (SecureStore). */
  draftKey: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { colors } = useAppTheme();
  const today = new Date().toISOString().slice(0, 10);
  const blank = emptyCallDraft(today);
  const [draft, setDraft] = useState(blank);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const action = useAction();

  // Recover a draft left from an earlier interruption — this ticket's own
  // "preserve the draft note when the sheet is interrupted or dismissed."
  useEffect(() => {
    let active = true;
    (async () => {
      if (draftKey) {
        try {
          const raw = await SecureStore.getItemAsync(draftKey);
          if (raw && active) setDraft(JSON.parse(raw));
        } catch {
          /* a corrupt draft is discarded, not fatal */
        }
      }
      if (active) setDraftLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || !draftLoaded) return;
    void SecureStore.setItemAsync(draftKey, JSON.stringify(draft), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }).catch(() => undefined);
  }, [draftKey, draft, draftLoaded]);

  function clearDraft() {
    if (draftKey) void SecureStore.deleteItemAsync(draftKey).catch(() => undefined);
  }

  function requestClose() {
    if (!isCallDraftDirty(draft, blank)) {
      onClose();
      return;
    }
    Alert.alert("Discard this call?", "You have unsaved changes to this call entry.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: onClose },
    ]);
  }

  function save() {
    const error = validateCallDraft(draft, today);
    if (error) {
      Alert.alert("Can't save yet", error);
      return;
    }
    void action.run(async () => {
      await request(endpoint("phone-calls"), "POST", {
        childId,
        calledAt: draft.calledAt,
        outcome: draft.outcome,
        note: draft.note.trim(),
      });
      clearDraft();
      await onSaved();
    }, "Call saved");
  }

  const outcomeActions = CALL_OUTCOMES.map((value) => ({
    id: value,
    title: callOutcomeLabel(value),
    state: draft.outcome === value ? ("on" as const) : ("off" as const),
  }));

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={requestClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, paddingTop: 24 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            disabled={action.busy}
            onPress={requestClose}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}
          >
            <Icon ios="xmark" android="close" size={18} />
          </Pressable>
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>Log a call</Copy>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save"
            disabled={action.busy}
            onPress={save}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary }}
          >
            <Icon ios="checkmark" android="check" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 14 }}>
          <Copy kind="caption">{childName}</Copy>
          <Copy kind="caption">
            This records a phone call for follow-up — it never creates or completes a visitation.
          </Copy>

          <View style={{ gap: 7 }}>
            <Copy kind="caption">Call date</Copy>
            <DateTimePicker
              value={new Date(`${draft.calledAt}T00:00:00`)}
              mode="date"
              maximumDate={new Date()}
              display={Platform.OS === "ios" ? "compact" : "default"}
              onValueChange={(_, date) => setDraft((d) => ({ ...d, calledAt: date.toISOString().slice(0, 10) }))}
              accentColor={colors.primary}
            />
          </View>

          <View style={{ gap: 7 }}>
            <Copy kind="caption">Outcome</Copy>
            <MenuView
              title="Outcome"
              actions={outcomeActions}
              onPressAction={({ nativeEvent }) => setDraft((d) => ({ ...d, outcome: nativeEvent.event as SundaySchoolPhoneCallOutcome }))}
            >
              <View
                style={{
                  minHeight: 50,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  paddingHorizontal: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Copy color={draft.outcome ? colors.text : colors.muted}>
                  {draft.outcome ? callOutcomeLabel(draft.outcome) : "Choose an outcome"}
                </Copy>
                <Icon ios="chevron.up.chevron.down" android="unfold_more" size={15} color={colors.muted} />
              </View>
            </MenuView>
          </View>

          <Field
            label="Note"
            multiline
            placeholder="What came of the call, and any next steps…"
            value={draft.note}
            onChange={(v) => setDraft((d) => ({ ...d, note: v.slice(0, CALL_NOTE_MAX_LENGTH) }))}
            disabled={action.busy}
          />
          <Copy kind="caption">{draft.note.trim().length}/{CALL_NOTE_MAX_LENGTH}</Copy>

          <Button label={action.busy ? "Saving…" : "Save call"} disabled={action.busy} onPress={save} />
        </ScrollView>
      </View>
    </Modal>
  );
}
