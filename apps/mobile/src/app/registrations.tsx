import { useState } from "react";
import { Pressable, View } from "react-native";
import type {
  SundaySchoolDashboard,
  SundaySchoolRegistrationDetail,
  SundaySchoolRegistrationStatus,
  SundaySchoolRegistrationSummary,
} from "@stmark/contracts";
import { Button, Card, Copy, InitialsAvatar, Screen, StatusPill } from "@/components/ui";
import { Choice, Field, ResourceState, confirmAction, useAction } from "@/components/forms";
import { endpoint, query, request, useResource } from "@/data/resources";
import { usePortal } from "@/data/portal-provider";
import {
  STATUS_FILTERS,
  completenessLabel,
  duplicateCaption,
  genderLabel,
  guardianLine,
  isReviewable,
  levelAndBirthLine,
  reviewValidationError,
  statusLabel,
  statusTone,
  submittedLabel,
} from "@/data/sunday-school-child-registrations";
import { MinistryTintProvider, useAppTheme, type ThemeColors } from "@/theme";

const OFFLINE = "Could not reach the server. Check your connection and try again.";

/** {color, soft} for a status tone — an explicit map, since ThemeColors isn't a dynamic-key record. */
function toneColors(colors: ThemeColors, tone: "warning" | "success" | "danger" | "info") {
  if (tone === "success") return { color: colors.success, soft: colors.successSoft };
  if (tone === "danger") return { color: colors.danger, soft: colors.dangerSoft };
  if (tone === "info") return { color: colors.info, soft: colors.infoSoft };
  return { color: colors.warning, soft: colors.warningSoft };
}

export default function Registrations() {
  return (
    <MinistryTintProvider ministry="sundaySchool">
      <RegistrationsScreen />
    </MinistryTintProvider>
  );
}

function RegistrationsScreen() {
  const { colors } = useAppTheme();
  const [status, setStatus] = useState<SundaySchoolRegistrationStatus>("PENDING");
  const resource = useResource<SundaySchoolRegistrationSummary[]>(
    `${endpoint("child-registrations")}?${query({ status, summary: "1" })}`,
  );
  const dashboard = useResource<SundaySchoolDashboard>(endpoint("dashboard"));
  const offline = resource.error === OFFLINE;

  return (
    <Screen refreshing={resource.loading || resource.refreshing} onRefresh={() => void resource.refresh()}>
      <View style={{ paddingHorizontal: 4, gap: 4 }}>
        <Copy kind="title">Child registrations</Copy>
        <Copy kind="caption">Requests at levels you coordinate</Copy>
      </View>

      <Choice
        label="Status"
        compact
        value={status}
        onChange={(value) => setStatus(value as SundaySchoolRegistrationStatus)}
        options={STATUS_FILTERS}
      />

      {offline && resource.stale && (
        <View style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft }}>
          <Copy style={{ fontWeight: "600" }} color={colors.warning}>You're offline</Copy>
          <Copy kind="caption">Showing the last queue we had. Pull down to try again.</Copy>
        </View>
      )}
      {!resource.stale && (
        <ResourceState loading={resource.loading} error={offline ? undefined : resource.error} retry={() => void resource.refresh()} />
      )}

      {resource.data && !resource.data.length && (
        <Card>
          <Copy>No {statusLabel(status).toLowerCase()} registrations right now.</Copy>
        </Card>
      )}

      {resource.data?.map((r) => (
        <RegistrationCard
          key={r.id}
          registration={r}
          refresh={async () => {
            await Promise.all([resource.refresh(), dashboard.refresh()]);
          }}
        />
      ))}
    </Screen>
  );
}

