import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import type { SundaySchoolFeedbackResponse, SundaySchoolFeedbackStatus } from "@stmark/contracts";
import { Button, Copy, ListSurface, Screen, StatusPill } from "@/components/ui";
import { Choice, Field, ResourceState, confirmAction, useAction } from "@/components/forms";
import { endpoint, query, request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import {
  DEVELOPMENT_TEAM_LABEL,
  isResolved,
  statusLabel,
  submittedLabel,
  typeLabel,
  validateFeedbackResponseDraft,
} from "@/data/sunday-school-feedback";
import { FeedbackComposerSheet } from "@/components/feedback-composer-sheet";
import { MinistryTintProvider, useAppTheme } from "@/theme";

const STATUSES: SundaySchoolFeedbackStatus[] = ["OPEN", "PLANNED", "IN_PROGRESS", "COMPLETED", "DECLINED"];
const VOTE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "No vote" },
  { value: "UP", label: "Upvote" },
  { value: "DOWN", label: "Downvote" },
];

export default function FeedbackDetail() {
  return (
    <MinistryTintProvider ministry="sundaySchool">
      <FeedbackDetailScreen />
    </MinistryTintProvider>
  );
}

function FeedbackDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const { user } = useAuth();
  // Same cache entry the list screen warms — no dedicated single-item route
  // exists (nor is one needed), so this finds its item in the same already-
  // fetched "ALL" list, same as Visitations' child screen does for a class.
  const resource = useResource<SundaySchoolFeedbackResponse>(`${endpoint("feedback")}?${query({ status: "ALL", sort: "TOP" })}`);
  const idea = resource.data?.ideas.find((i) => i.id === id);

  const [editing, setEditing] = useState(false);
  const voteAction = useAction();
  const statusAction = useAction();
  const responseAction = useAction();

  const [responseDraft, setResponseDraft] = useState("");
  const draftReady = useRef(false);
  const draftKey = user && idea ? `stmark.feedback-response-draft.${user.id}.${idea.id}` : null;

  useEffect(() => {
    draftReady.current = false;
    if (!draftKey || !idea) return;
    (async () => {
      let draft: string | null = null;
      try {
        draft = await SecureStore.getItemAsync(draftKey);
      } catch {
        /* a corrupt draft is discarded, not fatal */
      }
      setResponseDraft(draft ?? idea.teamResponse ?? "");
      draftReady.current = true;
    })();
    // Only the idea's identity matters here, not its full reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, idea?.id]);

  useEffect(() => {
    if (!draftKey || !draftReady.current) return;
    void SecureStore.setItemAsync(draftKey, responseDraft, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }).catch(() => undefined);
  }, [draftKey, responseDraft]);

  if (!resource.data && !resource.error) {
    return (
      <Screen>
        <ResourceState loading retry={() => void resource.refresh()} />
      </Screen>
    );
  }
  if (resource.error) {
    return (
      <Screen>
        <ResourceState loading={false} error={resource.error} retry={() => void resource.refresh()} />
      </Screen>
    );
  }
  if (!idea) {
    return (
      <Screen>
        <View style={{ paddingVertical: 32, alignItems: "center", gap: 6 }}>
          <Copy kind="heading">Feedback unavailable</Copy>
          <Copy kind="caption" style={{ textAlign: "center" }}>
            This item may have been deleted, or you no longer have access. Go back and refresh the list.
          </Copy>
        </View>
      </Screen>
    );
  }

  const resolved = isResolved(idea.status);

  function vote(value: string) {
    void voteAction.run(async () => {
      await request(`${endpoint("feedback", idea!.id)}/vote`, "PUT", { vote: value || null });
      await resource.refresh();
    });
  }

  function changeStatus(value: string) {
    confirmAction(
      "Change feedback status?",
      `Set this feedback to ${statusLabel(value as SundaySchoolFeedbackStatus).toLowerCase()}? This is visible to everyone who can see this feedback.`,
      () =>
        void statusAction.run(async () => {
          await request(endpoint("feedback", idea!.id), "PATCH", { status: value });
          await resource.refresh();
        }, "Status updated"),
    );
  }

  function publishResponse() {
    const validated = validateFeedbackResponseDraft(responseDraft);
    if (!validated) {
      confirmAction("Can't publish", "Write a response between 1 and 2,000 characters.", () => {});
      return;
    }
    confirmAction(
      "Publish this response?",
      `It will be shown publicly as "${DEVELOPMENT_TEAM_LABEL}" — never your own name.`,
      () =>
        void responseAction.run(async () => {
          await request(`${endpoint("feedback", idea!.id)}/response`, "PUT", { response: validated });
          if (draftKey) void SecureStore.deleteItemAsync(draftKey).catch(() => undefined);
          await resource.refresh();
        }, "Response published"),
    );
  }

  function removeResponse() {
    confirmAction(
      "Remove this response?",
      "The public reply will no longer be shown.",
      () =>
        void responseAction.run(async () => {
          await request(`${endpoint("feedback", idea!.id)}/response`, "DELETE");
          if (draftKey) void SecureStore.deleteItemAsync(draftKey).catch(() => undefined);
          setResponseDraft("");
          await resource.refresh();
        }, "Response removed"),
      true,
    );
  }

  function deleteIdea() {
    confirmAction(
      "Delete feedback permanently?",
      "The feedback and all its votes will be removed. This cannot be undone.",
      () =>
        void responseAction.run(async () => {
          await request(endpoint("feedback", idea!.id), "DELETE");
          await resource.refresh();
        }, "Feedback deleted"),
      true,
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "", headerLargeTitle: false }} />
      <Screen refreshing={resource.loading || resource.refreshing} onRefresh={() => void resource.refresh()}>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <StatusPill label={typeLabel(idea.type)} color={idea.type === "PROBLEM" ? colors.danger : colors.info} soft={idea.type === "PROBLEM" ? colors.dangerSoft : colors.infoSoft} />
            <StatusPill label={statusLabel(idea.status)} color={colors.text2} soft={colors.hover} />
          </View>
          <Copy kind="title">{idea.title}</Copy>
          <Copy kind="caption">{submittedLabel(idea)} · {idea.score} net votes</Copy>
        </View>

        {resolved && (
          <View style={{ padding: 12, borderRadius: 16, backgroundColor: colors.hover }}>
            <Copy kind="caption">This feedback is {statusLabel(idea.status).toLowerCase()}. Voting and editing are closed.</Copy>
          </View>
        )}

        {idea.description && <Copy>{idea.description}</Copy>}

        {idea.teamResponse && (
          <ListSurface style={{ padding: 14, gap: 4 }}>
            <Copy style={{ fontWeight: "600" }}>{DEVELOPMENT_TEAM_LABEL}</Copy>
            <Copy>{idea.teamResponse}</Copy>
          </ListSurface>
        )}

        {idea.canVote && (
          <Choice
            label="Your vote"
            value={idea.viewerVote ?? ""}
            disabled={voteAction.busy}
            options={VOTE_OPTIONS}
            onChange={vote}
          />
        )}

        <View style={{ flexDirection: "row", gap: 10 }}>
          {idea.canEdit && <Button secondary label="Edit feedback" onPress={() => setEditing(true)} />}
          {idea.canDelete && <Button secondary label="Delete" disabled={responseAction.busy} onPress={deleteIdea} />}
        </View>

        {resource.data?.viewer.canModerate && (
          <View style={{ gap: 10, marginTop: 6 }}>
            <Copy kind="heading">Internal moderation</Copy>
            <Choice
              label="Status"
              value={idea.status}
              disabled={statusAction.busy}
              options={STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
              onChange={changeStatus}
            />
            <Field
              label={`Public response (shown as "${DEVELOPMENT_TEAM_LABEL}")`}
              value={responseDraft}
              onChange={setResponseDraft}
              multiline
              disabled={responseAction.busy}
            />
            <Copy kind="caption">{responseDraft.trim().length}/2,000</Copy>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {idea.teamResponse && <Button secondary label="Remove response" disabled={responseAction.busy} onPress={removeResponse} />}
              <Button
                label={responseAction.busy ? "Saving…" : idea.teamResponse ? "Update response" : "Publish response"}
                disabled={responseAction.busy || !responseDraft.trim()}
                onPress={publishResponse}
              />
            </View>
          </View>
        )}
      </Screen>

      {editing && user && (
        <FeedbackComposerSheet
          idea={idea}
          userId={user.id}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await resource.refresh();
          }}
        />
      )}
    </>
  );
}
