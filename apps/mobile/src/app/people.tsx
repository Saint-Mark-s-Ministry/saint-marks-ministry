import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import { Button, CompactRow, Copy, Icon, InitialsAvatar, ListSurface, Screen, StatusPill } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { query, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import type { Person } from "@/data/people";
import { useAppTheme } from "@/theme";

const PAGE_SIZE = 30;

/** "SERVANT_PREP" -> "Servant prep" */
function roleLabel(role: string) {
  const words = role.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export default function People() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const isAdmin = user?.role === "SUPER_ADMIN";
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = typed.trim();
      setSearch((previous) => {
        if (next !== previous) setPage(1);
        return next;
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [typed]);

  const resource = useResource<{ data: Person[]; pagination: { total: number; totalPages: number } }>(
    isAdmin ? `/api/users?${query({ page: String(page), limit: String(PAGE_SIZE), search })}` : null,
  );
  const people = resource.data?.data ?? [];
  const total = resource.data?.pagination.total ?? 0;
  const totalPages = resource.data?.pagination.totalPages ?? 1;

  return (
    <>
      <Stack.Screen
        options={{
          title: "People & organization",
          headerRight: isAdmin
            ? () => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add account"
                  hitSlop={10}
                  onPress={() => router.push({ pathname: "/person/[id]", params: { id: "new" } })}
                >
                  <Icon ios="plus" android="add" size={22} color={colors.primary} />
                </Pressable>
              )
            : undefined,
        }}
      />
      {isAdmin && (
        <Stack.SearchBar
          autoCapitalize="none"
          placement="stacked"
          hideWhenScrolling={false}
          placeholder="Search name, email, or phone"
          onChangeText={(event) => setTyped(event.nativeEvent.text)}
          onCancelButtonPress={() => setTyped("")}
        />
      )}
      <Screen refreshing={resource.refreshing} onRefresh={() => void resource.refresh()}>
        {!isAdmin ? (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>Super-admin access is required.</Copy>
          </View>
        ) : (
          <>
            <ListSurface>
              <CompactRow
                title="Ministry organization"
                subtitle="Teams, coordinators and servants"
                icon={
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 13,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.primarySoft,
                    }}
                  >
                    <Icon ios="building.2.fill" android="corporate_fare" size={18} />
                  </View>
                }
                onPress={() => router.push("/organization")}
              />
            </ListSurface>

            <ResourceState loading={resource.loading} error={resource.error} retry={() => void resource.refresh()} />

            {resource.data && (
              <Copy kind="caption" style={{ paddingHorizontal: 4 }}>
                {total === 1 ? "1 account" : `${total} accounts`}
                {search ? ` matching “${search}”` : ""}
              </Copy>
            )}

            {resource.data && !people.length && (
              <ListSurface style={{ padding: 18 }}>
                <Copy kind="caption">{search ? "No accounts match that search." : "No accounts yet."}</Copy>
              </ListSurface>
            )}

            {!!people.length && (
              <ListSurface>
                {people.map((person, index) => (
                  <CompactRow
                    key={person.id}
                    divider={index < people.length - 1}
                    title={person.name}
                    subtitle={`${person.email} · ${roleLabel(person.role)}`}
                    icon={<InitialsAvatar name={person.name} size={38} />}
                    trailing={
                      person.isDisabled ? (
                        <StatusPill label="Disabled" color={colors.danger} soft={colors.dangerSoft} />
                      ) : undefined
                    }
                    onPress={() =>
                      router.push({
                        pathname: "/person/[id]",
                        params: { id: person.id, disabled: String(!!person.isDisabled) },
                      })
                    }
                  />
                ))}
              </ListSurface>
            )}

            {totalPages > 1 && (
              <View style={{ gap: 10 }}>
                <Copy kind="caption" style={{ textAlign: "center" }}>
                  Page {page} of {totalPages}
                </Copy>
                <Button secondary label="Previous page" disabled={page === 1} onPress={() => setPage((p) => p - 1)} />
                <Button secondary label="Next page" disabled={page >= totalPages} onPress={() => setPage((p) => p + 1)} />
              </View>
            )}
          </>
        )}
      </Screen>
    </>
  );
}