function RegistrationCard({
  registration: r,
  refresh,
}: {
  registration: SundaySchoolRegistrationSummary;
  refresh: () => Promise<void>;
}) {
  const { colors } = useAppTheme();
  const { classes } = usePortal();
  const [expanded, setExpanded] = useState(false);
  const detail = useResource<SundaySchoolRegistrationDetail>(
    expanded ? endpoint("child-registrations", r.id) : null,
  );
  const [classId, setClassId] = useState("");
  const [note, setNote] = useState("");
  const action = useAction();
  const duplicate = duplicateCaption(r.duplicateSignal);
  const reviewable = isReviewable(r.status);
  const fullPhone = detail.data?.guardianPhone;

  const review = (decision: "approve" | "reject" | "request_changes") => {
    const validationError = reviewValidationError(decision, classId, note);
    if (validationError) {
      confirmAction("Can't continue", validationError, () => {});
      return;
    }
    const confirmCopy =
      decision === "approve"
        ? { title: "Approve registration?", message: "This creates the child's enrollment, places them into the selected class, and links their parent account." }
        : decision === "reject"
          ? { title: "Reject registration?", message: "This rejects the request and notifies the family. You can add an optional note." }
          : { title: "Request changes?", message: "This sends the request back to the family with your note, without rejecting it." };
    confirmAction(confirmCopy.title, confirmCopy.message, () => void action.run(async () => {
      await request(`${endpoint("child-registrations", r.id)}/review`, "POST", {
        action: decision,
        note: note || undefined,
        classId: decision === "approve" ? classId : undefined,
      });
      setNote("");
      await refresh();
    }, "Registration reviewed"), decision === "reject");
  };

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <InitialsAvatar name={`${r.firstName} ${r.lastName}`} size={46} variant="accent" />
        <View style={{ flex: 1, gap: 2 }}>
          <Copy style={{ fontWeight: "600", fontSize: 17 }}>{r.firstName} {r.lastName}</Copy>
          <Copy kind="caption">{levelAndBirthLine(r.intendedLevel, r.birthDate)} · {submittedLabel(r.createdAt)}</Copy>
        </View>
        <StatusPill label={statusLabel(r.status)} {...toneColors(colors, statusTone(r.status))} />
      </View>

      <Copy style={{ marginTop: 10 }}>{guardianLine({ guardianName: r.guardianName, guardianPhone: fullPhone ?? r.guardianPhone })}</Copy>
      <Copy kind="caption">{genderLabel(r.gender)} · {completenessLabel(r)}</Copy>

      {duplicate && (
        <View style={{ marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: colors.warningSoft }}>
          <Copy kind="caption" color={colors.warning} style={{ fontWeight: "600" }}>{duplicate}</Copy>
        </View>
      )}

      {r.notes && expanded && <Copy style={{ marginTop: 8 }}>{r.notes}</Copy>}
      {r.reviewNote && (r.status === "REJECTED" || r.status === "CHANGES_REQUESTED") && (
        <Copy kind="caption" style={{ marginTop: 6 }}>Reviewer note: {r.reviewNote}</Copy>
      )}
      {r.placedClass && <Copy kind="caption" style={{ marginTop: 6 }}>Placed in {r.placedClass.name}</Copy>}

      <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button" accessibilityLabel={expanded ? "Hide details" : "View details"}>
        <Copy kind="caption" color={colors.primary} style={{ marginTop: 10, fontWeight: "600" }}>
          {expanded ? "Hide details" : "View details"}
        </Copy>
      </Pressable>
      {expanded && <ResourceState loading={detail.loading} error={detail.error} retry={() => void detail.refresh()} />}
      {expanded && detail.data?.submittedBy && (
        <Copy kind="caption">Submitted by {detail.data.submittedBy.name} · {detail.data.submittedBy.email}</Copy>
      )}

      {reviewable && (
        <View style={{ marginTop: 12, gap: 10 }}>
          <Choice
            label="Place in class"
            value={classId}
            onChange={setClassId}
            disabled={action.busy}
            options={[
              { value: "", label: "Select a class..." },
              ...classes.filter((c) => c.canCoordinate && c.level === r.intendedLevel).map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          {expanded && (
            <Field
              label="Note to the family (required to request changes)"
              value={note}
              onChange={setNote}
              multiline
              disabled={action.busy}
            />
          )}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button secondary label="Reject" disabled={action.busy} onPress={() => review("reject")} />
            <Button label={action.busy ? "Saving…" : "Approve"} disabled={action.busy || !classId} onPress={() => review("approve")} />
          </View>
          <Button
            secondary
            label="Request changes"
            disabled={action.busy}
            onPress={() => {
              if (!expanded) setExpanded(true);
              review("request_changes");
            }}
          />
        </View>
      )}
    </Card>
  );
}
