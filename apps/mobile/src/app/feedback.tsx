import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, Stack } from "expo-router";
import type { SundaySchoolFeedbackIdea, SundaySchoolFeedbackResponse } from "@stmark/contracts";
import { Copy, Icon, InitialsAvatar, ListSurface, Screen } from "@/components/ui";
import { ResourceState, useAction } from "@/components/forms";
import { endpoint, query, request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import {
  applyFeedbackView,
  DEVELOPMENT_TEAM_LABEL,
  filterByCategory,
  matchesSearch,
  responsePreview,
  statusLabel,
  submittedLabel,
  typeLabel,
  type FeedbackCategory,
  type FeedbackView,
} from "@/data/sunday-school-feedback";
import { FeedbackComposerSheet } from "@/components/feedback-composer-sheet";
import { FeedbackStatus } from "@/components/feedback-status";
import { feedback } from "@/data/haptics";
import { MinistryTintProvider, useAppTheme } from "@/theme";

const OFFLINE = "Could not reach the server. Check your connection and try again.";
const VIEWS: FeedbackView[] = ["top", "newest", "mine"];
const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "IDEA", label: "Ideas" },
  { value: "PROBLEM", label: "Problems" },
];

export default function Feedback() {
  return (
    <MinistryTintProvider ministry="sundaySchool">
      <FeedbackScreen />
    </MinistryTintProvider>
  );
}

function FeedbackScreen() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const [viewIndex, setViewIndex] = useState(0);
  const [category, setCategory] = useState<FeedbackCategory>("ALL");
  const [search, setSearch] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  // "ACTIVE" vs "ALL" server status scope stays fixed here — the real
  // filtering this screen's three controls (Top/Newest/Mine, category,
  // search) all happen client-side over one "ALL" fetch, same as every
  // other list screen's convention in this app (fetch once, filter locally).
  const resource = useResource<SundaySchoolFeedbackResponse>(`${endpoint("feedback")}?${query({ status: "ALL", sort: "TOP" })}`);
  const offline = resource.error === OFFLINE;
  const view = VIEWS[viewIndex];

  const rows = useMemo(() => {
    const ideas = resource.data?.ideas ?? [];
    const categorized = filterByCategory(ideas, category);
    const searched = categorized.filter((idea) => matchesSearch(idea, search));
    return applyFeedbackView(searched, view, user?.id);
  }, [resource.data, category, search, view, user?.id]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Feedback",
          headerRight: resource.data?.viewer.canSubmit
            ? () => (
                <Pressable accessibilityRole="button" accessibilityLabel="Post feedback" onPress={() => setComposerOpen(true)} hitSlop={10}>
                  <Icon ios="plus" android="add" size={22} color={colors.primary} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <Stack.SearchBar
        autoCapitalize="none"
        placement="stacked"
        hideWhenScrolling={false}
        placeholder="Search feedback"
        onChangeText={(event) => setSearch(event.nativeEvent.text)}
        onCancelButtonPress={() => setSearch("")}
      />
      <Screen refreshing={resource.loading || resource.refreshing} onRefresh={() => void resource.refresh()}>
        <ListSurface style={{ padding: 20, borderRadius: 18, gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ padding: 7, borderRadius: 10, backgroundColor: colors.primarySoft }}>
              <Icon ios="bubble.left.and.bubble.right" android="forum" size={18} />
            </View>
            <Copy kind="caption" style={{ flex: 1, fontWeight: "500" }}>St. Mark Ministry · Feedback board</Copy>
          </View>
          <View style={{ gap: 6 }}>
            <Copy kind="heading" style={{ fontSize: 24, lineHeight: 30 }}>Help shape what’s next</Copy>
            <Copy color={colors.text2} style={{ fontSize: 14, lineHeight: 21 }}>
              Share ideas, report problems, and vote on what matters to you.
            </Copy>
          </View>
          {resource.data?.viewer.canSubmit && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Post feedback"
              onPress={() => { feedback("action"); setComposerOpen(true); }}
              style={({ pressed }) => ({
                minHeight: 46, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12,
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                backgroundColor: colors.text, opacity: pressed ? 0.75 : 1,
              })}
            >
              <Icon ios="plus" android="add" size={17} color={colors.surface} />
              <Copy color={colors.surface} style={{ fontSize: 14, fontWeight: "600" }}>Post feedback</Copy>
            </Pressable>
          )}
        </ListSurface>

        <View style={{ gap: 12 }}>
          <View accessibilityRole="tablist" style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: colors.border }}>
            {["Top", "Newest", "Mine"].map((label, index) => (
              <Pressable
                key={label}
                accessibilityRole="tab"
                accessibilityState={{ selected: viewIndex === index }}
                onPress={() => { feedback("selection"); setViewIndex(index); }}
                style={{ flex: 1, minHeight: 46, justifyContent: "center", alignItems: "center", paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: viewIndex === index ? colors.text : "transparent" }}
              >
                <Copy style={{ fontSize: 14, fontWeight: viewIndex === index ? "600" : "400" }} color={viewIndex === index ? colors.text : colors.muted}>{label}</Copy>
              </Pressable>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {CATEGORIES.map((c) => (
              <FilterChip key={c.value} label={c.label} active={category === c.value} onPress={() => { feedback("selection"); setCategory(c.value); }} />
            ))}
          </ScrollView>
        </View>

        {offline && resource.stale && (
          <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.warning}>You're offline</Copy>
            <Copy kind="caption">Showing the last feedback we had. Pull down to try again.</Copy>
          </View>
        )}
        {!resource.stale && (
          <ResourceState loading={resource.loading} error={offline ? undefined : resource.error} retry={() => void resource.refresh()} />
        )}

        {resource.data && !rows.length && (
          <ListSurface style={{ padding: 24, gap: 8, alignItems: "center" }}>
            <Icon ios="bubble.left" android="chat_bubble_outline" size={28} color={colors.muted} />
            <Copy style={{ fontWeight: "600", textAlign: "center" }}>{resource.data.ideas.length ? "No matching feedback" : "Start the conversation"}</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>{resource.data.ideas.length ? "Try another search or category." : "Be the first to share an idea or report a problem."}</Copy>
          </ListSurface>
        )}

        {!!rows.length && (
          <View style={{ gap: 12 }}>
            <Copy kind="caption" accessibilityLabel={`${rows.length} feedback posts`}>{rows.length} {rows.length === 1 ? "post" : "posts"}</Copy>
            {rows.map((idea) => <FeedbackRow key={idea.id} idea={idea} refresh={resource.refresh} />)}
          </View>
        )}
      </Screen>

      {composerOpen && user && (
        <FeedbackComposerSheet
          userId={user.id}
          onClose={() => setComposerOpen(false)}
          onSaved={async () => {
            setComposerOpen(false);
            await resource.refresh();
          }}
        />
      )}
    </>
  );
}

