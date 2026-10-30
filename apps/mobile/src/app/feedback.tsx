import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import type { SearchBarCommands } from "react-native-screens";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import type { SundaySchoolFeedbackIdea, SundaySchoolFeedbackResponse } from "@stmark/contracts";
import { Button, Copy, Icon, ListSurface, Screen } from "@/components/ui";
import { Choice, ResourceState } from "@/components/forms";
import { FeedbackComposerSheet } from "@/components/feedback-composer-sheet";
import { FeedbackFilterSheet } from "@/components/feedback-filter-sheet";
import { FeedbackReplySheet } from "@/components/feedback-reply-sheet";
import { FeedbackEntry, RoadmapStage } from "@/components/feedback-board-parts";
import { endpoint, query, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { feedback } from "@/data/haptics";
import {
  activeFilterCount,
  clearFeedbackFilters,
  feedbackCapabilities,
  feedbackLoadMessage,
  filterFeedback,
  hasActiveFilters,
  recallBoard,
  rememberBoard,
  roadmapColumns,
  roadmapEmptyMessage,
  type BoardMode,
  type FeedbackFilters,
} from "@/data/sunday-school-feedback";
import { useAppTheme } from "@/theme";

const OFFLINE = "Could not reach the server. Check your connection and try again.";
const MODES: BoardMode[] = ["board", "roadmap"];
const PAGE_SIZE = 20;

/**
 * The shared feedback board and roadmap. Sunday School servants and Servants Prep staff open this same screen,
 * read the same ideas from the same endpoint and see the same replies: it belongs to neither ministry, and being
 * able to read it grants no access to any class roster.
 */
export default function Feedback() {
  const { colors } = useAppTheme();
  const { user, viewingAs } = useAuth();
  const { idea: openedIdeaId } = useLocalSearchParams<{ idea?: string }>();
  const searchRef = useRef<SearchBarCommands>(null);
  const initial = useMemo(() => recallBoard(user?.id), [user?.id]);
  const [mode, setMode] = useState<BoardMode>(initial.mode);
  const [filters, setFilters] = useState<FeedbackFilters>(initial.filters);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<SundaySchoolFeedbackIdea | null>(null);
  const [replying, setReplying] = useState<SundaySchoolFeedbackIdea | null>(null);

  // One fetch of everything, scoped to the viewer: the flags (can vote, can edit, can moderate) are theirs, and
  // a preview as someone else must never be served the previewer's answer. Filtering is local, so it is instant
  // and survives a refresh.
  const resource = useResource<SundaySchoolFeedbackResponse>(
    `${endpoint("feedback")}?${query({ status: "ALL", sort: "TOP" })}`,
    user ? `feedback:${user.id}` : undefined,
  );
  const offline = resource.error === OFFLINE;
  const caps = feedbackCapabilities(resource.data?.viewer, !!viewingAs);
  const ideas = resource.data?.ideas ?? [];

  useEffect(() => {
    if (user) rememberBoard(user.id, mode, filters);
  }, [user, mode, filters]);

  // The search bar belongs to the navigation header, so a remembered search is put back into it.
  useEffect(() => {
    if (initial.filters.search) searchRef.current?.setText(initial.filters.search);
  }, [initial]);

  useEffect(() => setShown(PAGE_SIZE), [mode, filters]);

  const visible = useMemo(() => filterFeedback(ideas, filters, mode, user?.id), [ideas, filters, mode, user?.id]);
  const pinned = openedIdeaId ? ideas.find((idea) => idea.id === openedIdeaId) : undefined;
  const rest = pinned ? visible.filter((idea) => idea.id !== pinned.id) : visible;
  const filtered = hasActiveFilters(filters, mode);
  const badge = activeFilterCount(filters, mode);

  const patch = (next: Partial<FeedbackFilters>) => setFilters((current) => ({ ...current, ...next }));
  const clear = () => {
    searchRef.current?.clearText();
    setFilters(clearFeedbackFilters);
  };
  const closeComposer = () => setComposerOpen(false);
  const refresh = resource.refresh;

  const entry = (idea: SundaySchoolFeedbackIdea) => (
    <FeedbackEntry key={idea.id} idea={idea} caps={caps} viewerId={user?.id} refresh={refresh} onEdit={setEditing} onReply={setReplying} />
  );
  const message = feedbackLoadMessage(resource.errorStatus, offline ? undefined : resource.error);
  const refused = resource.errorStatus === 403;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Feedback",
          headerRight: caps.canSubmit
            ? () => (
                <Pressable accessibilityRole="button" accessibilityLabel="Post feedback" onPress={() => setComposerOpen(true)} hitSlop={10}>
                  <Icon ios="plus" android="add" size={22} color={colors.primary} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <Stack.SearchBar
        ref={searchRef}
        autoCapitalize="none"
        placement="stacked"
        hideWhenScrolling={false}
        placeholder="Search feedback"
        onChangeText={(event) => patch({ search: event.nativeEvent.text })}
        onCancelButtonPress={() => patch({ search: "" })}
      />
      <Screen refreshing={resource.loading || resource.refreshing} onRefresh={() => void resource.refresh()}>
        {!refused && (
        <ListSurface style={{ padding: 20, borderRadius: 18, gap: 14 }}>
          <View style={{ gap: 6 }}>
            <Copy kind="heading" style={{ fontSize: 24, lineHeight: 30 }}>Help shape what’s next</Copy>
            <Copy color={colors.text2} style={{ fontSize: 14, lineHeight: 21 }}>
              Share ideas, report problems, and vote on what matters. Servants Prep and Sunday School see the same board.
            </Copy>
          </View>
          {caps.canSubmit && (
            <Button label="Post feedback" onPress={() => { feedback("action"); setComposerOpen(true); }} />
          )}
        </ListSurface>
        )}

        {caps.previewing && (
          <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 16, backgroundColor: colors.hover }}>
            <Copy kind="caption">View as is read-only. You can read the board, but posting, voting, replying and status changes are off.</Copy>
          </View>
        )}

        {refused ? (
          <ListSurface style={{ padding: 24, gap: 8, alignItems: "center" }}>
            <Icon ios="lock" android="lock" size={26} color={colors.muted} />
            <Copy style={{ fontWeight: "600", textAlign: "center" }}>Feedback isn’t available</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>{message}</Copy>
          </ListSurface>
        ) : (
          <>
            <SegmentedControl
              values={["Feedback board", "Roadmap"]}
              selectedIndex={MODES.indexOf(mode)}
              onChange={({ nativeEvent }) => { feedback("selection"); setMode(MODES[nativeEvent.selectedSegmentIndex]); }}
              style={{ width: "100%", minHeight: 36 }}
            />

            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={badge ? `Filters, ${badge} applied` : "Filters"}
                accessibilityHint={`Sorted by ${filters.sort === "TOP" ? "top voted" : "newest"}`}
                onPress={() => { feedback("selection"); setFiltersOpen(true); }}
                style={{
                  minHeight: 44, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1,
                  borderColor: badge ? colors.borderStrong : colors.border, backgroundColor: badge ? colors.hover : colors.surface,
                }}
              >
                <Icon ios="line.3.horizontal.decrease" android="filter_list" size={15} color={colors.primary} />
                <Copy style={{ fontSize: 13, fontWeight: "600" }} color={colors.text}>{badge ? `Filters (${badge})` : "Filters"}</Copy>
              </Pressable>
              <Copy kind="caption">{filters.sort === "TOP" ? "Top voted" : "Newest"}</Copy>
              {!!filters.search.trim() && <Copy kind="caption" accessibilityLabel={`Searching for ${filters.search.trim()}`}>Search: “{filters.search.trim()}”</Copy>}
              {filtered && (
                <Pressable accessibilityRole="button" accessibilityLabel="Clear filters" onPress={clear} hitSlop={8} style={{ minHeight: 44, justifyContent: "center" }}>
                  <Copy color={colors.primary} style={{ fontWeight: "600" }}>Clear filters</Copy>
                </Pressable>
              )}
            </View>

            {offline && resource.stale && (
              <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}>
                <Copy style={{ fontWeight: "600" }} color={colors.warning}>You're offline</Copy>
                <Copy kind="caption">Showing the last feedback we had. Pull down to try again.</Copy>
              </View>
            )}
            {!resource.stale && <ResourceState loading={resource.loading} error={message} retry={() => void resource.refresh()} />}

            {resource.data && !visible.length && !pinned && (
              <ListSurface style={{ padding: 24, gap: 10, alignItems: "center" }}>
                <Icon ios="bubble.left" android="chat_bubble_outline" size={28} color={colors.muted} />
                <Copy style={{ fontWeight: "600", textAlign: "center" }}>{ideas.length ? "No matching feedback" : "Start the conversation"}</Copy>
                <Copy kind="caption" style={{ textAlign: "center" }}>
                  {ideas.length ? "Try another search or clear your filters." : "Share an idea or report a problem to help improve the app."}
                </Copy>
                {filtered ? (
                  <Button secondary label="Clear filters" onPress={clear} />
                ) : caps.canSubmit ? (
                  <Button label="Post the first feedback" onPress={() => setComposerOpen(true)} />
                ) : null}
              </ListSurface>
            )}

            {pinned && (
              <View style={{ gap: 8 }}>
                <Copy kind="caption" style={{ fontWeight: "600" }}>Opened from a notification</Copy>
                {entry(pinned)}
              </View>
            )}

            {resource.data && mode === "board" && !!rest.length && (
              <View style={{ gap: 12 }}>
                <View accessibilityLiveRegion="polite">
                  <Copy kind="caption">{visible.length} {visible.length === 1 ? "post" : "posts"}</Copy>
                </View>
                {rest.slice(0, shown).map(entry)}
                {rest.length > shown && <Button secondary label={`Show more (${rest.length - shown})`} onPress={() => setShown((count) => count + PAGE_SIZE)} />}
              </View>
            )}

            {resource.data && mode === "roadmap" && (
              <View style={{ gap: 22 }}>
                <Copy kind="caption">See what’s planned, what’s being worked on, and what’s ready to use.</Copy>
                {roadmapColumns(rest).map((column) => (
                  <RoadmapStage key={column.status} column={column} emptyMessage={roadmapEmptyMessage(column.status, filtered)}>
                    {column.ideas.slice(0, shown).map(entry)}
                    {column.ideas.length > shown && (
                      <Button secondary label={`Show more (${column.ideas.length - shown})`} onPress={() => setShown((count) => count + PAGE_SIZE)} />
                    )}
                  </RoadmapStage>
                ))}
              </View>
            )}
          </>
        )}
      </Screen>

      {filtersOpen && (
        <FeedbackFilterSheet
          mode={mode}
          filters={filters}
          onChange={(next) => {
            // The header search bar owns the text, so a clear from the sheet empties it too.
            if (!next.search && filters.search) searchRef.current?.clearText();
            setFilters(next);
          }}
          onClose={() => setFiltersOpen(false)}
        />
      )}
      {composerOpen && user && caps.canSubmit && (
        <FeedbackComposerSheet
          userId={user.id}
          onClose={closeComposer}
          onSaved={async () => {
            closeComposer();
            await refresh();
          }}
        />
      )}
      {editing && user && (
        <FeedbackComposerSheet
          idea={editing}
          userId={user.id}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
      {replying && user && caps.canModerate && (
        <FeedbackReplySheet
          idea={replying}
          userId={user.id}
          onClose={() => setReplying(null)}
          onSaved={async () => {
            setReplying(null);
            await refresh();
          }}
        />
      )}
    </>
  );
}
