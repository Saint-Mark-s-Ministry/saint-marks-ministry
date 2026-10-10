import { useState } from "react";
import { Pressable, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import type { SundaySchoolPriestNote, SundaySchoolVisitationsResponse } from "@stmark/contracts";
import { Copy, Icon, InitialsAvatar, ListSurface, Screen, SectionTitle, StatusPill } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { endpoint, query, useResource } from "@/data/resources";
import { usePortal } from "@/data/portal-provider";
import { useAuth } from "@/data/auth-provider";
import { shortMonthDay } from "@/data/sunday-school-classes";
import { confidentialNotesCaption } from "@/data/sunday-school-visitations";
import { callOutcomeLabel } from "@/data/sunday-school-phone-calls";
import { VisitationEntrySheet } from "@/components/visitation-entry-sheet";
import { PhoneCallEntrySheet } from "@/components/phone-call-entry-sheet";
import { MinistryTintProvider, serifDisplay, useAppTheme } from "@/theme";

const OFFLINE = "Could not reach the server. Check your connection and try again.";

export default function VisitationChild() {
  return (
    <MinistryTintProvider ministry="sundaySchool">
      <VisitationChildScreen />
    </MinistryTintProvider>
  );
}

function VisitationChildScreen() {
  const { childId, classId } = useLocalSearchParams<{ childId: string; classId: string }>();
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const portal = usePortal();
  const resource = useResource<SundaySchoolVisitationsResponse>(`${endpoint("visitations")}?${query({ classId })}`);
  const offline = resource.error === OFFLINE;

  const cls = resource.data?.classes.find((c) => c.id === classId);
  const child = cls?.children.find((c) => c.id === childId);

  const [notesOpen, setNotesOpen] = useState(false);
  const notes = useResource<{ notes: SundaySchoolPriestNote[] }>(
    notesOpen ? `${endpoint("priest-notes")}?${query({ childId })}` : null,
  );

  const [entryOpen, setEntryOpen] = useState(false);
  const draftKey = user ? `stmark.visitation-draft.${user.id}.${childId}` : null;

  const [callOpen, setCallOpen] = useState(false);
  const callDraftKey = user ? `stmark.phone-call-draft.${user.id}.${childId}` : null;

  const latest = child?.visitations[0] ?? null;

  return (
    <>
      <Stack.Screen options={{ title: "", headerLargeTitle: false }} />
      <Screen refreshing={resource.loading || resource.refreshing} onRefresh={() => void resource.refresh()} bottom={child && cls?.canEdit ? 110 : 32}>
        {offline && resource.stale && (
          <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.warning}>You're offline</Copy>
            <Copy kind="caption">Showing the last history we had. Pull down to try again once you're back online.</Copy>
          </View>
        )}
        {!resource.stale && (
          <ResourceState loading={resource.loading} error={offline ? undefined : resource.error} retry={() => void resource.refresh()} />
        )}

        {resource.data && !child && (
          <View style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}>
            <Copy kind="heading">Child unavailable</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>
              This child may have been reassigned to a different class, archived, or is no longer active. Go back and search again.
            </Copy>
          </View>
        )}

        {child && (
          <>
            <View style={{ alignItems: "center", gap: 6, paddingTop: 4 }}>
              <InitialsAvatar name={`${child.firstName} ${child.lastName}`} size={76} variant="accent" />
              <Copy style={{ fontFamily: serifDisplay, fontSize: 28, lineHeight: 32, fontWeight: "500" }}>
                {child.firstName} {child.lastName}
              </Copy>
              <Copy kind="caption">{cls?.name}</Copy>
              {latest && (
                <StatusPill
                  label={latest.status === "DONE" && latest.visitedAt ? `Visited ${shortMonthDay(latest.visitedAt)}` : "Not done"}
                  color={latest.status === "DONE" ? colors.success : colors.warning}
                  soft={latest.status === "DONE" ? colors.successSoft : colors.warningSoft}
                />
              )}
            </View>

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

            <ListSurface>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={notesOpen ? "Hide private notes to priests" : "Show private notes to priests"}
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
                  <Copy>Private notes to priests</Copy>
                  <Copy kind="caption">{confidentialNotesCaption(!!resource.data?.standing.isPriest)}</Copy>
                </View>
                <Icon ios={notesOpen ? "chevron.up" : "chevron.down"} android={notesOpen ? "expand_less" : "expand_more"} size={14} color={colors.muted} />
              </Pressable>
              {notesOpen && (
                <View style={{ borderTopWidth: 0.5, borderTopColor: colors.border, padding: 16, gap: 10 }}>
                  <ResourceState loading={notes.loading} error={notes.error} retry={() => void notes.refresh()} />
                  {notes.data && !notes.data.notes.length && <Copy kind="caption">No confidential notes visible to you.</Copy>}
                  {notes.data?.notes.map((n) => (
                    <View key={n.id} style={{ gap: 2 }}>
                      <Copy>{n.content}</Copy>
                      <Copy kind="caption">{n.author.name} · {shortMonthDay(n.createdAt)}</Copy>
                    </View>
                  ))}
                </View>
              )}
            </ListSurface>
          </>
        )}
      </Screen>

      {child && cls?.canEdit && (
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

      {entryOpen && child && (
        <VisitationEntrySheet
          childId={child.id}
          childName={`${child.firstName} ${child.lastName}`}
          draftKey={draftKey}
          onClose={() => setEntryOpen(false)}
          onSaved={async () => {
            setEntryOpen(false);
            await Promise.all([resource.refresh(), portal.refresh()]);
          }}
        />
      )}

      {callOpen && child && (
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
