import { Alert, Linking, TextInput, View } from "react-native";
import { Stack } from "expo-router";
import { Button, CircleIconButton, Copy, CopyableValue, ListSurface, Screen } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { useAuth } from "@/data/auth-provider";
import {
  isContactBookDeniedLocally,
  mailUrl,
  pageCount,
  pageSummary,
  smsUrl,
  telUrl,
  type ContactBookEntry,
} from "@/data/contact-book";
import { useContactBook } from "@/data/use-contact-book";
import { serifDisplay, useAppTheme } from "@/theme";

const OFFLINE = "Could not reach the server. Check your connection and try again.";

function open(url: string | null, what: string) {
  if (!url) return;
  Linking.openURL(url).catch(() => Alert.alert(`Couldn't ${what}`, "This device can't open that action."));
}

/**
 * A read-only, server-authorized directory of app users. The menu entry is
 * shown from session metadata, but this screen always asks the API and renders
 * its answer, so direct navigation without access shows the denied state and
 * never contacts.
 */
export default function ContactBook() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const identity = user?.id ?? "";
  const locallyDenied = isContactBookDeniedLocally(user?.role);
  const book = useContactBook(identity, !!user && !locallyDenied);
  const { state } = book;
  const pages = pageCount(state.total, state.pageSize);
  const denied = locallyDenied || state.status === "denied";
  const offline = state.message === OFFLINE;

  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <Screen
        refreshing={!denied && state.status === "loading"}
        onRefresh={denied ? undefined : book.retry}
      >
        <View style={{ paddingHorizontal: 4, gap: 4 }}>
          <Copy style={{ fontFamily: serifDisplay, fontSize: 34, lineHeight: 36, fontWeight: "500" }}>
            Contact Book
          </Copy>
          <Copy kind="caption">Find app users and contact them</Copy>
        </View>

        {denied && (
          <ListSurface style={{ padding: 16, gap: 6 }}>
            <Copy style={{ fontWeight: "600" }}>
              {locallyDenied ? "Not available for administrators" : "Contact Book access isn't enabled"}
            </Copy>
            <Copy kind="caption">
              {locallyDenied
                ? "Super administrators find and manage people from the Users page."
                : "Ask a super administrator to allow contact book access for your account."}
            </Copy>
          </ListSurface>
        )}

        {state.status === "expired" && (
          <ListSurface style={{ padding: 16, gap: 6 }}>
            <Copy style={{ fontWeight: "600" }}>Session expired</Copy>
            <Copy kind="caption">Your session expired. Sign in again to continue.</Copy>
          </ListSurface>
        )}

        {!denied && state.status !== "expired" && (
          <View style={{ gap: 7 }}>
            <Copy kind="caption">Search</Copy>
            <TextInput
              accessibilityLabel="Search contacts"
              accessibilityHint="Searches names, emails, and phone numbers"
              value={book.search}
              onChangeText={book.setSearch}
              placeholder="Name, email, or phone"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
              style={{
                backgroundColor: colors.surface,
                color: colors.text,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                minHeight: 50,
                fontSize: 17,
              }}
            />
          </View>
        )}

        {state.stale && (
          <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.warning}>
              {offline ? "You're offline" : "Couldn't refresh"} · showing the last contacts
            </Copy>
            <Copy kind="caption">Pull down to try again.</Copy>
          </View>
        )}

        {!denied && (
          <ResourceState
            loading={state.status === "loading" && !state.contacts.length}
            error={state.status === "error" ? (state.message ?? undefined) : undefined}
            retry={book.retry}
          />
        )}

        {!denied && state.status === "ready" && !state.contacts.length && (
          <ListSurface style={{ padding: 16 }}>
            <Copy>
              {book.term ? `No contacts match “${book.term}”.` : "No contacts yet."}
            </Copy>
          </ListSurface>
        )}

        {!denied && state.status === "ready" && state.contacts.length > 0 && (
          <>
            <Copy kind="caption" accessibilityLabel={`Showing ${pageSummary(state.total, state.page, state.pageSize)}`}>
              {pageSummary(state.total, state.page, state.pageSize)}
            </Copy>
            <ListSurface>
              {state.contacts.map((contact, index) => (
                <View key={contact.id}>
                  <ContactRow contact={contact} />
                  {index < state.contacts.length - 1 && (
                    <View style={{ height: 0.5, backgroundColor: colors.border }} />
                  )}
                </View>
              ))}
            </ListSurface>
            {pages > 1 && (
              <View style={{ gap: 10 }}>
                <Copy kind="caption" style={{ textAlign: "center" }}>
                  Page {state.page} of {pages}
                </Copy>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      secondary
                      label="Previous"
                      disabled={state.page <= 1}
                      onPress={() => book.goToPage(state.page - 1)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      secondary
                      label="Next"
                      disabled={state.page >= pages}
                      onPress={() => book.goToPage(state.page + 1)}
                    />
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

function ContactRow({ contact }: { contact: ContactBookEntry }) {
  const tel = telUrl(contact.phone);
  const sms = smsUrl(contact.phone);
  const mail = mailUrl(contact.email);
  return (
    <View style={{ padding: 16, gap: 8 }}>
      <Copy style={{ fontWeight: "600", fontSize: 17 }}>{contact.name}</Copy>
      <CopyableValue label="Email" value={contact.email} kind="caption" />
      {contact.phone ? (
        <CopyableValue label="Phone" value={contact.phone} kind="caption" />
      ) : (
        <Copy kind="caption">No phone number</Copy>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, paddingTop: 2 }}>
        <CircleIconButton
          ios="phone.fill"
          android="call"
          label={tel ? `Call ${contact.name}` : `Call ${contact.name}, no phone number`}
          disabled={!tel}
          onPress={() => open(tel, "start the call")}
        />
        <CircleIconButton
          ios="message.fill"
          android="sms"
          label={sms ? `Text ${contact.name}` : `Text ${contact.name}, no phone number`}
          disabled={!sms}
          onPress={() => open(sms, "open Messages")}
        />
        <CircleIconButton
          ios="envelope.fill"
          android="mail"
          label={`Email ${contact.name}`}
          disabled={!mail}
          onPress={() => open(mail, "open Mail")}
        />
      </View>
    </View>
  );
}
