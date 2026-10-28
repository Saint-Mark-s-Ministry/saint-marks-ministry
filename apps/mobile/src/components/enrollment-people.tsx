import { useState } from "react";
import { Alert, Linking, Modal, Pressable, ScrollView, View } from "react-native";
import { Button, Copy, Icon, ListSurface, StatusPill, styles } from "@/components/ui";
import { Field, ResourceState, confirmAction } from "@/components/forms";
import { useLargeType } from "@/components/attendance-history-parts";
import { feedback } from "@/data/haptics";
import { ApiError } from "@/data/api-client";
import { request, useResource } from "@/data/resources";
import {
  CONTACT_LABEL,
  MENTOR_ELIGIBILITY_NOTE,
  MENTOR_OPTIONS_PATH,
  NOT_PROVIDED,
  assignedMentorNote,
  contactActions,
  enrollmentPath,
  fatherActions,
  fatherSummary,
  mentorAssignmentBody,
  mentorAssignmentError,
  mentorChangedMessage,
  mentorChoices,
  mentorSummary,
  type ContactAction,
  type PrepEnrollmentPeople,
  type PrepMentorOption,
} from "@/data/roster-contacts";
import { useAppTheme } from "@/theme";

/**
 * A student's mentor and father of confession with native Call, Message and Email
 * actions. The mentor is the server's resolved contact (confirmed annual details
 * first); a missing value reads "Not provided".
 */
export function EnrollmentPeople({
  enrollment,
  onChangeMentor,
}: {
  enrollment: PrepEnrollmentPeople;
  /** Present only for someone who may assign mentors; shows a "Change mentor" row. */
  onChangeMentor?: () => void;
}) {
  const { colors } = useAppTheme();
  const mentor = mentorSummary(enrollment);
  const father = fatherSummary(enrollment);
  return (
    <ListSurface>
      <PersonBlock
        role="Mentor"
        name={mentor.name ?? (mentor.state === "awaiting-confirmation" ? "Awaiting this year's confirmation" : NOT_PROVIDED)}
        missing={!mentor.name}
        details={[
          { label: "Email", value: mentor.email },
          { label: "Phone", value: mentor.phone },
        ]}
        actions={contactActions(mentor)}
        note={assignedMentorNote(enrollment)}
        subject={mentor.name ?? "mentor"}
        divider
      />
      <PersonBlock
        role="Father of confession"
        name={father.name ?? NOT_PROVIDED}
        missing={!father.name}
        details={[
          { label: "Church", value: father.church },
          { label: "Phone", value: father.phone },
        ]}
        actions={father.name ? fatherActions(father) : []}
        subject={father.name ?? "father of confession"}
        divider={!!onChangeMentor}
      />
      {onChangeMentor && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mentor.name ? `Change mentor, currently ${mentor.name}` : "Assign a mentor"}
          onPress={onChangeMentor}
          style={({ pressed }) => [styles.compactRow, { backgroundColor: pressed ? colors.primarySoft : "transparent" }]}
        >
          <Copy style={{ flex: 1, fontWeight: "600", color: colors.primary }}>{mentor.name ? "Change mentor" : "Assign a mentor"}</Copy>
          <Icon ios="chevron.right" android="chevron_right" size={14} color={colors.muted} />
        </Pressable>
      )}
    </ListSurface>
  );
}

