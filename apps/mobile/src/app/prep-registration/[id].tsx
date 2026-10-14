import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { MenuView } from "@expo/ui/community/menu";
import { Copy, Icon, InitialsAvatar, ListSurface, Screen, StatusPill } from "@/components/ui";
import { Field, ResourceState, confirmAction, useAction } from "@/components/forms";
import { request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";
import {
  canReviewRegistrations,
  canViewRegistrations,
  canSubmitReview,
  formatGrade,
  isIncomplete,
  type Submission,
} from "@/data/prep-registrations";

export default function PrepRegistrationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = canViewRegistrations(user?.role);
  const canReview = canReviewRegistrations(user?.role);

  const resource = useResource<Submission>(canView ? `/api/registration/submissions/${encodeURIComponent(id)}` : null);
  const submission = resource.data;
  const action = useAction();
  const [note, setNote] = useState("");

  const pending = submission?.status === "PENDING";

  function review(decision: "approve" | "reject") {
    if (!canSubmitReview(decision, note)) {
      Alert.alert("Note required", "Add a note explaining the rejection before continuing.");
      return;
    }
    confirmAction(
      `${decision === "approve" ? "Approve" : "Reject"} registration?`,
      decision === "approve"
        ? "This creates (or links) a Servants Prep student account with a temporary password and enrolls them for the active academic year."
        : "This rejects the application and notifies the applicant.",
      () =>
        void action.run(async () => {
          const result = await request<{ tempPassword: string | null; message: string }>(
            `/api/registration/submissions/${encodeURIComponent(id)}/review`,
            "POST",
            { action: decision, note },
          );
          await resource.refresh();
          if (result.tempPassword) {
            Alert.alert("Approved", `${result.message}\n\nTemporary password: ${result.tempPassword}`);
          } else {
            Alert.alert(result.message);
          }
        }),
      decision === "reject",
    );
  }

  function remove() {
    confirmAction(
      "Delete registration?",
      "This permanently removes the submission and any uploaded files. This cannot be undone.",
      () =>
        void action.run(async () => {
          await request(`/api/registration/submissions/${encodeURIComponent(id)}`, "DELETE");
          router.back();
        }),
      true,
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "Registration",
          headerRight: canReview
            ? () => (
                <MenuView
                  title="More"
                  actions={[{ id: "delete", title: "Delete submission", attributes: { destructive: true } }]}
                  onPressAction={({ nativeEvent }) => { if (nativeEvent.event === "delete") remove(); }}
                >
                  <Pressable accessibilityRole="button" accessibilityLabel="More" hitSlop={10}>
                    <Icon ios="ellipsis.circle" android="more_horiz" size={22} />
                  </Pressable>
                </MenuView>
              )
            : undefined,
        }}
      />
      <Screen refreshing={resource.loading} onRefresh={() => void resource.refresh()}>
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>Registrations are for Servants Prep reviewers.</Copy>
          </View>
        )}
        {canView && (
          <ResourceState loading={resource.loading} error={resource.error} retry={() => void resource.refresh()} />
        )}
        {canView && submission && (
          <>
            <View style={{ alignItems: "center", gap: 8, paddingVertical: 6 }}>
              <InitialsAvatar name={submission.fullName} size={76} variant="neutral" />
              <Copy style={{ fontSize: 28, lineHeight: 32, fontWeight: "500", textAlign: "center" }}>{submission.fullName}</Copy>
              <Copy kind="caption">
                Submitted {new Date(submission.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </Copy>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                <StatusPill
                  label={submission.status[0] + submission.status.slice(1).toLowerCase()}
                  color={submission.status === "APPROVED" ? colors.success : submission.status === "REJECTED" ? colors.danger : colors.warning}
                  soft={submission.status === "APPROVED" ? colors.successSoft : submission.status === "REJECTED" ? colors.dangerSoft : colors.warningSoft}
                />
                {isIncomplete(submission) && <StatusPill label="Incomplete" color={colors.muted} soft={colors.hover} />}
              </View>
            </View>

            <Section title="Personal">
              <Row label="Email" value={submission.email} />
              <Row label="Phone" value={submission.phone} />
              <Row label="Date of birth" value={new Date(`${submission.dateOfBirth.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} />
              <Row label="Grade" value={formatGrade(submission.grade)} last />
            </Section>

            <Section title="Church & service">
              <Row label="Father of confession" value={submission.fatherOfConfessionName ?? "Not provided"} />
              <Row
                label="Currently serving"
                value={submission.currentlyServing ? "Yes" : "No"}
              />
              <Row
                label="Previously served"
                value={submission.previouslyServed ? (submission.previousServiceLocation ?? "Yes") : "No"}
              />
              <Row
                label="Previously attended Prep"
                value={submission.previouslyAttendedPrep ? (submission.previousPrepLocation ?? "Yes") : "No"}
                last
              />
            </Section>

            <Section title="Mentor servant">
              <Row label="Name" value={submission.mentorName ?? "Not provided"} />
              <Row label="Phone" value={submission.mentorPhone ?? "Not provided"} />
              <Row label="Email" value={submission.mentorEmail ?? "Not provided"} last />
            </Section>

            {!pending && submission.reviewNote && (
              <Section title="Review note">
                <View style={{ padding: 16 }}>
                  <Copy kind="caption">{submission.reviewer?.name ?? "Reviewer"}</Copy>
                  <Copy style={{ marginTop: 2 }}>{submission.reviewNote}</Copy>
                </View>
              </Section>
            )}

            {pending && canReview && (
              <View style={{ gap: 12, paddingTop: 4 }}>
                <Field
                  label="Review note"
                  value={note}
                  onChange={setNote}
                  multiline
                  disabled={action.busy}
                  placeholder="Required to reject"
                />
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <ReviewButton label="Reject" tone="secondary" disabled={action.busy} onPress={() => review("reject")} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ReviewButton label="Approve" tone="primary" disabled={action.busy} onPress={() => review("approve")} />
                  </View>
                </View>
              </View>
            )}
          </>
        )}
      </Screen>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Copy style={{ fontSize: 17, fontWeight: "600" }}>{title}</Copy>
      <ListSurface>{children}</ListSurface>
    </View>
  );
}

function Row({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View style={[{ paddingVertical: 10 }, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
      <Copy kind="caption">{label}</Copy>
      <Copy style={{ marginTop: 2 }}>{value}</Copy>
    </View>
  );
}

/**
 * A plain pressable, not the shared Button — paired with its sibling in a
 * row here, and Button/NativeActionButton silently collapses to zero width
 * when placed next to another flexible sibling instead of stacked alone.
 */
function ReviewButton({ label, tone, disabled, onPress }: { label: string; tone: "primary" | "secondary"; disabled: boolean; onPress: () => void }) {
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
