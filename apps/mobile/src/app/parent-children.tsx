import { Linking, Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import type { SundaySchoolHomeworkResponse } from "@stmark/contracts";
import { Button, Copy, ListSurface, Screen, SectionTitle, StatusPill, styles } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { useAuth } from "@/data/auth-provider";
import { endpoint, useResource } from "@/data/resources";
import { savedLabel } from "@/data/prep-lessons";
import { levelLabel, canViewFamily, placementLabel, requestLabel, type Level, type RequestStatus } from "@/data/parent-children";
import { completionLabel } from "@/data/sunday-school-homework";
import { shortMonthDay } from "@/data/sunday-school-classes";
import { serifDisplay, useAppTheme } from "@/theme";

type Child = {
  id: string;
  firstName: string;
  lastName: string;
  level: Level;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  class: { id: string; name: string; level: Level } | null;
  relationshipLabel: string | null;
};

type PendingRequest = {
  id: string;
  status: RequestStatus;
  firstName: string;
  lastName: string;
  intendedLevel: Level;
  placedClass: { id: string; name: string } | null;
  createdAt: string;
};

type FamilyResponse = { children: Child[]; pendingRequests: PendingRequest[] };

const OFFLINE = "Could not reach the server. Check your connection and try again.";

const NEXT_STEP: Record<RequestStatus, string> = {
  PENDING: "A coordinator reviews this request. You'll see the outcome here.",
  APPROVED: "Approved. The child's class appears under My children.",
  REJECTED: "Not approved. Contact the Sunday School office for next steps.",
};

export default function ParentChildren() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = canViewFamily(user?.role);
  // The server returns only this parent's own guardian links and requests.
  const family = useResource<FamilyResponse>(canView ? "/api/parent/children" : null);
  // The real route itself scopes this to only this parent's linked
  // Elementary children (app/api/sunday-school/homework/route.ts's own
  // PARENT branch) — re-checked live, same as every other screen this
  // ticket touches.
  const homework = useResource<SundaySchoolHomeworkResponse>(canView ? endpoint("homework") : null);
  const now = new Date();
  const offline = family.error === OFFLINE;
  const children = family.data?.children ?? [];
  const requests = family.data?.pendingRequests ?? [];

  return (
    <>
      {/* The large heading below carries the title; an empty bar title avoids repeating it. */}
      <Stack.Screen options={{ title: "" }} />
      <Screen refreshing={family.loading || family.refreshing} onRefresh={() => void family.refresh()}>
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>This page is for parents.</Copy>
          </View>
        )}

        {canView && (
          <>
            <View style={{ paddingHorizontal: 4, gap: 2 }}>
              <Copy style={{ fontFamily: serifDisplay, fontSize: 34, lineHeight: 36, fontWeight: "500" }}>My children</Copy>
              <Copy kind="caption">Sunday School · St. Mark</Copy>
            </View>

            {family.stale && (
              <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}>
                <Copy style={{ fontWeight: "600" }} color={colors.warning}>
                  {offline ? "You're offline" : "Couldn't refresh"} · showing saved details
                </Copy>
                <Copy kind="caption">{family.updatedAt ? savedLabel(family.updatedAt, now) : "Saved earlier"}. Pull down to refresh.</Copy>
              </View>
            )}

            {!family.stale && <ResourceState loading={family.loading} error={family.error} retry={() => void family.refresh()} />}

            {family.data && (
              <>
                <View style={{ gap: 10 }}>
                  <Copy style={{ fontSize: 17, fontWeight: "600" }}>Children</Copy>
                  {!children.length && (
                    <Copy kind="caption">No children linked to your family yet. Register a child below.</Copy>
                  )}
                  {!!children.length && (
                    <ListSurface>
                      {children.map((child, index) => (
                        <View
                          key={child.id}
                          accessible
                          accessibilityLabel={`${child.firstName} ${child.lastName}, ${levelLabel(child.level)}, ${placementLabel(child.class)}, ${child.status === "ACTIVE" ? "enrolled" : "not active"}`}
                          style={[
                            { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 64 },
                            index < children.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                          ]}
                        >
                          <View style={{ flex: 1, gap: 2 }}>
                            <Copy style={{ fontWeight: "500" }}>{child.firstName} {child.lastName}</Copy>
                            <Copy kind="caption">{levelLabel(child.level)} · {placementLabel(child.class)}</Copy>
                          </View>
                          <StatusPill
                            label={child.status === "ACTIVE" ? "Enrolled" : "Not active"}
                            color={child.status === "ACTIVE" ? colors.success : colors.muted}
                            soft={child.status === "ACTIVE" ? colors.successSoft : colors.hover}
                          />
                        </View>
                      ))}
                    </ListSurface>
                  )}
                </View>

                {homework.data?.eligible && (
                  <View style={{ gap: 10 }}>
                    <SectionTitle title="Homework" />
                    <Copy kind="caption">Elementary homework assigned by your child&apos;s class servants</Copy>
                    <ListSurface>
                      {homework.data.weeks.filter((w) => w.homework).length === 0 && (
                        <View style={{ padding: 16 }}>
                          <Copy kind="caption">No homework has been assigned yet.</Copy>
                        </View>
                      )}
                      {homework.data.weeks.map((week, index, arr) => {
                        if (!week.homework) return null;
                        const relevantChildren = homework.data!.roster.filter(
                          (c) => c.classId === week.class.id || homework.data!.roster.length === 1,
                        );
                        return (
                          <View key={week.homework.id}>
                            <View style={{ padding: 16, gap: 6 }}>
                              <Copy kind="caption">
                                {week.class.name} · assigned {shortMonthDay(week.assignedDate)} · due {shortMonthDay(week.dueDate)}
                              </Copy>
                              <Copy style={{ fontWeight: "600", fontSize: 17 }}>{week.homework.title}</Copy>
                              {week.homework.instructions && <Copy>{week.homework.instructions}</Copy>}
                              {week.homework.resources.map((r) => (
                                <Pressable key={r.id} accessibilityRole="link" onPress={() => void Linking.openURL(r.url)}>
                                  <Copy color={colors.primary}>{r.title}</Copy>
                                </Pressable>
                              ))}
                              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                                {relevantChildren.map((child) => {
                                  const status = week.homework!.completions.find((c) => c.childId === child.id)?.status ?? "NOT_RECORDED";
                                  return (
                                    <Copy key={child.id} kind="caption">
                                      {relevantChildren.length > 1 ? `${child.firstName}: ` : ""}{completionLabel(status)}
                                    </Copy>
                                  );
                                })}
                              </View>
                            </View>
                            {index < arr.length - 1 && <View style={{ height: 0.5, backgroundColor: colors.border }} />}
                          </View>
                        );
                      })}
                    </ListSurface>
                  </View>
                )}

                {!!requests.length && (
                  <View style={{ gap: 10 }}>
                    <Copy style={{ fontSize: 17, fontWeight: "600" }}>Registrations</Copy>
                    <ListSurface>
                      {requests.map((request, index) => {
                        const pill = requestLabel(request.status);
                        const tone = pill.tone === "success" ? colors.success : pill.tone === "warning" ? colors.warning : colors.danger;
                        const soft = pill.tone === "success" ? colors.successSoft : pill.tone === "warning" ? colors.warningSoft : colors.dangerSoft;
                        return (
                          <View
                            key={request.id}
                            style={[{ padding: 16, gap: 6 }, index < requests.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}
                          >
                            <View style={[styles.row, { justifyContent: "space-between" }]}>
                              <Copy style={{ fontWeight: "500", flexShrink: 1 }}>{request.firstName} {request.lastName}</Copy>
                              <StatusPill label={pill.label} color={tone} soft={soft} />
                            </View>
                            <Copy kind="caption">
                              {levelLabel(request.intendedLevel)} · submitted {new Date(request.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </Copy>
                            <Copy kind="caption">{NEXT_STEP[request.status]}</Copy>
                          </View>
                        );
                      })}
                    </ListSurface>
                  </View>
                )}

                <Button label="Register a child" onPress={() => router.push("/parent-register")} />
              </>
            )}
          </>
        )}
      </Screen>
    </>
  );
}
