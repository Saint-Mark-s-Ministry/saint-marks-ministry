import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { SundaySchoolFeedbackIdea } from "@stmark/contracts";
import { Copy, Icon } from "@/components/ui";
import { Field, confirmAction, useAction } from "@/components/forms";
import { TeamReply } from "@/components/feedback-board-parts";
import { endpoint, request } from "@/data/resources";
import {
  DEVELOPMENT_TEAM_LABEL,
  FEEDBACK_RESPONSE_MAX_LENGTH,
  replyDraftKey,
  validateFeedbackResponseDraft,
} from "@/data/sunday-school-feedback";
import { useAppTheme } from "@/theme";

/**
 * The Development Team's reply to one post. It is published as "Development Team", never under the signed-in
 * administrator's name (the server stores who replied for accountability and never sends it back). The draft
 * is kept on this device until the reply is published or removed, and a failed send leaves it untouched.
 */
export function FeedbackReplySheet({
  idea,
  userId,
  onClose,
  onSaved,
}: {
  idea: SundaySchoolFeedbackIdea;
  userId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { colors } = useAppTheme();
  const original = idea.teamResponse ?? "";
  const draftKey = replyDraftKey(userId, idea.id);
  const [draft, setDraft] = useState(original);
  const draftReady = useRef(false);
  const action = useAction();
  const validated = validateFeedbackResponseDraft(draft);

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(draftKey);
        if (stored) setDraft(stored);
      } catch {
        /* a corrupt draft is discarded, not fatal */
      } finally {
        draftReady.current = true;
      }
    })();
  }, [draftKey]);

  useEffect(() => {
    if (!draftReady.current) return;
    void SecureStore.setItemAsync(draftKey, draft, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }).catch(() => undefined);
  }, [draftKey, draft]);

  const clearDraft = () => void SecureStore.deleteItemAsync(draftKey).catch(() => undefined);

  function requestClose() {
    if (action.busy) return;
    if (draft !== original) {
      confirmAction("Close without publishing?", "Your draft is saved and will still be here if you come back.", onClose);
      return;
    }
    clearDraft();
    onClose();
  }

  function publish() {
    if (!validated) return;
    void action.run(async () => {
      await request(`${endpoint("feedback", idea.id)}/response`, "PUT", { response: validated });
      clearDraft();
      await onSaved();
    }, "Development Team reply published");
  }

  function remove() {
    confirmAction(
      "Remove this reply?",
      "It will no longer be shown on the board.",
      () =>
        void action.run(async () => {
          await request(`${endpoint("feedback", idea.id)}/response`, "DELETE");
          clearDraft();
          await onSaved();
        }, "Reply removed"),
      true,
    );
  }

  const blocked = action.busy || !validated;
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
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>{idea.teamResponse ? "Edit reply" : "Reply"}</Copy>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Publish reply"
            accessibilityState={{ disabled: blocked, busy: action.busy }}
            disabled={blocked}
            onPress={publish}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.text, opacity: blocked ? 0.4 : 1 }}
          >
            <Icon ios="checkmark" android="check" size={18} color={colors.surface} />
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 32, gap: 18 }}>
          <View style={{ padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 6 }}>
            <Copy kind="caption">Replying to</Copy>
            <Copy style={{ fontWeight: "600" }}>{idea.title}</Copy>
            {!!idea.description && <Copy color={colors.text2} numberOfLines={6}>{idea.description}</Copy>}
          </View>
          <Field
            label={`Reply (shown as “${DEVELOPMENT_TEAM_LABEL}”)`}
            value={draft}
            onChange={setDraft}
            multiline
            maxLength={FEEDBACK_RESPONSE_MAX_LENGTH}
            placeholder="Share an update or answer this feedback…"
            disabled={action.busy}
          />
          <Copy kind="caption" accessibilityLabel={`${draft.length} of ${FEEDBACK_RESPONSE_MAX_LENGTH} characters`} style={{ textAlign: "right" }}>
            {draft.length}/{FEEDBACK_RESPONSE_MAX_LENGTH}
          </Copy>
          <Copy kind="caption">Everyone who can see this board will read it as “{DEVELOPMENT_TEAM_LABEL}”. Your name is not shown.</Copy>
          {!!idea.teamResponse && (
            <View style={{ gap: 10 }}>
              <Copy kind="caption">Published now</Copy>
              <TeamReply response={idea.teamResponse} respondedAt={idea.teamRespondedAt} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove reply"
                disabled={action.busy}
                onPress={remove}
                style={({ pressed }) => ({ minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.dangerSoft, opacity: action.busy ? 0.5 : pressed ? 0.7 : 1 })}
              >
                <Copy color={colors.danger} style={{ fontWeight: "600" }}>Remove reply</Copy>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
