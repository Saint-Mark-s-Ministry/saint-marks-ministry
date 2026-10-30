import { ActionSheetIOS, Alert, Platform, Pressable, View } from "react-native";
import type { SundaySchoolFeedbackIdea, SundaySchoolFeedbackStatus, SundaySchoolFeedbackVoteType } from "@stmark/contracts";
import { Copy, Icon, InitialsAvatar, ListSurface, StatusPill } from "@/components/ui";
import { confirmAction, useAction } from "@/components/forms";
import { FeedbackStatus } from "@/components/feedback-status";
import { InlineAction } from "@/components/inline-action";
import { useLargeType } from "@/components/attendance-history-parts";
import { endpoint, request } from "@/data/resources";
import { feedback } from "@/data/haptics";
import {
  DEVELOPMENT_TEAM_LABEL,
  FEEDBACK_STATUSES,
  ideaFootnote,
  nextVote,
  postedDate,
  statusLabel,
  typeLabel,
  type FeedbackCapabilities,
  type RoadmapColumn,
  ideaCapabilities,
} from "@/data/sunday-school-feedback";
import { useAppTheme } from "@/theme";

/**
 * One post on the shared board, with everything a reader needs in place: the full text, the Development Team's
 * reply, and the actions this viewer is allowed. There is no separate detail screen: the web board removed its
 * popup for the same reason. Editing and replying still open native sheets, because those are real editing.
 */