function PersonBlock({
  role,
  name,
  missing,
  details,
  actions,
  note,
  subject,
  divider,
}: {
  role: string;
  name: string;
  missing: boolean;
  details: { label: string; value: string | null }[];
  actions: ContactAction[];
  note?: string | null;
  subject: string;
  divider: boolean;
}) {
  const { colors } = useAppTheme();
  const stacked = useLargeType();
  return (
    <View
      style={[{ padding: 16, gap: 8 }, divider && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}
    >
      <Copy kind="caption">{role}</Copy>
      <Copy style={{ fontSize: 17, fontWeight: "600" }} color={missing ? colors.muted : undefined}>{name}</Copy>
      {details.map((detail) => (
        <View key={detail.label} style={{ flexDirection: stacked ? "column" : "row", gap: stacked ? 0 : 8 }} accessible accessibilityLabel={`${role} ${detail.label}: ${detail.value ?? NOT_PROVIDED}`}>
          <Copy kind="caption" style={{ width: stacked ? undefined : 56 }}>{detail.label}</Copy>
          <Copy style={{ flexShrink: 1 }} color={detail.value ? undefined : colors.muted}>{detail.value ?? NOT_PROVIDED}</Copy>
        </View>
      ))}
      {!!note && <Copy kind="caption">{note}</Copy>}
      {!!actions.length && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 4 }}>
          {actions.map((action) => (
            <Pressable
              key={action.kind}
              accessibilityRole="link"
              accessibilityLabel={`${CONTACT_LABEL[action.kind]} ${subject}`}
              onPress={() => void Linking.openURL(action.url).catch(() => Alert.alert("Can't open", `This device can't ${CONTACT_LABEL[action.kind].toLowerCase()} right now.`))}
              style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}
            >
              <Copy style={{ color: colors.primary, fontWeight: "600" }}>{CONTACT_LABEL[action.kind]}</Copy>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Pick a mentor for an enrollment from /api/mentor-options, or remove the current
 * one. The list is exactly what the server allows: nothing is filtered by role, so
 * an enabled Sunday School servant with an eligible tag appears even when their
 * primary role differs. The server re-checks eligibility on save.
 */
export function MentorPickerSheet({
  enrollmentId,
  studentName,
  currentMentorId,
  currentMentorName,
  onClose,
  onChanged,
}: {
  enrollmentId: string;
  studentName: string;
  currentMentorId: string | null;
  currentMentorName: string | null;
  onClose: () => void;
  /** Called after the server accepted the change, so the caller can refresh what depends on it. */
  onChanged: (message: string) => void;
}) {
  const { colors } = useAppTheme();
  const options = useResource<PrepMentorOption[]>(MENTOR_OPTIONS_PATH);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const choices = mentorChoices(options.data ?? [], currentMentorId, query);

  async function assign(mentor: PrepMentorOption | null) {
    setBusy(true);
    try {
      await request(enrollmentPath(enrollmentId), "PATCH", mentorAssignmentBody(mentor?.id ?? null));
      feedback("success");
      onChanged(mentorChangedMessage(mentor?.name ?? null));
    } catch (error) {
      feedback("error");
      Alert.alert("Mentor not changed", mentorAssignmentError(error instanceof ApiError ? error.status : null, error instanceof Error ? error.message : undefined));
      // The candidate list may be what changed (an account lost its tag): load it again.
      void options.refresh();
    } finally {
      setBusy(false);
    }
  }

  function choose(mentor: PrepMentorOption) {
    confirmAction(
      `Assign ${mentor.name}?`,
      `${mentor.name} becomes ${studentName}'s mentor${currentMentorName ? ` in place of ${currentMentorName}` : ""}.`,
      () => void assign(mentor),
    );
  }

  function remove() {
    confirmAction(
      "Remove mentor?",
      `${studentName} will have no mentor until one is assigned.`,
      () => void assign(null),
      true,
    );
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={busy ? () => undefined : onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 24, gap: 14 }}>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            disabled={busy}
            onPress={onClose}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}
          >
            <Icon ios="xmark" android="close" size={18} />
          </Pressable>
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>Choose a mentor</Copy>
          <View style={{ width: 44 }} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <Copy kind="caption">For {studentName}. {MENTOR_ELIGIBILITY_NOTE}</Copy>

        <Field label="Search" value={query} onChange={setQuery} placeholder="Name or email" disabled={busy} />

        <ResourceState loading={options.loading} error={options.error} retry={() => void options.refresh()} />

        {options.data && !choices.length && (
          <View style={{ paddingVertical: 18, alignItems: "center", gap: 4 }}>
            <Copy kind="heading">{options.data.length ? "No one matches" : "No mentors available"}</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>
              {options.data.length ? `Nobody matches "${query.trim()}".` : "No enabled account is currently eligible to be a mentor."}
            </Copy>
          </View>
        )}

        {!!choices.length && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, overflow: "hidden" }}>
            {choices.map(({ option, current }, index) => (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityLabel={`${option.name}, ${option.email}${current ? ", current mentor" : ""}`}
                accessibilityState={{ selected: current, disabled: busy || current }}
                disabled={busy || current}
                onPress={() => choose(option)}
                style={({ pressed }) => [
                  styles.compactRow,
                  index < choices.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                  { backgroundColor: pressed ? colors.primarySoft : "transparent" },
                ]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Copy style={{ fontWeight: "500" }} numberOfLines={2}>{option.name}</Copy>
                  <Copy kind="caption" numberOfLines={1}>{option.email}</Copy>
                </View>
                {current && <StatusPill label="Current" color={colors.success} soft={colors.successSoft} />}
              </Pressable>
            ))}
          </View>
        )}

        {currentMentorId && <Button secondary label={busy ? "Saving…" : "Remove mentor"} disabled={busy} onPress={remove} />}
        </ScrollView>
      </View>
    </Modal>
  );
}
