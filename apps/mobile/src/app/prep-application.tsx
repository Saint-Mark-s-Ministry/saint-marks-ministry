import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, TextInput, View } from "react-native";
import { Stack } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as DocumentPicker from "expo-document-picker";
import type { SFSymbol, AndroidSymbol } from "expo-symbols";
import { Button, Card, CompactRow, Copy, Icon, ListSurface, Screen, SectionTitle } from "@/components/ui";
import { Field, ResourceState, useAction } from "@/components/forms";
import { api, useAuth } from "@/data/auth-provider";
import { invalidateResourceCache, request, useResource } from "@/data/resources";
import {
  applicationProgress,
  canViewOwnApplication,
  firstFieldProblem,
  validateApprovalFile,
  type ApplicationState,
  type FieldKey,
} from "@/data/prep-application";
import { serifDisplay, useAppTheme } from "@/theme";

const OFFLINE = "Could not reach the server. Check your connection and try again.";
const NOT_FOUND = "Application information not found";
// The same template the web student page links to — not reproduced or re-hosted here.
const APPROVAL_TEMPLATE_URL =
  "https://drive.google.com/file/d/1ebGILBc8OAAPaTWbpmwLDDqjEm-lnbQ7/view?usp=drivesdk";

type Draft = {
  fatherOfConfessionName: string;
  mentorName: string;
  mentorPhone: string;
  mentorEmail: string;
};

