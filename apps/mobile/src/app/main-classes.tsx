import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, Stack } from "expo-router";
import type { SundaySchoolDashboard, SundaySchoolPinnedClassesResponse } from "@stmark/contracts";
import { Button, Copy, ListSurface, Screen, SectionTitle } from "@/components/ui";
import { ResourceState, Toggle, useAction } from "@/components/forms";
import { endpoint, request, useResource } from "@/data/resources";
import { groupClassesByAgeGroup } from "@/data/sunday-school-classes";
import { togglePin } from "@/data/sunday-school-pinned-classes";

// SUPER_ADMIN-only: which classes the Classes screen defaults to showing,
// instead of every class in the ministry. A pure view preference — it never
// changes what this account may see or do, only what it sees by default.
export default function MainClasses() {
  const dashboard = useResource<SundaySchoolDashboard>(endpoint("dashboard"));
  const pinned = useResource<SundaySchoolPinnedClassesResponse>(endpoint("pinned-classes"));
  const [selection, setSelection] = useState<string[] | null>(null);
  const action = useAction();

  // Load the saved selection once, then let local edits take over.
  useEffect(() => {
    if (selection === null && pinned.data) setSelection(pinned.data.classIds);
  }, [pinned.data, selection]);

  const classes = dashboard.data?.classes ?? [];
  const groups = groupClassesByAgeGroup(classes, dashboard.data?.ageGroups ?? []);
  const current = selection ?? [];
  const dirty = pinned.data ? JSON.stringify([...current].sort()) !== JSON.stringify([...pinned.data.classIds].sort()) : false;

  return (
    <>
      <Stack.Screen options={{ title: "My main classes" }} />
      <Screen refreshing={dashboard.loading || pinned.loading} onRefresh={() => { void dashboard.refresh(); void pinned.refresh(); }}>
        <View style={{ paddingHorizontal: 4, gap: 4 }}>
          <Copy kind="caption">
            Pick the classes you want the Classes screen to show by default. You can still reach every
            class — this never changes what you may view or manage.
          </Copy>
        </View>

        <ResourceState loading={dashboard.loading || pinned.loading} error={dashboard.error ?? pinned.error} retry={() => { void dashboard.refresh(); void pinned.refresh(); }} />

        <Button
          label={action.busy ? "Saving…" : "Save"}
          disabled={action.busy || !dirty}
          onPress={() => void action.run(async () => {
            const result = await request<SundaySchoolPinnedClassesResponse>(endpoint("pinned-classes"), "PUT", { classIds: current });
            setSelection(result.classIds);
            router.back();
          })}
        />
        {!!current.length && (
          <Button label="Clear all" secondary disabled={action.busy} onPress={() => setSelection([])} />
        )}

        {dashboard.data && !classes.length && (
          <View style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}>
            <Copy kind="heading">No classes yet</Copy>
          </View>
        )}

        {groups.map((group) => (
          <View key={group.key} style={{ gap: 10 }}>
            <SectionTitle title={group.name} />
            <ListSurface>
              {[...group.classes]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((cls) => (
                  <View key={cls.id} style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
                    <Toggle
                      label={cls.name}
                      value={current.includes(cls.id)}
                      onChange={() => setSelection(togglePin(current, cls.id))}
                    />
                  </View>
                ))}
            </ListSurface>
          </View>
        ))}
      </Screen>
    </>
  );
}