function FeedbackRow({ idea, refresh }: { idea: SundaySchoolFeedbackIdea; refresh: () => Promise<void> }) {
  const { colors } = useAppTheme();
  const voteAction = useAction();
  const preview = responsePreview(idea);
  const upvoted = idea.viewerVote === "UP";

  const toggleUpvote = async () => {
    if (!idea.canVote || voteAction.busy) return;
    feedback("selection");
    await voteAction.run(async () => {
      await request(`${endpoint("feedback", idea.id)}/vote`, "PUT", { vote: idea.viewerVote === "UP" ? null : "UP" });
      await refresh();
    });
  };

  return (
    <ListSurface style={{ padding: 16, borderRadius: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${upvoted ? "Remove your upvote for" : "Upvote"} ${idea.title}, ${idea.score} net votes`}
          accessibilityState={{ disabled: !idea.canVote || voteAction.busy, selected: upvoted, busy: voteAction.busy }}
          disabled={!idea.canVote || voteAction.busy}
          onPress={() => void toggleUpvote()}
          style={({ pressed }) => ({
            width: 50,
            minHeight: 66,
            paddingVertical: 8,
            gap: 3,
            borderWidth: 1,
            borderColor: upvoted ? colors.primary : colors.border,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: upvoted ? colors.primarySoft : pressed ? colors.hover : colors.surface,
            opacity: !idea.canVote || voteAction.busy ? 0.5 : 1,
          })}
        >
          <Icon ios="chevron.up" android="keyboard_arrow_up" size={16} color={upvoted ? colors.primary : colors.muted} />
          <Copy style={{ fontWeight: "600", fontSize: 15 }} color={upvoted ? colors.primary : colors.text}>{idea.score}</Copy>
        </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${idea.title}. ${typeLabel(idea.type)}, ${statusLabel(idea.status)}. ${submittedLabel(idea)}`}
        accessibilityHint="Opens feedback details and voting options"
        onPress={() => router.push({ pathname: "/feedback/[id]", params: { id: idea.id } })}
        style={({ pressed }) => ({ flex: 1, minWidth: 0, gap: 10, opacity: pressed ? 0.7 : 1 })}
      >
        <Copy style={{ fontWeight: "600", fontSize: 16, lineHeight: 22 }}>{idea.title}</Copy>
        {idea.description && <Copy color={colors.text2} style={{ fontSize: 14, lineHeight: 20 }} numberOfLines={2}>{idea.description}</Copy>}
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon ios={idea.type === "PROBLEM" ? "ladybug" : "lightbulb"} android={idea.type === "PROBLEM" ? "bug_report" : "lightbulb_outline"} size={13} color={colors.muted} />
            <Copy kind="caption">{typeLabel(idea.type)}</Copy>
          </View>
          <FeedbackStatus status={idea.status} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <InitialsAvatar name={idea.submitter?.name} size={22} variant="neutral" />
          <Copy kind="caption" style={{ flex: 1, fontSize: 12 }}>{submittedLabel(idea)}</Copy>
        </View>
        {preview && (
          <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 10, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Icon ios="bubble.left" android="chat_bubble_outline" size={12} color={colors.primary} />
              <Copy kind="caption" color={colors.primary} style={{ fontWeight: "600", fontSize: 12 }}>{DEVELOPMENT_TEAM_LABEL}</Copy>
            </View>
            <Copy kind="caption" color={colors.text2} numberOfLines={2}>{preview}</Copy>
          </View>
        )}
      </Pressable>
      </View>
    </ListSurface>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: 14,
        justifyContent: "center",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: active ? colors.borderStrong : colors.border,
        backgroundColor: active ? colors.hover : colors.surface,
      }}
    >
      <Copy style={{ fontSize: 13, fontWeight: active ? "600" : "400", color: active ? colors.text : colors.muted }}>{label}</Copy>
    </Pressable>
  );
}
