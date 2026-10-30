import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import type { SundaySchoolFeedbackIdea, SundaySchoolFeedbackType } from "@stmark/contracts";
import { Copy, Icon } from "@/components/ui";
import { Field, confirmAction, useAction } from "@/components/forms";
import { endpoint, request } from "@/data/resources";
import {
  FEEDBACK_DESCRIPTION_MAX_LENGTH,
  FEEDBACK_TITLE_MAX_LENGTH,
  emptyComposerDraft,
  isComposerDraftDirty,
  validateFeedbackTitle,
  type FeedbackComposerDraft,
} from "@/data/sunday-school-feedback";
import { useAppTheme } from "@/theme";

const TYPES: SundaySchoolFeedbackType[] = ["IDEA", "PROBLEM"];

export function FeedbackComposerSheet({
  idea,
  userId,
  onClose,
  onSaved,
}: {
  idea?: SundaySchoolFeedbackIdea;
  userId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { colors } = useAppTheme();
  const isEdit = !!idea;
  const original: FeedbackComposerDraft = idea
    ? { type: idea.type, title: idea.title, description: idea.description ?? "" }
    : emptyComposerDraft();
  const draftKey = `stmark.feedback-draft.${userId}.${idea?.id ?? "new"}`;
  const [draft, setDraft] = useState(original);
  const draftReady = useRef(false);
  const action = useAction();
  const titleProblem = validateFeedbackTitle(draft.title);
  const blocked = action.busy || !!titleProblem;

  // Restore a draft left over from a dismissal or interruption, same pattern
  // every other composer in this app uses (servant attendance, visitation
  // entries): load on mount over the real starting values, save on every
  // change, clear only once the save actually succeeds.
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(draftKey);
        if (raw) setDraft(JSON.parse(raw));
      } catch {
        /* a corrupt draft is discarded, not fatal */
      } finally {
        draftReady.current = true;
      }
    })();
  }, [draftKey]);

  useEffect(() => {
    if (!draftReady.current) return;
    void SecureStore.setItemAsync(draftKey, JSON.stringify(draft), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }).catch(() => undefined);
  }, [draftKey, draft]);

  function clearDraft() {
    void SecureStore.deleteItemAsync(draftKey).catch(() => undefined);
  }

  function requestClose() {
    if (action.busy) return;
    if (isComposerDraftDirty(draft, original)) {
      confirmAction(
        "Discard changes?",
        "Your draft is saved and will still be here if you come back instead.",
        onClose,
        true,
      );
      return;
    }
    onClose();
  }

  function submit() {
    if (blocked) return;
    void action.run(async () => {
      await request(endpoint("feedback", idea?.id), isEdit ? "PATCH" : "POST", {
        type: draft.type,
        title: draft.title,
        description: draft.description,
      });
      clearDraft();
      await onSaved();
    }, isEdit ? "Feedback updated" : "Feedback posted");
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
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}
          >
            <Icon ios="xmark" android="close" size={18} />
          </Pressable>
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>{isEdit ? "Edit feedback" : "Post feedback"}</Copy>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isEdit ? "Save feedback" : "Post feedback"}
            accessibilityState={{ disabled: blocked, busy: action.busy }}
            disabled={blocked}
            onPress={submit}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.text, opacity: blocked ? 0.4 : 1 }}
          >
            <Icon ios="checkmark" android="check" size={18} color={colors.surface} />
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 32, gap: 18 }}>
          <View style={{ padding: 18, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 6 }}>
            <Copy kind="heading" style={{ fontSize: 22 }}>{isEdit ? "Refine your feedback" : "What’s on your mind?"}</Copy>
            <Copy kind="caption">Share an improvement or tell us what went wrong. Every submission is reviewed by the team.</Copy>
          </View>
          <SegmentedControl
            values={["Idea", "Problem"]}
            selectedIndex={TYPES.indexOf(draft.type)}
            onChange={({ nativeEvent }) => setDraft((d) => ({ ...d, type: TYPES[nativeEvent.selectedSegmentIndex] }))}
            enabled={!action.busy}
            style={{ width: "100%", minHeight: 36 }}
          />
          <Field
            label={draft.type === "PROBLEM" ? "Problem title" : "Idea title"}
            value={draft.title}
            onChange={(title) => setDraft((d) => ({ ...d, title }))}
            placeholder="Summarize the idea or bug"
            maxLength={FEEDBACK_TITLE_MAX_LENGTH}
            disabled={action.busy}
          />
          <Copy kind="caption" accessibilityLabel={`${draft.title.length} of ${FEEDBACK_TITLE_MAX_LENGTH} characters`} style={{ textAlign: "right" }}>
            {draft.title.length}/{FEEDBACK_TITLE_MAX_LENGTH}
          </Copy>
          <Field
            label="Details (optional)"
            value={draft.description}
            onChange={(description) => setDraft((d) => ({ ...d, description }))}
            placeholder="For bugs: what happened, what you expected, how to reproduce it."
            multiline
            maxLength={FEEDBACK_DESCRIPTION_MAX_LENGTH}
            disabled={action.busy}
          />
          <Copy kind="caption" accessibilityLabel={`${draft.description.length} of ${FEEDBACK_DESCRIPTION_MAX_LENGTH} characters`} style={{ textAlign: "right" }}>
            {draft.description.length}/{FEEDBACK_DESCRIPTION_MAX_LENGTH}
          </Copy>
        </ScrollView>
      </View>
    </Modal>
  );
}