export default function PrepApplication() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = canViewOwnApplication(user?.role);
  const resource = useResource<ApplicationState>(canView ? "/api/registration/application" : null);
  const draftKey = user?.id ? `stmark.application-draft.${user.id}` : null;

  const [fatherOfConfessionName, setFather] = useState("");
  const [mentorName, setMentorName] = useState("");
  const [mentorPhone, setMentorPhone] = useState("");
  const [mentorEmail, setMentorEmail] = useState("");
  const [fieldProblem, setFieldProblem] = useState<{ field: FieldKey; message: string } | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const action = useAction();

  const fatherRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);

  // Restore any unsaved draft before the server's own values arrive, so an
  // interrupted edit — or the app being killed outright — always comes back
  // showing what the student had typed, not a blank form.
  useEffect(() => {
    if (!draftKey) {
      setDraftLoaded(true);
      return;
    }
    let active = true;
    SecureStore.getItemAsync(draftKey)
      .then((raw) => {
        if (!active) return;
        if (raw) {
          try {
            const draft = JSON.parse(raw) as Partial<Draft>;
            if (draft.fatherOfConfessionName) setFather(draft.fatherOfConfessionName);
            if (draft.mentorName) setMentorName(draft.mentorName);
            if (draft.mentorPhone) setMentorPhone(draft.mentorPhone);
            if (draft.mentorEmail) setMentorEmail(draft.mentorEmail);
          } catch {
            /* a corrupt draft is just dropped */
          }
        }
        setDraftLoaded(true);
      })
      .catch(() => active && setDraftLoaded(true));
    return () => {
      active = false;
    };
  }, [draftKey]);

  // Seed from the server once both it and the draft have loaded — only for
  // whichever fields the draft didn't already cover, so a restored draft is
  // never silently overwritten by an older saved value.
  useEffect(() => {
    if (!resource.data || !draftLoaded) return;
    const application = resource.data.application;
    setFather((current) => current || application.fatherOfConfessionName || "");
    setMentorName((current) => current || application.mentorName || "");
    setMentorPhone((current) => current || application.mentorPhone || "");
    setMentorEmail((current) => current || application.mentorEmail || "");
    // Only runs again if the resource identity changes (a fresh load), not on every keystroke.
  }, [resource.data, draftLoaded]);

  // Autosaved on every change, debounced, so a relaunch mid-edit doesn't lose it.
  useEffect(() => {
    if (!draftKey || !draftLoaded) return;
    const timeout = setTimeout(() => {
      const draft: Draft = { fatherOfConfessionName, mentorName, mentorPhone, mentorEmail };
      void SecureStore.setItemAsync(draftKey, JSON.stringify(draft));
    }, 500);
    return () => clearTimeout(timeout);
  }, [draftKey, draftLoaded, fatherOfConfessionName, mentorName, mentorPhone, mentorEmail]);

  const data = resource.data;
  const offline = resource.error === OFFLINE;
  const notFound = resource.error === NOT_FOUND;
  const progress = data ? applicationProgress(data) : null;

  async function save() {
    if (!data) return;
    const problem = firstFieldProblem(data, fatherOfConfessionName, {
      mentorName,
      mentorPhone,
      mentorEmail,
    });
    setFieldProblem(problem);
    if (problem) {
      const ref =
        problem.field === "fatherOfConfessionName"
          ? fatherRef
          : problem.field === "mentorName"
            ? nameRef
            : problem.field === "mentorPhone"
              ? phoneRef
              : emailRef;
      ref.current?.focus();
      return;
    }
    await action.run(async () => {
      await request("/api/registration/application", "PATCH", {
        fatherOfConfessionName,
        mentorName,
        mentorPhone,
        mentorEmail,
      });
      if (draftKey) await SecureStore.deleteItemAsync(draftKey);
      await resource.refresh();
    });
  }

  async function uploadApprovalForm() {
    if (uploadBusy) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/png", "image/jpeg", "image/gif", "application/pdf"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0] || !api) return;
    const picked = result.assets[0];
    const problem = validateApprovalFile({ mimeType: picked.mimeType ?? null, size: picked.size ?? null });
    if (problem) {
      setUploadError(problem);
      return;
    }
    setUploadError(null);
    setUploadBusy(true);
    try {
      const response = await fetch(picked.uri);
      const blob = await response.blob();
      const form = new FormData();
      form.append("file", blob, picked.name);
      await api.request("/api/registration/application/upload", { method: "POST", body: form });
      invalidateResourceCache();
      await resource.refresh();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Unable to upload. Please try again.");
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <>
      {/* The large heading below carries the title; an empty bar title avoids repeating it. */}
      <Stack.Screen options={{ title: "" }} />
      <Screen refreshing={resource.loading || resource.refreshing} onRefresh={() => void resource.refresh()}>
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>This page is for students.</Copy>
          </View>
        )}

        {canView && (
          <>
            <View style={{ paddingHorizontal: 4, gap: 2 }}>
              <Copy style={{ fontFamily: serifDisplay, fontSize: 34, lineHeight: 36, fontWeight: "500" }}>
                Application
              </Copy>
              <Copy kind="caption">
                {data?.annualMentorRequired
                  ? `Confirm your mentor information for ${data.academicYear?.name ?? "this academic year"}`
                  : "Finish before your first lesson"}
              </Copy>
            </View>

            {resource.stale && (
              <View
                accessibilityLiveRegion="polite"
                style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}
              >
                <Copy style={{ fontWeight: "600" }} color={colors.warning}>
                  {offline ? "You're offline" : "Couldn't refresh"} · showing saved details
                </Copy>
              </View>
            )}

            {!resource.stale && notFound && (
              <Card>
                <Copy kind="heading">Application unavailable</Copy>
                <Copy kind="caption">We could not find an approved registration for this account.</Copy>
              </Card>
            )}

            {!resource.stale && !notFound && (
              <ResourceState loading={resource.loading} error={offline ? undefined : resource.error} retry={() => void resource.refresh()} />
            )}

            {data && (
              <>
                {data.complete ? (
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 10,
                      padding: 16,
                      borderRadius: 18,
                      backgroundColor: colors.successSoft,
                    }}
                  >
                    <Icon ios="checkmark.circle.fill" android="check_circle" size={20} color={colors.success} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Copy style={{ fontWeight: "600" }} color={colors.success}>
                        {data.annualMentorRequired ? "Your mentor information is confirmed." : "Your application is complete."}
                      </Copy>
                      <Copy kind="caption">
                        {data.annualMentorRequired
                          ? `You are up to date for ${data.academicYear?.name ?? "this academic year"}.`
                          : "The application reminder has been cleared."}
                      </Copy>
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", gap: 10, padding: 16, borderRadius: 18, backgroundColor: colors.surface }}>
                    <Icon ios="exclamationmark.triangle.fill" android="warning" size={20} color={colors.warning} />
                    <Copy kind="caption" style={{ flex: 1 }}>
                      This reminder stays until every section below is complete.
                    </Copy>
                  </View>
                )}

                <View style={{ gap: 10 }}>
                  <SectionTitle title="Mentor servant" />
                  <Card style={{ gap: 14 }}>
                    <Field
                      ref={nameRef}
                      label="Mentor servant's name"
                      value={mentorName}
                      onChange={setMentorName}
                      disabled={action.busy}
                      error={fieldProblem?.field === "mentorName" ? fieldProblem.message : undefined}
                    />
                    <Field
                      ref={phoneRef}
                      label="Phone number"
                      value={mentorPhone}
                      onChange={setMentorPhone}
                      keyboardType="phone-pad"
                      disabled={action.busy}
                      error={fieldProblem?.field === "mentorPhone" ? fieldProblem.message : undefined}
                    />
                    <Field
                      ref={emailRef}
                      label="Email address"
                      value={mentorEmail}
                      onChange={setMentorEmail}
                      keyboardType="email-address"
                      disabled={action.busy}
                      error={fieldProblem?.field === "mentorEmail" ? fieldProblem.message : undefined}
                    />
                  </Card>
                </View>

                {data.showChurchInformation && (
                  <View style={{ gap: 10 }}>
                    <SectionTitle title="Church" />
                    <Card>
                      <Field
                        ref={fatherRef}
                        label="Father of confession"
                        value={fatherOfConfessionName}
                        onChange={setFather}
                        disabled={action.busy}
                        error={fieldProblem?.field === "fatherOfConfessionName" ? fieldProblem.message : undefined}
                      />
                    </Card>
                  </View>
                )}

                {data.showApprovalForm && (
                  <View style={{ gap: 10 }}>
                    <SectionTitle title="Approval form" />
                    <ListSurface>
                      <CompactRow
                        divider
                        title="Download template"
                        subtitle="Approval form · PDF"
                        icon={<SectionIcon ios="doc.fill" android="description" />}
                        onPress={() => void Linking.openURL(APPROVAL_TEMPLATE_URL)}
                      />
                      <CompactRow
                        title={data.application.approvalFormUrl ? "Replace form" : "Upload signed form"}
                        subtitle={
                          uploadBusy
                            ? "Uploading…"
                            : (data.application.approvalFormFilename ?? "PNG, JPG, GIF or PDF · 4.5 MB max")
                        }
                        icon={<SectionIcon ios="square.and.arrow.up" android="upload" />}
                        onPress={() => void uploadApprovalForm()}
                      />
                    </ListSurface>
                    {data.application.approvalFormUrl && (
                      <Pressable onPress={() => void Linking.openURL(data.application.approvalFormUrl!)} hitSlop={8}>
                        <Copy kind="caption" color={colors.primary}>View uploaded form</Copy>
                      </Pressable>
                    )}
                    {uploadError && (
                      <View accessibilityLiveRegion="polite">
                        <Copy kind="caption" color={colors.danger}>{uploadError}</Copy>
                      </View>
                    )}
                  </View>
                )}

                <View style={{ gap: 10, paddingBottom: 8 }}>
                  {!!progress && (
                    <Copy kind="caption" style={{ paddingHorizontal: 6 }}>
                      {progress.done} of {progress.total} done
                    </Copy>
                  )}
                  <Button
                    label={
                      action.busy
                        ? "Saving…"
                        : data.annualMentorRequired
                          ? "Confirm mentor information"
                          : "Save application details"
                    }
                    disabled={action.busy}
                    onPress={() => void save()}
                  />
                </View>
              </>
            )}
          </>
        )}
      </Screen>
    </>
  );
}

function SectionIcon({ ios, android }: { ios: SFSymbol; android: AndroidSymbol }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.primarySoft,
      }}
    >
      <Icon ios={ios} android={android} size={16} />
    </View>
  );
}
