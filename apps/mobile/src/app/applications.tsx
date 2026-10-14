import { useState } from "react";
import { Alert, LayoutAnimation, Pressable, View } from "react-native";
import { Button, Card, Copy, CopyableValue, Icon, styles } from "@/components/ui";
import {
  Choice,
  Field,
  Page,
  confirmAction,
  useAction,
} from "@/components/forms";
import { request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { MinistryTintProvider, useAppTheme } from "@/theme";

type Application = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  currentGrade: string | null;
  status: string;
  reviewNote: string | null;
};

const statuses = ["PENDING", "APPROVED", "REJECTED"].map((value) => ({
  value,
  label: value[0] + value.slice(1).toLowerCase(),
}));

export default function Applications() {
  const { user } = useAuth();
  const [status, setStatus] = useState("PENDING");
  const resource = useResource<Application[]>(
    user?.role === "SUPER_ADMIN"
      ? `/api/servant-applications?status=${status}`
      : null,
  );

  return (
    <MinistryTintProvider ministry="sundaySchool">
    <Page title="Servant applications" {...resource}>
      {user?.role !== "SUPER_ADMIN" ? (
        <Copy>Super-admin access is required.</Copy>
      ) : (
        <>
          <Choice
            label="Status"
            value={status}
            onChange={setStatus}
            options={statuses}
            compact
          />
          {resource.data && !resource.data.length && (
            <Copy>No applications in this view.</Copy>
          )}
          {resource.data?.map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
              refresh={resource.refresh}
            />
          ))}
        </>
      )}
    </Page>
    </MinistryTintProvider>
  );
}

function ApplicationCard({
  application,
  refresh,
}: {
  application: Application;
  refresh: () => Promise<void>;
}) {
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const action = useAction();
  const pending = application.status === "PENDING";
  const initials = application.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const toggleReview = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((value) => !value);
  };

  const review = (decision: "approve" | "reject") =>
    confirmAction(
      `${decision === "approve" ? "Approve" : "Reject"} application?`,
      decision === "approve"
        ? "This creates a servant account. It must change its temporary password before use. Class access still requires an assignment."
        : "This rejects the application.",
      () =>
        void action.run(async () => {
          const result = await request<{ tempPassword?: string }>(
            `/api/servant-applications/${encodeURIComponent(application.id)}/review`,
            "POST",
            { action: decision, note },
          );
          await refresh();
          Alert.alert(
            "Application reviewed",
            result.tempPassword
              ? `Temporary password: ${result.tempPassword}\nShare privately with the applicant. They must change it before use.`
              : "Review saved.",
          );
        }),
      decision === "reject",
    );

  return (
    <Card style={{ padding: 16, gap: 14 }}>
      <View style={[styles.row, { alignItems: "flex-start" }]}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.primarySoft,
          }}
        >
          <Copy color={colors.primary} style={{ fontWeight: "700" }}>
            {initials}
          </Copy>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Copy style={{ fontWeight: "700" }}>{application.fullName}</Copy>
          {application.currentGrade && (
            <Copy kind="caption">{application.currentGrade}</Copy>
          )}
        </View>
        {pending ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={`${expanded ? "Close" : "Review"} ${application.fullName}'s application`}
            disabled={action.busy}
            onPress={toggleReview}
            style={({ pressed }) => [
              styles.pill,
              {
                minHeight: 44,
                paddingHorizontal: 12,
                backgroundColor: colors.primarySoft,
                opacity: action.busy ? 0.45 : pressed ? 0.7 : 1,
              },
            ]}
          >
            <Copy color={colors.primary} style={{ fontWeight: "600" }}>
              {expanded ? "Close" : "Review"}
            </Copy>
            <Icon
              ios={expanded ? "chevron.up" : "chevron.down"}
              android={expanded ? "keyboard_arrow_up" : "keyboard_arrow_down"}
              size={15}
              color={colors.primary}
            />
          </Pressable>
        ) : (
          <View style={[styles.pill, { backgroundColor: colors.primarySoft }]}>
            <Copy kind="caption" color={colors.primary}>
              {application.status[0] +
                application.status.slice(1).toLowerCase()}
            </Copy>
          </View>
        )}
      </View>

      <View style={{ gap: 7, marginLeft: 54 }}>
        <CopyableValue label="Email" value={application.email} kind="caption" />
        {application.phone && <CopyableValue label="Phone" value={application.phone} kind="caption" />}
      </View>

      {application.reviewNote && !expanded && (
        <View
          style={{
            marginLeft: 54,
            paddingTop: 10,
            borderTopWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Copy kind="caption">Note: {application.reviewNote}</Copy>
        </View>
      )}

      {pending && expanded && (
        <View
          style={{
            gap: 12,
            paddingTop: 14,
            borderTopWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Field
            label="Optional review note"
            value={note}
            onChange={setNote}
            multiline
            disabled={action.busy}
            placeholder="Add a private note"
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Approve"
                disabled={action.busy}
                onPress={() => review("approve")}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                secondary
                label="Reject"
                disabled={action.busy}
                onPress={() => review("reject")}
              />
            </View>
          </View>
        </View>
      )}
    </Card>
  );
}
