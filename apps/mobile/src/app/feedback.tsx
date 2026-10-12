import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, Stack } from "expo-router";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import type { SundaySchoolFeedbackIdea, SundaySchoolFeedbackResponse } from "@stmark/contracts";
import { Copy, Icon, ListSurface, Screen, StatusPill } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { endpoint, query, request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import {
  applyFeedbackView,
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
import { MinistryTintProvider, serifDisplay, useAppTheme, type ThemeColors } from "@/theme";

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

function typeTone(colors: ThemeColors, type: "IDEA" | "PROBLEM") {
  return type === "PROBLEM"
    ? { color: colors.danger, soft: colors.dangerSoft }
    : { color: colors.info, soft: colors.infoSoft };
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
          title: "",
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
        placement="automatic"
        placeholder="Search feedback"
        onChangeText={(event) => setSearch(event.nativeEvent.text)}
        onCancelButtonPress={() => setSearch("")}
      />
      <Screen refreshing={resource.loading || resource.refreshing} onRefresh={() => void resource.refresh()}>
        <View style={{ paddingHorizontal: 4, gap: 4 }}>
          <Copy style={{ fontFamily: serifDisplay, fontSize: 34, lineHeight: 36, fontWeight: "500" }}>Feedback</Copy>
          <Copy kind="caption">Vote on what matters most</Copy>
        </View>

        <SegmentedControl
          values={["Top", "Newest", "Mine"]}
          selectedIndex={viewIndex}
          onChange={({ nativeEvent }) => setViewIndex(nativeEvent.selectedSegmentIndex)}
          style={{ width: "100%", minHeight: 36 }}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {CATEGORIES.map((c) => (
            <FilterChip key={c.value} label={c.label} active={category === c.value} onPress={() => setCategory(c.value)} />
          ))}
        </ScrollView>

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
          <ListSurface style={{ padding: 16 }}>
            <Copy>{resource.data.ideas.length ? "Nothing matches this filter." : "No feedback yet. Be the first to share an idea."}</Copy>
          </ListSurface>
        )}

        {!!rows.length && (
          <ListSurface>
            {rows.map((idea, index) => (
              <View key={idea.id}>
                <FeedbackRow idea={idea} refresh={resource.refresh} />
                {index < rows.length - 1 && <View style={{ height: 0.5, marginLeft: 16, backgroundColor: colors.border }} />}
              </View>
            ))}
          </ListSurface>
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
  const [voting, setVoting] = useState(false);
  const preview = responsePreview(idea);
  const tone = typeTone(colors, idea.type);

  const toggleUpvote = async () => {
    if (!idea.canVote || voting) return;
    setVoting(true);
    try {
      await request(`${endpoint("feedback", idea.id)}/vote`, "PUT", { vote: idea.viewerVote === "UP" ? null : "UP" });
      await refresh();
    } catch {
      /* ResourceState/refresh already surfaces a retry; a toast-free best-effort here matches the row's compact design. */
    } finally {
      setVoting(false);
    }
  };

  return (
    <View style={{ flexDirection: "row", gap: 12, padding: 14 }}>
      <View style={{ alignItems: "center", gap: 2 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={idea.viewerVote === "UP" ? "Remove your upvote" : "Upvote"}
          accessibilityState={{ disabled: !idea.canVote, selected: idea.viewerVote === "UP" }}
          disabled={!idea.canVote || voting}
          onPress={() => void toggleUpvote()}
          style={{
            width: 44,
            height: 36,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: idea.viewerVote === "UP" ? colors.primarySoft : colors.hover,
            opacity: idea.canVote ? 1 : 0.4,
          }}
        >
          <Icon ios="chevron.up" android="arrow_upward" size={18} color={idea.viewerVote === "UP" ? colors.primary : colors.text2} />
        </Pressable>
        <Copy style={{ fontWeight: "600", fontSize: 15 }}>{idea.score}</Copy>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={idea.title}
        onPress={() => router.push({ pathname: "/feedback/[id]", params: { id: idea.id } })}
        style={{ flex: 1, gap: 4 }}
      >
        <View style={{ flexDirection: "row", gap: 6 }}>
          <StatusPill label={typeLabel(idea.type)} color={tone.color} soft={tone.soft} />
          <StatusPill label={statusLabel(idea.status)} color={colors.text2} soft={colors.hover} />
        </View>
        <Copy style={{ fontWeight: "500", fontSize: 17 }}>{idea.title}</Copy>
        <Copy kind="caption">{submittedLabel(idea)}</Copy>
        {preview && (
          <Copy kind="caption" color={colors.primary} numberOfLines={1}>
            Development Team: {preview}
          </Copy>
        )}
      </Pressable>
    </View>
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
        borderRadius: 22,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.primarySoft : colors.surface,
      }}
    >
      <Copy style={{ fontWeight: active ? "600" : "400", color: active ? colors.primary : colors.text }}>{label}</Copy>
    </Pressable>
  );
}
