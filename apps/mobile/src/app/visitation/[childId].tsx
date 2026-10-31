import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { Pressable, Switch, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import type { SundaySchoolVisitationsResponse } from "@stmark/contracts";
import { Copy, Icon, InitialsAvatar, ListSurface, Screen, SectionTitle, StatusPill } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { endpoint, query, useResource } from "@/data/resources";
import { usePortal } from "@/data/portal-provider";
import { useAuth } from "@/data/auth-provider";
import { shortMonthDay } from "@/data/sunday-school-classes";
import {
  PRIVATE_NOTES_PROBLEM_MESSAGE,
  PRIVATE_NOTES_TITLE,
  privateNoteFieldHint,
  privateNotesAccess,
  privateNotesCaption,
} from "@/data/private-notes";
import { usePrivateNotes } from "@/data/use-private-notes";
import { callOutcomeLabel, canLogPhoneCalls } from "@/data/sunday-school-phone-calls";
import { StudentHistoryLink } from "@/components/student-history-parts";
import { PriorityNoticeBanner, PriorityPill } from "@/components/priority-parts";
import { ABSENCE_UNAVAILABLE_BODY, ABSENCE_UNAVAILABLE_TITLE } from "@/data/absence-notifications";
import { useVisitationPriority } from "@/data/use-visitation-priority";
import { PRIORITY_EXPLAINER, PRIORITY_LABEL, canEditPriority, priorityToggleLabel } from "@/data/visitation-priority";
import { VisitationEntrySheet } from "@/components/visitation-entry-sheet";
import { PhoneCallEntrySheet } from "@/components/phone-call-entry-sheet";
import { MinistryTintProvider, useAppTheme, serifHero } from "@/theme";

const OFFLINE = "Could not reach the server. Check your connection and try again.";

export default function VisitationChild() {
  return (
    <MinistryTintProvider ministry="sundaySchool">
      <VisitationChildScreen />
    </MinistryTintProvider>
  );
}

function VisitationChildScreen() {
  const { childId, classId, check } = useLocalSearchParams<{ childId: string; classId?: string; check?: string }>();
  const { colors } = useAppTheme();
  const { user, viewingAs } = useAuth();
  const portal = usePortal();
  // A notification may name only the child, or a class the child has since left:
  // look in every class this person can see, which is the most the server will
  // ever return, so an unrelated or moved child simply is not found.
  const [anyClass, setAnyClass] = useState(!classId);
  const resource = useResource<SundaySchoolVisitationsResponse>(`${endpoint("visitations")}?${query({ classId: anyClass ? undefined : classId })}`);
  const offline = resource.error === OFFLINE;

  const priority = useVisitationPriority(resource.refresh);
  // Opened from an alert that may be old: ask the server before showing anything
  // cached, so a child this person can no longer see (moved, archived, access
  // removed) is never shown from memory.
  const mustCheck = check === "1";
  const [checkedPath, setCheckedPath] = useState<string | null>(null);
  const path = resource.path;
  useEffect(() => {
    if (!mustCheck || !path || checkedPath === path) return;
    let active = true;
    void resource.refresh().finally(() => {
      if (active) setCheckedPath(path);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mustCheck, path]);
  const checking = mustCheck && !!path && checkedPath !== path;
  const cls = checking ? undefined : resource.data?.classes.find((c) => c.children.some((c2) => c2.id === childId) && (!classId || anyClass || c.id === classId));
  const serverChild = cls?.children.find((c) => c.id === childId);
  useEffect(() => {
    if (!checking && resource.data && !serverChild && !anyClass) setAnyClass(true);
  }, [checking, resource.data, serverChild, anyClass]);
  // A toggle shows at once; the server's answer replaces it after the save.
  const child = serverChild && serverChild.id in priority.overrides
    ? { ...serverChild, visitationPriority: priority.overrides[serverChild.id] }
    : serverChild;
  const canStar = canEditPriority({ classCanEdit: !!cls?.canEdit, viewingAs: !!viewingAs });
  // Recording a visit follows the class's edit flag; View as is read-only. Phone calls add the
  // server's rule that a priest reads call history but does not log calls.
  const canRecord = !!cls?.canEdit && !viewingAs;
  const canCall = canLogPhoneCalls({ classCanEdit: !!cls?.canEdit, role: user?.role, standingIsPriest: resource.data?.standing.isPriest, viewingAs: !!viewingAs });

  const [notesOpen, setNotesOpen] = useState(false);
  // The response says whether this session may read confidential notes at all; unknown reads as no.
  const notesAccess = privateNotesAccess(resource.data?.standing);
  const notes = usePrivateNotes({ childId, access: notesAccess, open: notesOpen });

  const [entryOpen, setEntryOpen] = useState(false);
  const draftKey = user ? `stmark.visitation-draft.${user.id}.${childId}` : null;

  const [callOpen, setCallOpen] = useState(false);
  const callDraftKey = user ? `stmark.phone-call-draft.${user.id}.${childId}` : null;

  const latest = child?.visitations[0] ?? null;

  return (
    <>
      <Stack.Screen options={{ title: "Visitation" }} />
      <Screen refreshing={resource.loading || resource.refreshing} onRefresh={() => void resource.refresh()} bottom={child && canRecord ? 110 : 32}>
        {offline && resource.stale && (
          <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.warning}>You're offline</Copy>
            <Copy kind="caption">Showing the last history we had. Pull down to try again once you're back online.</Copy>
          </View>
        )}
        {!resource.stale && (
          <ResourceState loading={resource.loading} error={offline ? undefined : resource.error} retry={() => void resource.refresh()} />
        )}

        {checking && (
          <View accessibilityRole="progressbar" accessibilityLabel="Checking access" style={{ paddingVertical: 28, alignItems: "center", gap: 8 }}>
            <ActivityIndicator color={colors.primary} />
            <Copy kind="caption">Checking access…</Copy>
          </View>
        )}

        {!checking && resource.data && !child && anyClass && (
          <View style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}>
            <Copy kind="heading">{ABSENCE_UNAVAILABLE_TITLE}</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>{ABSENCE_UNAVAILABLE_BODY}</Copy>
          </View>
        )}

        {child && (
          <>
            <View style={{ alignItems: "center", gap: 6, paddingTop: 4 }}>
              <InitialsAvatar name={`${child.firstName} ${child.lastName}`} size={76} variant="accent" />
              <Copy style={{ ...serifHero, }}>
                {child.firstName} {child.lastName}
              </Copy>
              <Copy kind="caption">{cls?.name}</Copy>
              <StudentHistoryLink childId={child.id} name={`${child.firstName} ${child.lastName}`} />
              {latest && (
                <StatusPill
                  label={latest.status === "DONE" && latest.visitedAt ? `Visited ${shortMonthDay(latest.visitedAt)}` : "Not done"}
                  color={latest.status === "DONE" ? colors.success : colors.warning}
                  soft={latest.status === "DONE" ? colors.successSoft : colors.warningSoft}
                />
              )}
            </View>

            <PriorityNoticeBanner notice={priority.notice} onDismiss={priority.dismiss} />

            {/* The shared priority flag, kept apart from the visit and call histories below. */}
            <ListSurface>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Copy style={{ fontWeight: "500" }}>{PRIORITY_LABEL}</Copy>
                    {!canStar && child.visitationPriority && <PriorityPill />}
                  </View>
                  <Copy kind="caption">{PRIORITY_EXPLAINER}</Copy>
                </View>
                {canStar && (
                  <Switch
                    accessibilityLabel={priorityToggleLabel(`${child.firstName} ${child.lastName}`, child.visitationPriority)}
                    value={child.visitationPriority}
                    disabled={!!priority.saving[child.id]}
                    onValueChange={(next) => void priority.toggle(child.id, next)}
                  />
                )}
              </View>
            </ListSurface>

            <View style={{ gap: 10 }}>
              <SectionTitle title="History" />
              <ListSurface>
                {!child.visitations.length && (
                  <View style={{ padding: 14 }}>
                    <Copy kind="caption">No visits recorded yet.</Copy>
                  </View>
                )}
                {child.visitations.map((v, index, arr) => (
                  <View key={v.id}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 60 }}>
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: v.status === "DONE" ? colors.successSoft : colors.warningSoft,
                        }}
                      >
                        <Icon
                          ios={v.status === "DONE" ? "checkmark" : "clock"}
                          android={v.status === "DONE" ? "check" : "schedule"}
                          size={16}
                          color={v.status === "DONE" ? colors.success : colors.warning}
                        />
                      </View>
                      <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
                        <Copy numberOfLines={1} style={{ fontWeight: "500" }}>
                          {v.status === "DONE" ? "Done" : "Not done"} · {shortMonthDay(v.visitedAt ?? v.createdAt)}
                        </Copy>
                        <Copy kind="caption" numberOfLines={1}>{v.notes || "No notes added"}</Copy>
                      </View>
                    </View>
                    {index < arr.length - 1 && <View style={{ height: 0.5, marginLeft: 58, backgroundColor: colors.border }} />}
                  </View>
                ))}
              </ListSurface>
            </View>

            <View style={{ gap: 10 }}>
              <SectionTitle title="Phone calls" />
              <ListSurface>
                {!child.phoneCalls.length && (
                  <View style={{ padding: 14 }}>
                    <Copy kind="caption">No calls logged yet.</Copy>
                  </View>
                )}
                {child.phoneCalls.map((call, index, arr) => (
                  <View key={call.id}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 60 }}>
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: call.outcome === "CONNECTED" ? colors.successSoft : colors.hover,
                        }}
                      >
                        <Icon
                          ios="phone"
                          android="call"
                          size={16}
                          color={call.outcome === "CONNECTED" ? colors.success : colors.text2}
                        />
                      </View>
                      <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
                        <Copy numberOfLines={1} style={{ fontWeight: "500" }}>
                          {callOutcomeLabel(call.outcome)} · {shortMonthDay(call.calledAt)}
                        </Copy>
                        <Copy kind="caption" numberOfLines={1}>{call.note} — {call.callerName}</Copy>
                      </View>
                    </View>
                    {index < arr.length - 1 && <View style={{ height: 0.5, marginLeft: 58, backgroundColor: colors.border }} />}
                  </View>
                ))}
              </ListSurface>
            </View>

            {/* Hidden, and never requested, when the server says this session can't read confidential notes
                (Super Admin accounts, every View as session). */}
            {notesAccess !== "none" && (
              <ListSurface>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={notesOpen ? `Hide ${PRIVATE_NOTES_TITLE.toLowerCase()}` : `Show ${PRIVATE_NOTES_TITLE.toLowerCase()}`}
                  accessibilityState={{ expanded: notesOpen }}
                  onPress={() => setNotesOpen((v) => !v)}
                  style={({ pressed }) => [
                    { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
                    { backgroundColor: pressed ? colors.hover : "transparent" },
                  ]}
                >
                  <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.hover, alignItems: "center", justifyContent: "center" }}>
                    <Icon ios="lock.shield" android="shield" size={16} color={colors.text2} />
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Copy>{PRIVATE_NOTES_TITLE}</Copy>
                    <Copy kind="caption">{privateNotesCaption(notesAccess)}</Copy>
                  </View>
                  <Icon ios={notesOpen ? "chevron.up" : "chevron.down"} android={notesOpen ? "expand_less" : "expand_more"} size={14} color={colors.muted} />
                </Pressable>
                {notesOpen && (
                  <View style={{ borderTopWidth: 0.5, borderTopColor: colors.border, padding: 16, gap: 10 }}>
                    {notes.loading && <ResourceState loading error={undefined} retry={() => void notes.retry()} />}
                    {notes.problem && (
                      <View accessibilityRole="alert" accessible style={{ gap: 6 }}>
                        <Copy kind="caption">{PRIVATE_NOTES_PROBLEM_MESSAGE[notes.problem]}</Copy>
                        {notes.problem === "retry" && (
                          <Pressable accessibilityRole="button" accessibilityLabel="Try again" onPress={() => void notes.retry()} style={{ minHeight: 44, justifyContent: "center" }}>
                            <Copy color={colors.primary} style={{ fontWeight: "600" }}>Try again</Copy>
                          </Pressable>
                        )}
                      </View>
                    )}
                    {notes.notes && !notes.notes.length && <Copy kind="caption">No confidential notes visible to you.</Copy>}
                    {notes.notes?.map((n) => (
                      <View key={n.id} style={{ gap: 2 }}>
                        <Copy>{n.content}</Copy>
                        <Copy kind="caption">{n.author.name} · {shortMonthDay(n.createdAt)}</Copy>
                      </View>
                    ))}
                  </View>
                )}
              </ListSurface>
            )}
          </>
        )}
      </Screen>

      {child && canRecord && (
        <View
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: 24,
            backgroundColor: colors.surface,
            borderRadius: 26,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            shadowColor: "#000",
            shadowOpacity: 0.12,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <Copy kind="caption" numberOfLines={1} style={{ flex: 1 }}>
            {child.visitations.length} {child.visitations.length === 1 ? "visit" : "visits"} · {child.phoneCalls.length} {child.phoneCalls.length === 1 ? "call" : "calls"}
          </Copy>
          {canCall && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log a call"
              onPress={() => setCallOpen(true)}
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: colors.hover,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon ios="phone" android="call" size={18} color={colors.text} />
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New visitation entry"
            onPress={() => setEntryOpen(true)}
            style={{
              height: 48,
              paddingHorizontal: 18,
              borderRadius: 24,
              backgroundColor: colors.primary,
              flexDirection: "row",
              alignItems: "center",
              gap: 7,
            }}
          >
            <Icon ios="plus" android="add" size={16} color="#FFFFFF" />
            <Copy style={{ fontWeight: "600" }} color="#FFFFFF">New entry</Copy>
          </Pressable>
        </View>
      )}

      {entryOpen && child && canRecord && (
        <VisitationEntrySheet
          childId={child.id}
          childName={`${child.firstName} ${child.lastName}`}
          draftKey={draftKey}
          privateNoteHint={privateNoteFieldHint(notesAccess)}
          onClose={() => setEntryOpen(false)}
          onSaved={async () => {
            setEntryOpen(false);
            await Promise.all([resource.refresh(), portal.refresh()]);
          }}
        />
      )}

      {callOpen && child && canCall && (
        <PhoneCallEntrySheet
          childId={child.id}
          childName={`${child.firstName} ${child.lastName}`}
          draftKey={callDraftKey}
          onClose={() => setCallOpen(false)}
          onSaved={async () => {
            setCallOpen(false);
            await resource.refresh();
          }}
        />
      )}
    </>
  );
}
