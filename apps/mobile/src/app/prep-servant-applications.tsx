import { useState } from "react";
import { Alert, Modal, Pressable, View } from "react-native";
import { Stack } from "expo-router";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { Copy, Icon, InitialsAvatar, ListSurface, Screen, StatusPill, styles } from "@/components/ui";
import { Field, ResourceState, confirmAction, useAction } from "@/components/forms";
import { request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";
import {
  canReviewServantApplications,
  canSubmitReview,
  filterByStatus,
  type ServantApplicationListItem,
  type StatusFilter,
} from "@/data/prep-registrations";

const STATUSES: StatusFilter[] = ["PENDING", "APPROVED", "REJECTED", "ALL"];

export default function PrepServantApplications() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canReview = canReviewServantApplications(user?.role);

  const [status, setStatus] = useState<StatusFilter>("PENDING");
  const [openId, setOpenId] = useState<string | null>(null);
  const resource = useResource<ServantApplicationListItem[]>(canReview ? "/api/servant-applications" : null);

  const all = resource.data ?? [];
  const rows = filterByStatus(all, status);
  const open = all.find((a) => a.id === openId) ?? null;

  return (
    <>
      <Stack.Screen options={{ title: "Servant applications" }} />
      <Screen refreshing={resource.loading} onRefresh={() => void resource.refresh()}>
        {!canReview && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>Servant applications are reviewed by Super Admins only.</Copy>
          </View>
        )}
        {canReview && (
          <>
            <Copy kind="caption">Review Sunday School servant sign-ups</Copy>
            <ResourceState loading={resource.loading} error={resource.error} retry={() => void resource.refresh()} />

            <SegmentedControl
              values={["Pending", "Approved", "Rejected", "All"]}
              selectedIndex={STATUSES.indexOf(status)}
              onChange={({ nativeEvent }) => setStatus(STATUSES[nativeEvent.selectedSegmentIndex] ?? "PENDING")}
              style={{ width: "100%", minHeight: 36 }}
            />

            {resource.data && !rows.length && <Copy>No applications in this view.</Copy>}

            {!!rows.length && (
              <ListSurface>
                {rows.map((a, index) => (
                  <Pressable
                    key={a.id}
                    accessibilityRole="button"
                    onPress={() => setOpenId(a.id)}
                    style={({ pressed }) => [
                      styles.compactRow,
                      index < rows.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                      { backgroundColor: pressed ? colors.primarySoft : "transparent" },
                    ]}
                  >
                    <InitialsAvatar name={a.fullName} variant="neutral" />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Copy style={{ fontWeight: "500" }} numberOfLines={1}>{a.fullName}</Copy>
                      <Copy kind="caption" numberOfLines={1}>
                        {new Date(a.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {a.currentGrade ? ` · Serves ${a.currentGrade}` : ""}
                      </Copy>
                    </View>
                    <StatusPill
                      label={a.status[0] + a.status.slice(1).toLowerCase()}
                      color={a.status === "APPROVED" ? colors.success : a.status === "REJECTED" ? colors.danger : colors.warning}
                      soft={a.status === "APPROVED" ? colors.successSoft : a.status === "REJECTED" ? colors.dangerSoft : colors.warningSoft}
                    />
                  </Pressable>
                ))}
              </ListSurface>
            )}
          </>
        )}
      </Screen>

      {open && (
        <ServantApplicationSheet
          application={open}
          onClose={() => setOpenId(null)}
          onReviewed={() => {
            setOpenId(null);
            void resource.refresh();
          }}
        />
      )}
    </>
  );
}

function ServantApplicationSheet({
  application: a,
  onClose,
  onReviewed,
}: {
  application: ServantApplicationListItem;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const { colors } = useAppTheme();
  const [note, setNote] = useState("");
  const action = useAction();
  const pending = a.status === "PENDING";

  function review(decision: "approve" | "reject") {
    if (!canSubmitReview(decision, note)) {
      Alert.alert("Note required", "Add a note explaining the rejection before continuing.");
      return;
    }
    confirmAction(
      `${decision === "approve" ? "Approve" : "Reject"} application?`,
      decision === "approve"
        ? "Approving creates a Sunday School Servant account. Share the temporary password with them directly."
        : "This rejects the application and notifies the applicant.",
      () =>
        void action.run(async () => {
          const result = await request<{ tempPassword?: string; message: string }>(
            `/api/servant-applications/${encodeURIComponent(a.id)}/review`,
            "POST",
            { action: decision, note },
          );
          if (result.tempPassword) {
            Alert.alert("Approved", `${result.message}\n\nTemporary password: ${result.tempPassword}`);
          } else {
            Alert.alert(result.message);
          }
          onReviewed();
        }),
      decision === "reject",
    );
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
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>Servant application</Copy>
          <View style={{ width: 40 }} />
        </View>

        <View style={{ alignItems: "center", gap: 8 }}>
          <InitialsAvatar name={a.fullName} size={76} variant="accent" />
          <Copy style={{ fontSize: 28, lineHeight: 32, fontWeight: "500", textAlign: "center" }}>{a.fullName}</Copy>
          <Copy kind="caption">
            {a.currentGrade ? `Serves ${a.currentGrade} · ` : ""}
            submitted {new Date(a.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </Copy>
          <StatusPill
            label={a.status[0] + a.status.slice(1).toLowerCase()}
            color={a.status === "APPROVED" ? colors.success : a.status === "REJECTED" ? colors.danger : colors.warning}
            soft={a.status === "APPROVED" ? colors.successSoft : a.status === "REJECTED" ? colors.dangerSoft : colors.warningSoft}
          />
        </View>

        <ListSurface>
          <View style={{ paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
            <Copy kind="caption">Email</Copy>
            <Copy style={{ marginTop: 2 }}>{a.email}</Copy>
          </View>
          <View style={{ paddingVertical: 10 }}>
            <Copy kind="caption">Phone</Copy>
            <Copy style={{ marginTop: 2 }}>{a.phone}</Copy>
          </View>
        </ListSurface>

        {!pending && a.reviewNote && (
          <ListSurface>
            <View style={{ padding: 16 }}>
              <Copy kind="caption">{a.reviewer?.name ?? "Reviewer"}</Copy>
              <Copy style={{ marginTop: 2 }}>{a.reviewNote}</Copy>
            </View>
          </ListSurface>
        )}

        {pending && (
          <>
            <Copy kind="caption">Approving creates a Sunday School Servant account. Share the temporary password with them directly.</Copy>
            <Field label="Review note" value={note} onChange={setNote} multiline disabled={action.busy} placeholder="Required to reject" />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <SheetButton label="Reject" tone="secondary" disabled={action.busy} onPress={() => review("reject")} />
              </View>
              <View style={{ flex: 1 }}>
                <SheetButton label="Approve" tone="primary" disabled={action.busy} onPress={() => review("approve")} />
              </View>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

function SheetButton({ label, tone, disabled, onPress }: { label: string; tone: "primary" | "secondary"; disabled: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        height: 52,
        borderRadius: 26,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tone === "primary" ? colors.action : colors.hover,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Copy style={{ fontWeight: "600" }} color={tone === "primary" ? colors.onAction : colors.text}>
        {label}
      </Copy>
    </Pressable>
  );
}
