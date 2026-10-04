import { useState } from "react";
import { LayoutAnimation, Pressable, View } from "react-native";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { Button, Card, Copy, CopyableValue, styles } from "@/components/ui";
import { Field, Page, confirmAction, useAction } from "@/components/forms";
import { request, useResource } from "@/data/resources";
import { useAppTheme } from "@/theme";

type Submission = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  grade: string;
  fatherOfConfessionName: string | null;
  currentlyServing: boolean;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
};

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "ALL"] as const;

export default function PrepRegistrations() {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("PENDING");
  const resource = useResource<{ submissions: Submission[] }>(
    `/api/registration/submissions${status === "ALL" ? "" : `?status=${status}`}`,
  );
  const submissions = resource.data?.submissions ?? [];

  return (
    <Page title="Registrations" loading={resource.loading} error={resource.error} refresh={() => void resource.refresh()}>
      <Copy kind="caption">Review student applications</Copy>
      <SegmentedControl
        values={["Pending", "Approved", "Rejected", "All"]}
        selectedIndex={STATUSES.indexOf(status)}
        onChange={({ nativeEvent }) => setStatus(STATUSES[nativeEvent.selectedSegmentIndex] ?? "PENDING")}
        style={{ width: "100%", minHeight: 36 }}
      />
      {!submissions.length && resource.data && <Copy>No applications in this view.</Copy>}
      {submissions.map((s) => (
        <SubmissionCard key={s.id} submission={s} refresh={resource.refresh} />
      ))}
    </Page>
  );
}

function SubmissionCard({ submission: s, refresh }: { submission: Submission; refresh: () => Promise<void> }) {
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const action = useAction();
  const pending = s.status === "PENDING";

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  const review = (decision: "approve" | "reject") =>
    confirmAction(
      `${decision === "approve" ? "Approve" : "Reject"} application?`,
      decision === "approve"
        ? "This creates a Servants Prep student account with a temporary password."
        : "This rejects the application and notifies the applicant.",
      () =>
        void action.run(async () => {
          await request(`/api/registration/submissions/${encodeURIComponent(s.id)}/review`, "POST", {
            action: decision,
            note,
          });
          await refresh();
        }, "Application reviewed"),
      decision === "reject",
    );

  return (
    <Card style={{ gap: 10 }}>
      <View style={[styles.row, { alignItems: "flex-start" }]}>
        <View style={{ flex: 1, gap: 3 }}>
          <Copy style={{ fontWeight: "700" }}>{s.fullName}</Copy>
          <Copy kind="caption">
            {s.grade} · Submitted {new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </Copy>
        </View>
        {pending ? (
          <Pressable
            accessibilityRole="button"
            onPress={toggle}
            style={({ pressed }) => [styles.pill, { backgroundColor: colors.primarySoft, opacity: pressed ? 0.7 : 1 }]}
          >
            <Copy color={colors.primary} kind="caption" style={{ fontWeight: "600" }}>
              {expanded ? "Close" : "Review"}
            </Copy>
          </Pressable>
        ) : (
          <View style={[styles.pill, { backgroundColor: colors.hover }]}>
            <Copy kind="caption">{s.status[0] + s.status.slice(1).toLowerCase()}</Copy>
          </View>
        )}
      </View>
      <CopyableValue label="Email" value={s.email} kind="caption" />
      <CopyableValue label="Phone" value={s.phone} kind="caption" />
      {!!s.fatherOfConfessionName && <Copy kind="caption">Father of confession: {s.fatherOfConfessionName}</Copy>}
      <Copy kind="caption">{s.currentlyServing ? "Currently serving" : "Not currently serving"}</Copy>

      {pending && expanded && (
        <View style={{ gap: 10, paddingTop: 6, borderTopWidth: 1, borderColor: colors.border }}>
          <Field label="Review note" value={note} onChange={setNote} multiline disabled={action.busy} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button label="Approve" disabled={action.busy} onPress={() => review("approve")} />
            </View>
            <View style={{ flex: 1 }}>
              <Button secondary label="Reject" disabled={action.busy} onPress={() => review("reject")} />
            </View>
          </View>
        </View>
      )}
    </Card>
  );
}
