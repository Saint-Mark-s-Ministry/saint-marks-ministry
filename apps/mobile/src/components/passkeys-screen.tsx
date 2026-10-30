import { useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { Stack } from "expo-router";
import type { PasskeyListResponse, PasskeyRecord } from "@stmark/contracts";
import { Button, Card, Copy, ListSurface, Screen, SectionTitle } from "@/components/ui";
import { Field, ResourceState, useAction } from "@/components/forms";
import { InlineAction } from "@/components/inline-action";
import { useLargeType } from "@/components/attendance-history-parts";
import { useAuth } from "@/data/auth-provider";
import { feedback } from "@/data/haptics";
import { enrollPasskey, removePasskey, usePasskeyCapability } from "@/data/passkey-flow";
import {
  PASSKEY_LIMIT_MESSAGE,
  PASSKEY_NAME_MAX_LENGTH,
  RECENT_SIGN_IN_MESSAGE,
  REMOVE_PASSKEY_MESSAGE,
  VIEW_AS_MESSAGE,
  classifyPasskeyError,
  passkeyFootnote,
  passkeyLimitReached,
  removePasskeyTitle,
  signInFreshness,
  validatePasskeyName,
} from "@/data/passkeys";
import { useResource } from "@/data/resources";
import { useAppTheme } from "@/theme";

type Notice = { tone: "success" | "info" | "error"; text: string };

/** Account → Passkeys: the signed-in person's own passkeys, to add and to remove. Nothing here reads anyone else's. */
export function PasskeysScreen() {
  const { colors } = useAppTheme();
  const { user, viewingAs, authenticatedAt, signOut } = useAuth();
  const capability = usePasskeyCapability();
  const stacked = useLargeType();
  const action = useAction();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [notice, setNotice] = useState<Notice | null>(null);
  // Set when the server itself says the sign-in is too old; the local clock only suggests it.
  const [serverSaysStale, setServerSaysStale] = useState(false);
  const [adding, setAdding] = useState(false);

  const readOnly = !!viewingAs;
  // Never ask for the list while viewing as someone: the server refuses it, and this client would read that as an expired session.
  const list = useResource<PasskeyListResponse>(
    capability.offered && !readOnly && user ? "/api/passkeys" : null,
    user ? `passkeys:${user.id}` : undefined,
  );
  const passkeys = list.data?.passkeys ?? [];
  const atLimit = passkeyLimitReached(passkeys.length);
  const stale = serverSaysStale || signInFreshness(authenticatedAt ?? undefined) === "stale";

  const show = (next: Notice | null) => setNotice(next);

  function fail(error: unknown) {
    const { kind, message } = classifyPasskeyError(error);
    if (kind === "recent-sign-in") setServerSaysStale(true);
    // Cancelling is the person's choice, not a problem. The sign-in-again card already says what a refused window
    // needs, so it is not repeated as an error.
    show(
      kind === "recent-sign-in"
        ? null
        : kind === "cancelled"
          ? { tone: "info", text: "Passkey setup was cancelled. Nothing was added." }
          : { tone: "error", text: message },
    );
    feedback(kind === "cancelled" ? "selection" : "error");
  }

  function add() {
    const check = validatePasskeyName(name);
    setNameError(check.error);
    if (check.error || !capability.rpId) return;
    show(null);
    void action.run(async () => {
      setAdding(true);
      try {
        await enrollPasskey(check.name, capability.rpId!);
        setName("");
        feedback("success");
        show({ tone: "success", text: "Passkey added. You can now use it to sign in." });
        await list.refresh();
      } catch (error) {
        // The name stays, so a cancelled or failed attempt can simply be tried again.
        fail(error);
      } finally {
        setAdding(false);
      }
    });
  }

  function confirmRemove(key: PasskeyRecord) {
    Alert.alert(removePasskeyTitle(key.name), REMOVE_PASSKEY_MESSAGE, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          show(null);
          void action.run(async () => {
            try {
              await removePasskey(key.id);
              feedback("success");
              show({ tone: "success", text: "Passkey removed." });
              await list.refresh();
            } catch (error) {
              fail(error);
              // It may already be gone (removed on another device): show the list as it is now.
              await list.refresh();
            }
          });
        },
      },
    ]);
  }

  const noticeColor = (tone: Notice["tone"]) => (tone === "error" ? colors.danger : tone === "success" ? colors.success : colors.text2);

  return (
    <>
      <Stack.Screen options={{ title: "Passkeys" }} />
      <Screen refreshing={list.refreshing} onRefresh={capability.offered && !readOnly ? () => void list.refresh() : undefined}>
        <Copy kind="caption">
          Sign in with Face ID, Touch ID or your device passcode, with no email or password to type. Your password and other ways of signing in keep working.
        </Copy>

        {capability.loading ? (
          <ActivityIndicator accessibilityLabel="Checking passkeys" color={colors.primary} />
        ) : readOnly ? (
          <Card>
            <Copy kind="heading">View as is read-only</Copy>
            <Copy>{VIEW_AS_MESSAGE}</Copy>
          </Card>
        ) : !capability.offered ? (
          <Card>
            <Copy kind="heading">Passkeys aren't available</Copy>
            <Copy>Passkeys aren't turned on for this app right now. Your password still works.</Copy>
          </Card>
        ) : (
          <>
            {stale && (
              <Card>
                <Copy kind="heading">Sign in again first</Copy>
                <Copy>{RECENT_SIGN_IN_MESSAGE}</Copy>
                <Button label="Sign out" secondary onPress={() => void signOut()} />
              </Card>
            )}

            {notice && (
              <View accessibilityLiveRegion="polite" accessibilityRole={notice.tone === "error" ? "alert" : undefined}>
                <Copy color={noticeColor(notice.tone)}>{notice.text}</Copy>
              </View>
            )}

            <SectionTitle title="Your passkeys" />
            {list.loading || list.error ? (
              <ResourceState loading={list.loading} error={list.error} retry={() => void list.refresh()} />
            ) : passkeys.length === 0 ? (
              <ListSurface style={{ padding: 16 }}>
                <Copy>You haven’t added a passkey yet.</Copy>
              </ListSurface>
            ) : (
              <ListSurface>
                {passkeys.map((key, index) => (
                  <View
                    key={key.id}
                    style={[
                      { padding: 16, gap: 10, flexDirection: stacked ? "column" : "row", alignItems: stacked ? "flex-start" : "center" },
                      index > 0 && { borderTopWidth: 0.5, borderTopColor: colors.border },
                    ]}
                  >
                    <View style={{ flex: stacked ? undefined : 1, gap: 2 }} accessible accessibilityLabel={`${key.name}. ${passkeyFootnote(key)}`}>
                      <Copy style={{ fontWeight: "600" }}>{key.name}</Copy>
                      <Copy kind="caption">{passkeyFootnote(key)}</Copy>
                    </View>
                    <InlineAction label="Remove" accessibilityLabel={`Remove ${key.name}`} destructive disabled={action.busy || serverSaysStale} onPress={() => confirmRemove(key)} />
                  </View>
                ))}
              </ListSurface>
            )}

            <SectionTitle title="Add a passkey" />
            <Field
              label="Passkey name"
              value={name}
              onChange={(value) => {
                setName(value);
                if (nameError) setNameError(undefined);
              }}
              placeholder="e.g. My iPhone"
              maxLength={PASSKEY_NAME_MAX_LENGTH}
              disabled={action.busy || atLimit}
              error={nameError}
            />
            {atLimit && <Copy kind="caption">{PASSKEY_LIMIT_MESSAGE}</Copy>}
            <Button
              label={adding ? "Waiting for your passkey…" : "Add a passkey"}
              disabled={action.busy || atLimit || serverSaysStale || !name.trim()}
              onPress={add}
            />
          </>
        )}
      </Screen>
    </>
  );
}
