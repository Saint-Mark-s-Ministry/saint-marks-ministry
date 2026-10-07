import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import type { SundaySchoolAgeGroup, SundaySchoolDashboard, SundaySchoolLevel, SundaySchoolServantRef } from "@stmark/contracts";
import { LEVEL_ORDER, getLevelDisplayName } from "@stmark/domain";
import { Copy, Icon, ListSurface, Screen, SectionTitle } from "@/components/ui";
import { Choice, Field, ResourceState, Toggle, confirmAction, useAction } from "@/components/forms";
import { Staffing } from "@/components/staffing";
import { endpoint, request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { usePortal } from "@/data/portal-provider";
import { levelRangeLabel } from "@/data/sunday-school-classes";
import { MinistryTintProvider, serifDisplay, useAppTheme } from "@/theme";

export default function AgeGroups() {
  return (
    <MinistryTintProvider ministry="sundaySchool">
      <AgeGroupsScreen />
    </MinistryTintProvider>
  );
}

// A component that both establishes MinistryTintProvider and calls
// useAppTheme() itself reads the *outer* (un-tinted) context — the provider
// only applies to children below it in the tree. Every other rebuilt screen
// in this app splits into an outer wrapper + inner screen component for
// exactly this reason; this screen is no exception (confirmed live: its icon
// tiles rendered the default maroon tint instead of Sunday School gold until
// this split was added).
function AgeGroupsScreen() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const isAdmin = user?.role === "SUPER_ADMIN";
  const resource = useResource<SundaySchoolAgeGroup[]>(isAdmin ? endpoint("age-groups") : null);
  const dashboard = useResource<SundaySchoolDashboard>(isAdmin ? endpoint("dashboard") : null);
  const priests = useResource<(SundaySchoolServantRef & { isDisabled: boolean })[]>(isAdmin ? "/api/users?role=PRIEST" : null);
  const [editor, setEditor] = useState<SundaySchoolAgeGroup | "new" | null>(null);
  const portal = usePortal();
  const refresh = async () => {
    await Promise.all([resource.refresh(), dashboard.refresh(), portal.refresh()]);
  };
  const groups = resource.data ?? [];
  const classCount = (groupId: string) => (dashboard.data?.classes ?? []).filter((c) => c.ageGroup?.id === groupId).length;

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerLargeTitle: false,
          headerRight: () =>
            isAdmin ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="New age group"
                hitSlop={6}
                onPress={() => setEditor("new")}
                style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? colors.primarySoft : colors.hover })}
              >
                <Icon ios="plus" android="add" size={18} />
              </Pressable>
            ) : undefined,
        }}
      />
      <Screen refreshing={resource.loading || resource.refreshing} onRefresh={() => void refresh()}>
        {!isAdmin ? (
          <View style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}>
            <Copy kind="heading">Super-admin access required</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>
              Age group administration is limited to super admins.
            </Copy>
          </View>
        ) : (
          <>
            <View style={{ paddingHorizontal: 4, gap: 2 }}>
              <Copy style={{ fontFamily: serifDisplay, fontSize: 34, lineHeight: 36, fontWeight: "500" }}>Age groups</Copy>
              <Copy kind="caption">A coordinator of a band runs every class in it</Copy>
            </View>

            <ResourceState loading={resource.loading} error={resource.error} retry={() => void resource.refresh()} />

            {resource.data && !groups.length && (
              <View style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}>
                <Copy kind="heading">No age groups yet</Copy>
                <Copy kind="caption" style={{ textAlign: "center" }}>Create one to start grouping classes.</Copy>
              </View>
            )}

            {!!groups.length && (
              <ListSurface>
                {groups.map((g, index, arr) => (
                  <View key={g.id}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${g.name}, ${levelRangeLabel(g.levels)}, ${classCount(g.id)} classes`}
                      onPress={() => setEditor(g)}
                      style={({ pressed }) => [
                        { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 64 },
                        { backgroundColor: pressed ? colors.primarySoft : "transparent" },
                      ]}
                    >
                      <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
                        <Icon ios="square.grid.2x2" android="grid_view" size={17} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
                        <Copy numberOfLines={1} style={{ fontWeight: "500" }}>{g.name}</Copy>
                        <Copy kind="caption" numberOfLines={1}>
                          {levelRangeLabel(g.levels)} · {classCount(g.id)} {classCount(g.id) === 1 ? "class" : "classes"}
                        </Copy>
                      </View>
                      <Icon ios="chevron.right" android="chevron_right" size={14} color={colors.muted} />
                    </Pressable>
                    {index < arr.length - 1 && <View style={{ height: 0.5, marginLeft: 58, backgroundColor: colors.border }} />}
                  </View>
                ))}
              </ListSurface>
            )}
          </>
        )}
      </Screen>

      {editor && (
        <GroupEditorSheet
          key={editor === "new" ? "new" : editor.id}
          group={editor === "new" ? undefined : editor}
          groups={groups}
          priests={(priests.data ?? []).filter((p) => !p.isDisabled)}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            await refresh();
          }}
        />
      )}
    </>
  );
}

function GroupEditorSheet({
  group,
  groups,
  priests,
  onClose,
  onSaved,
}: {
  group?: SundaySchoolAgeGroup;
  groups: SundaySchoolAgeGroup[];
  priests: SundaySchoolServantRef[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { colors } = useAppTheme();
  const isEdit = !!group;
  const [name, setName] = useState(group?.name ?? "");
  const [levels, setLevels] = useState<SundaySchoolLevel[]>(group?.levels ?? []);
  const [overseerId, setOverseer] = useState(group?.overseerId ?? "");
  const [order, setOrder] = useState(String(group?.sortOrder ?? 0));
  const [active, setActive] = useState(group?.isActive ?? true);
  const action = useAction();

  function submit() {
    confirmAction(
      "Save age group?",
      "Changing grades can change which classes the group's coordinators may manage.",
      () =>
        void action.run(async () => {
          await request(endpoint("age-groups", group?.id), isEdit ? "PATCH" : "POST", {
            name,
            levels,
            overseerId: overseerId || null,
            sortOrder: Number(order) || 0,
            ...(isEdit ? { isActive: active } : {}),
          });
          await onSaved();
        }),
    );
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, paddingTop: 24 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            disabled={action.busy}
            onPress={onClose}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}
          >
            <Icon ios="xmark" android="close" size={18} />
          </Pressable>
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>{isEdit ? "Edit age group" : "New age group"}</Copy>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isEdit ? "Save age group" : "Create age group"}
            disabled={action.busy || !name.trim() || !levels.length}
            onPress={submit}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, opacity: !name.trim() || !levels.length ? 0.4 : 1 }}
          >
            <Icon ios="checkmark" android="check" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 14 }}>
          <Field label="Age group name" value={name} onChange={setName} disabled={action.busy} />
          <View style={{ gap: 8 }}>
            <Copy kind="caption">Grade ownership determines which classes coordinators can access.</Copy>
            {LEVEL_ORDER.map((level) => {
              const owner = groups.find((g) => g.id !== group?.id && g.levels.includes(level));
              return (
                <Toggle
                  key={level}
                  label={`${getLevelDisplayName(level)}${owner ? ` — ${owner.name}` : ""}`}
                  value={levels.includes(level)}
                  disabled={action.busy || !!owner}
                  onChange={(selected) => setLevels((ls) => (selected ? [...ls, level] : ls.filter((l) => l !== level)))}
                />
              );
            })}
          </View>
          <Choice
            label="Priest overseer"
            value={overseerId}
            onChange={setOverseer}
            disabled={action.busy}
            options={[{ value: "", label: "No overseer" }, ...priests.map((p) => ({ value: p.id, label: p.name }))]}
          />
          <Field label="Display order" value={order} onChange={setOrder} keyboardType="numeric" disabled={action.busy} />
          {isEdit && <Toggle label="Active" value={active} onChange={setActive} disabled={action.busy} />}

          {isEdit && group && (
            <View style={{ gap: 10, marginTop: 10 }}>
              <SectionTitle title="Coordinators" />
              <Staffing ageGroupId={group.id} assignments={group.assignments ?? []} refresh={onSaved} />
            </View>
          )}

          {isEdit && group && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete age group"
              disabled={action.busy}
              onPress={() =>
                confirmAction(
                  "Delete age group permanently?",
                  "Its coordinator assignments will be removed. Classes stay, but become ungrouped. This cannot be undone.",
                  () =>
                    void action.run(async () => {
                      await request(endpoint("age-groups", group.id), "DELETE");
                      await onSaved();
                    }),
                  true,
                )
              }
              style={{ alignItems: "center", paddingVertical: 14, marginTop: 10 }}
            >
              <Copy style={{ color: colors.danger, fontWeight: "600" }}>Delete age group</Copy>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
