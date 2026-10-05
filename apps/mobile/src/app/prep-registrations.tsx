import { useState } from "react";
import { Alert, Modal, Platform, Pressable, Share, View } from "react-native";
import { router, Stack } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { MenuView } from "@expo/ui/community/menu";
import { Button, Copy, Icon, InitialsAvatar, ListSurface, Screen, StatusPill, styles } from "@/components/ui";
import { Field, ResourceState, useAction } from "@/components/forms";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { apiOrigin } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";
import {
  canManageInviteCodes,
  canReviewServantApplications,
  canViewRegistrations,
  duplicateEmails,
  filterByStatus,
  formatGrade,
  inviteCodeStatus,
  inviteCodeSubtitle,
  isDuplicate,
  isIncomplete,
  type InviteCode,
  type StatusFilter,
  type Submission,
} from "@/data/prep-registrations";

const STATUSES: StatusFilter[] = ["PENDING", "APPROVED", "REJECTED", "ALL"];

export default function PrepRegistrations() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = canViewRegistrations(user?.role);
  const canManageCodes = canManageInviteCodes(user?.role);
  const canReviewServants = canReviewServantApplications(user?.role);

  const [status, setStatus] = useState<StatusFilter>("PENDING");
  const [generating, setGenerating] = useState(false);
  const submissions = useResource<{ submissions: Submission[] }>(canView ? "/api/registration/submissions?limit=200" : null);
  const codes = useResource<InviteCode[]>(canManageCodes ? "/api/registration/invite-codes" : null);

  const all = submissions.data?.submissions ?? [];
  const rows = filterByStatus(all, status);
  const dupes = duplicateEmails(all);
  const pendingCount = all.filter((s) => s.status === "PENDING").length;

  const copyLink = async () => {
    await Clipboard.setStringAsync(`${apiOrigin}/registration`);
    Alert.alert("Copied", "Registration link copied to clipboard.");
  };

  const refreshAll = () => {
    void submissions.refresh();
    void codes.refresh();
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Registrations",
          headerLeft: () => <MinistrySwitcherHeaderLeft ministry="prep" />,
          headerRight: Platform.OS === "ios"
            ? () => (
                <MenuView
                  title="More"
                  actions={[
                    { id: "copyLink", title: "Copy registration link" },
                    ...(canReviewServants ? [{ id: "servantApplications", title: "Servant applications" }] : []),
                  ]}
                  onPressAction={({ nativeEvent }) => {
                    if (nativeEvent.event === "copyLink") void copyLink();
                    if (nativeEvent.event === "servantApplications") router.push("/prep-servant-applications");
                  }}
                >
                  <Pressable accessibilityRole="button" accessibilityLabel="More" hitSlop={10}>
                    <Icon ios="ellipsis.circle" android="more_horiz" size={22} />
                  </Pressable>
                </MenuView>
              )
            : () => <TopActions />,
        }}
      />
      {Platform.OS === "ios" && <TopActions />}
      <Screen refreshing={submissions.loading} onRefresh={refreshAll}>
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>Registrations are for Servants Prep reviewers.</Copy>
          </View>
        )}

        {canView && (
          <>
            <Copy kind="caption">Review applications from the registration queue</Copy>
            <ResourceState loading={submissions.loading} error={submissions.error} retry={refreshAll} />

            <SegmentedControl
              values={[`Pending ${pendingCount || ""}`.trim(), "Approved", "Rejected", "All"]}
              selectedIndex={STATUSES.indexOf(status)}
              onChange={({ nativeEvent }) => setStatus(STATUSES[nativeEvent.selectedSegmentIndex] ?? "PENDING")}
              style={{ width: "100%", minHeight: 36 }}
            />

            {submissions.data && !rows.length && <Copy>No applications in this view.</Copy>}

            {!!rows.length && (
              <ListSurface>
                {rows.map((s, index) => (
                  <Pressable
                    key={s.id}
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: "/prep-registration/[id]", params: { id: s.id } })}
                    style={({ pressed }) => [
                      styles.compactRow,
                      index < rows.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                      { backgroundColor: pressed ? colors.primarySoft : "transparent" },
                    ]}
                  >
                    <InitialsAvatar name={s.fullName} variant="neutral" />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Copy style={{ fontWeight: "500" }} numberOfLines={1}>{s.fullName}</Copy>
                      <Copy kind="caption" numberOfLines={1}>
                        {new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {formatGrade(s.grade)}
                      </Copy>
                      {(isDuplicate(s, dupes) || isIncomplete(s)) && (
                        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                          {isDuplicate(s, dupes) && (
                            <StatusPill label="Duplicate" color={colors.warning} soft={colors.warningSoft} />
                          )}
                          {isIncomplete(s) && (
                            <StatusPill label="Incomplete" color={colors.muted} soft={colors.hover} />
                          )}
                        </View>
                      )}
                    </View>
                    <StatusPill
                      label={s.status[0] + s.status.slice(1).toLowerCase()}
                      color={s.status === "APPROVED" ? colors.success : s.status === "REJECTED" ? colors.danger : colors.warning}
                      soft={s.status === "APPROVED" ? colors.successSoft : s.status === "REJECTED" ? colors.dangerSoft : colors.warningSoft}
                    />
                  </Pressable>
                ))}
              </ListSurface>
            )}

            {canManageCodes && (
              <View style={{ gap: 10 }}>
                <View style={[styles.row, { justifyContent: "space-between" }]}>
                  <Copy style={{ fontSize: 17, fontWeight: "600" }}>Invite codes</Copy>
                  <Pressable accessibilityRole="button" onPress={() => setGenerating(true)}>
                    <Copy color={colors.primary} style={{ fontWeight: "500" }}>Generate</Copy>
                  </Pressable>
                </View>
                <ResourceState loading={codes.loading} error={codes.error} retry={() => void codes.refresh()} empty={!!codes.data && !codes.data.length} />
                {!!codes.data?.length && (
                  <ListSurface>
                    {codes.data.map((code, index) => (
                      <View
                        key={code.id}
                        style={[
                          styles.compactRow,
                          index < codes.data!.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                        ]}
                      >
                        <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft }}>
                          <Icon ios="ticket" android="confirmation_number" size={16} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <View style={[styles.row, { gap: 8 }]}>
                            <Copy style={{ fontWeight: "500" }}>{code.code}</Copy>
                            {inviteCodeStatus(code) !== "active" && (
                              <Copy kind="caption" color={colors.muted}>
                                {inviteCodeStatus(code)[0].toUpperCase() + inviteCodeStatus(code).slice(1)}
                              </Copy>
                            )}
                          </View>
                          <Copy kind="caption" numberOfLines={1}>{inviteCodeSubtitle(code)}</Copy>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => void Share.share({ message: `Use invite code ${code.code} to register for Servants Prep.` })}
                          style={({ pressed }) => [
                            { backgroundColor: colors.hover, borderRadius: 17, height: 34, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 },
                          ]}
                        >
                          <Copy kind="caption" style={{ fontWeight: "600" }}>Share</Copy>
                        </Pressable>
                      </View>
                    ))}
                  </ListSurface>
                )}
              </View>
            )}
          </>
        )}
      </Screen>

      {generating && (
        <GenerateCodeSheet
          onClose={() => setGenerating(false)}
          onCreated={() => {
            setGenerating(false);
            void codes.refresh();
          }}
        />
      )}
    </>
  );
}

function GenerateCodeSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { colors } = useAppTheme();
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const action = useAction();

  const uses = Number(maxUses);
  const canSubmit = Number.isFinite(uses) && uses >= 0;

  function submit() {
    if (!canSubmit) {
      Alert.alert("Invalid uses", "Enter 0 (unlimited) or a positive number of uses.");
      return;
    }
    void action.run(async () => {
      await request("/api/registration/invite-codes", "POST", { label: label || null, maxUses: uses });
      onCreated();
    }, "Invite code generated");
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 24, gap: 16 }}>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            disabled={action.busy}
            onPress={onClose}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}
          >
            <Icon ios="xmark" android="close" size={18} />
          </Pressable>
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>Generate invite code</Copy>
          <View style={{ width: 40 }} />
        </View>

        <Field label="Label (optional)" value={label} onChange={setLabel} disabled={action.busy} placeholder="Fall 2026 Registration" />
        <Field label="Max uses (0 = unlimited)" value={maxUses} onChange={setMaxUses} keyboardType="numeric" disabled={action.busy} />

        <Button label={action.busy ? "Generating…" : "Generate"} disabled={!canSubmit || action.busy} onPress={submit} />
      </View>
    </Modal>
  );
}