export function FeedbackEntry({
  idea,
  caps,
  viewerId,
  refresh,
  onEdit,
  onReply,
}: {
  idea: SundaySchoolFeedbackIdea;
  caps: FeedbackCapabilities;
  viewerId: string | undefined;
  refresh: () => Promise<void>;
  onEdit: (idea: SundaySchoolFeedbackIdea) => void;
  onReply: (idea: SundaySchoolFeedbackIdea) => void;
}) {
  const { colors } = useAppTheme();
  const stacked = useLargeType();
  const can = ideaCapabilities(idea, caps);
  // One lock per post: a second tap on any of its controls does nothing while a request is in flight.
  const action = useAction();

  function vote(requested: SundaySchoolFeedbackVoteType) {
    if (!can.canVote || action.busy) return;
    feedback("selection");
    void action.run(async () => {
      try {
        await request(`${endpoint("feedback", idea.id)}/vote`, "PUT", { vote: nextVote(idea.viewerVote, requested) });
      } finally {
        // A refusal (voting closed since this was loaded) is explained by the alert, and the list catches up.
        await refresh();
      }
    });
  }

  function changeStatus(value: string) {
    if (value === idea.status || action.busy) return;
    confirmAction(
      "Change feedback status?",
      `Set “${idea.title}” to ${statusLabel(value as SundaySchoolFeedbackStatus).toLowerCase()}? Everyone who can see this board will see the change.`,
      () =>
        void action.run(async () => {
          try {
            await request(endpoint("feedback", idea.id), "PATCH", { status: value });
          } finally {
            await refresh();
          }
        }),
    );
  }

  // The system action sheet, not an in-page menu: it is the native control for "choose one of these", and it
  // reads the same to VoiceOver as every other iOS sheet.
  function pickStatus() {
    const choices = FEEDBACK_STATUSES.filter((status) => status !== idea.status);
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: `Move “${idea.title}” to…`, options: [...choices.map(statusLabel), "Cancel"], cancelButtonIndex: choices.length },
        (index) => { if (index < choices.length) changeStatus(choices[index]); },
      );
      return;
    }
    Alert.alert("Change status", `Move “${idea.title}” to…`, [
      ...choices.map((status) => ({ text: statusLabel(status), onPress: () => changeStatus(status) })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  function remove() {
    confirmAction(
      "Delete this feedback?",
      `“${idea.title}” and all of its votes will be permanently deleted.`,
      () =>
        void action.run(async () => {
          try {
            await request(endpoint("feedback", idea.id), "DELETE");
          } finally {
            await refresh();
          }
        }, "Feedback deleted"),
      true,
    );
  }

  const hasActions = can.canChangeStatus || can.canReply || can.canEdit || can.canDelete;
  return (
    <ListSurface style={{ padding: 16, borderRadius: 16, gap: 14 }}>
      <View style={{ flexDirection: stacked ? "column" : "row", alignItems: "flex-start", gap: stacked ? 10 : 14 }}>
        <VoteRail idea={idea} enabled={can.canVote && !action.busy} busy={action.busy} horizontal={stacked} onVote={vote} />
        <View style={{ flex: stacked ? undefined : 1, minWidth: 0, alignSelf: "stretch", gap: 10 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Icon ios={idea.type === "PROBLEM" ? "ladybug" : "lightbulb"} android={idea.type === "PROBLEM" ? "bug_report" : "lightbulb_outline"} size={13} color={colors.muted} />
              <Copy kind="caption">{typeLabel(idea.type)}</Copy>
            </View>
            <FeedbackStatus status={idea.status} />
          </View>
          <Copy style={{ fontWeight: "600", fontSize: 16, lineHeight: 22 }}>{idea.title}</Copy>
          {!!idea.description && <Copy color={colors.text2} style={{ fontSize: 14, lineHeight: 21 }}>{idea.description}</Copy>}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <InitialsAvatar name={idea.submitter?.name} size={22} variant="neutral" />
            <Copy kind="caption" style={{ flex: 1, fontSize: 12 }}>{ideaFootnote(idea, viewerId)}</Copy>
          </View>
        </View>
      </View>

      {!!idea.teamResponse && <TeamReply response={idea.teamResponse} respondedAt={idea.teamRespondedAt} />}

      {hasActions && (
        <View style={{ gap: 10, borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {can.canChangeStatus && <InlineAction label={`Status: ${statusLabel(idea.status)}`} disabled={action.busy} onPress={pickStatus} />}
            {can.canReply && <InlineAction label={idea.teamResponse ? "Edit reply" : "Reply"} disabled={action.busy} onPress={() => onReply(idea)} />}
            {can.canEdit && <InlineAction label="Edit" disabled={action.busy} onPress={() => onEdit(idea)} />}
            {can.canDelete && <InlineAction label="Delete" destructive disabled={action.busy} onPress={remove} />}
          </View>
        </View>
      )}
    </ListSurface>
  );
}

/** The one public reply. It is always the Development Team's: the server never sends who wrote it, and neither does this. */
export function TeamReply({ response, respondedAt }: { response: string; respondedAt: string | null }) {
  const { colors } = useAppTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${DEVELOPMENT_TEAM_LABEL} reply. ${response}`}
      style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.primarySoft, padding: 12, gap: 6 }}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <Icon ios="bubble.left" android="chat_bubble_outline" size={13} color={colors.primary} />
        <Copy kind="caption" color={colors.primary} style={{ fontWeight: "600" }}>{DEVELOPMENT_TEAM_LABEL}</Copy>
        {!!respondedAt && <Copy kind="caption">· {postedDate(respondedAt)}</Copy>}
      </View>
      <Copy color={colors.text2} style={{ fontSize: 14, lineHeight: 21 }}>{response}</Copy>
    </View>
  );
}

function VoteRail({
  idea,
  enabled,
  busy,
  horizontal,
  onVote,
}: {
  idea: SundaySchoolFeedbackIdea;
  enabled: boolean;
  busy: boolean;
  horizontal: boolean;
  onVote: (vote: SundaySchoolFeedbackVoteType) => void;
}) {
  const { colors } = useAppTheme();
  const up = idea.viewerVote === "UP";
  const down = idea.viewerVote === "DOWN";
  const arrow = (direction: "UP" | "DOWN") => {
    const active = direction === "UP" ? up : down;
    const tint = active ? colors.primary : colors.muted;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          active
            ? `Remove your ${direction === "UP" ? "upvote" : "downvote"} for ${idea.title}`
            : `${direction === "UP" ? "Upvote" : "Downvote"} ${idea.title}`
        }
        accessibilityState={{ disabled: !enabled, selected: active, busy }}
        disabled={!enabled}
        onPress={() => onVote(direction)}
        hitSlop={4}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active ? colors.primarySoft : pressed ? colors.hover : "transparent",
          opacity: enabled || active ? 1 : 0.45,
        })}
      >
        <Icon ios={direction === "UP" ? "chevron.up" : "chevron.down"} android={direction === "UP" ? "keyboard_arrow_up" : "keyboard_arrow_down"} size={18} color={tint} />
      </Pressable>
    );
  };
  return (
    <View
      accessibilityLabel={`Voting for ${idea.title}. Net score ${idea.score}, ${idea.upvotes} upvotes and ${idea.downvotes} downvotes`}
      style={{
        flexDirection: horizontal ? "row" : "column",
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 24,
        backgroundColor: colors.surface,
        opacity: busy ? 0.6 : 1,
      }}
    >
      {arrow("UP")}
      <View accessibilityLiveRegion="polite">
        <Copy style={{ minWidth: 36, textAlign: "center", fontWeight: "700", fontSize: 15 }} color={up ? colors.primary : down ? colors.info : colors.text}>
          {idea.score}
        </Copy>
      </View>
      {arrow("DOWN")}
    </View>
  );
}

const postCount = (count: number) => `${count} ${count === 1 ? "post" : "posts"}`;

/** A roadmap stage: its name, what it means, how many posts, and its posts (or why there are none). */
export function RoadmapStage({
  column,
  emptyMessage,
  children,
}: {
  column: RoadmapColumn<SundaySchoolFeedbackIdea>;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  const tone = { PLANNED: colors.info, IN_PROGRESS: colors.warning, COMPLETED: colors.success } as Record<string, string>;
  const soft = { PLANNED: colors.infoSoft, IN_PROGRESS: colors.warningSoft, COMPLETED: colors.successSoft } as Record<string, string>;
  return (
    <View accessibilityLabel={`${column.label} feedback, ${postCount(column.ideas.length)}`} style={{ gap: 10 }}>
      <View accessibilityRole="header" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <View style={{ flex: 1, gap: 4, alignItems: "flex-start" }}>
          <StatusPill label={column.label} color={tone[column.status] ?? colors.muted} soft={soft[column.status] ?? colors.hover} />
          <Copy kind="caption">{column.description}</Copy>
        </View>
        <Copy kind="caption" accessibilityLabel={postCount(column.ideas.length)} style={{ fontVariant: ["tabular-nums"] }}>{column.ideas.length}</Copy>
      </View>
      {column.ideas.length ? (
        <View style={{ gap: 12 }}>{children}</View>
      ) : (
        <View style={{ padding: 18, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, alignItems: "center" }}>
          <Copy kind="caption" style={{ textAlign: "center" }}>{emptyMessage}</Copy>
        </View>
      )}
    </View>
  );
}
