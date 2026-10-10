import { useEffect, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import * as SecureStore from "expo-secure-store";
import { Button, Copy, Icon } from "@/components/ui";
import { Field, useAction } from "@/components/forms";
import { endpoint, request } from "@/data/resources";
import {
  emptyEntryDraft,
  isEntryDraftDirty,
  validateEntryDraft,
  type EntryDraft,
} from "@/data/sunday-school-visitations";
import { useAppTheme } from "@/theme";

const STATUSES: EntryDraft["status"][] = ["DONE", "NOT_DONE"];
const STATUS_LABEL: Record<EntryDraft["status"], string> = { DONE: "Done", NOT_DONE: "Not done" };

export function VisitationEntrySheet({
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
  const blank = emptyEntryDraft(today);
  const [draft, setDraft] = useState<EntryDraft>(blank);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const action = useAction();

  // Recover a draft left from an earlier interruption (the sheet dismissed,
  // the app backgrounded, a crash) — the acceptance criteria's own "draft
  // entry is protected on dismissal and interruption."
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
    if (!isEntryDraftDirty(draft, blank)) {
      onClose();
      return;
    }
    Alert.alert("Discard this entry?", "You have unsaved changes to this visitation.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: onClose },
    ]);
  }

  function save() {
    const error = validateEntryDraft(draft, today);
    if (error) {
      Alert.alert("Can't save yet", error);
      return;
    }
    void action.run(async () => {
      await request(endpoint("visitations"), "POST", {
        childId,
        status: draft.status,
        visitedAt: draft.status === "DONE" ? draft.visitedAt : undefined,
        notes: draft.notes.trim() || undefined,
        privateNote: draft.privateNote.trim() || undefined,
      });
      clearDraft();
      await onSaved();
    }, "Visit saved");
  }

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
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>New visitation entry</Copy>
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

          <SegmentedControl
            values={STATUSES.map((s) => STATUS_LABEL[s])}
            selectedIndex={STATUSES.indexOf(draft.status)}
            onChange={({ nativeEvent }) => setDraft((d) => ({ ...d, status: STATUSES[nativeEvent.selectedSegmentIndex] }))}
            style={{ width: "100%", minHeight: 36 }}
          />

          {draft.status === "DONE" && (
            <View style={{ gap: 7 }}>
              <Copy kind="caption">Date visited</Copy>
              <DateTimePicker
                value={new Date(`${draft.visitedAt}T00:00:00`)}
                mode="date"
                maximumDate={new Date()}
                display={Platform.OS === "ios" ? "compact" : "default"}
                onValueChange={(_, date) => setDraft((d) => ({ ...d, visitedAt: date.toISOString().slice(0, 10) }))}
                accentColor={colors.primary}
              />
            </View>
          )}

          <Field
            label="Notes"
            multiline
            placeholder="Add notes or next steps for this visitation…"
            value={draft.notes}
            onChange={(v) => setDraft((d) => ({ ...d, notes: v }))}
            disabled={action.busy}
          />
          <Field
            label="Private note to priests"
            multiline
            placeholder="Add a confidential note…"
            value={draft.privateNote}
            onChange={(v) => setDraft((d) => ({ ...d, privateNote: v }))}
            disabled={action.busy}
          />
          <Copy kind="caption">Only priests and super admins can read the private note — it never appears in this child's shared history.</Copy>

          <Button label={action.busy ? "Saving…" : "Save visit"} disabled={action.busy} onPress={save} />
        </ScrollView>
      </View>
    </Modal>
  );
}
