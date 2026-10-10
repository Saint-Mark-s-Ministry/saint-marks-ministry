import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import { Copy, Icon, ListSurface, Screen, StatusPill } from "@/components/ui";
import { Field, ResourceState, Toggle, confirmAction, useAction } from "@/components/forms";
import { request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import {
  academicYearRangeLabel,
  academicYearStanding,
  sortAcademicYears,
  validAcademicYearDraft,
  type AcademicYearLike,
} from "@/data/account";
import { useAppTheme } from "@/theme";

const ACADEMIC_YEARS_PATH = "/api/academic-years";
const ADMIN_LIKE_ROLES = ["SUPER_ADMIN", "PRIEST", "SERVANT_PREP"];

export default function AcademicYears() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const resource = useResource<AcademicYearLike[]>(ACADEMIC_YEARS_PATH);
  const [editor, setEditor] = useState<AcademicYearLike | "new" | null>(null);
  const canManage = !!user && ADMIN_LIKE_ROLES.includes(user.role);
  const years = sortAcademicYears(resource.data ?? []);

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerRight: canManage
            ? () => (
                <Pressable accessibilityRole="button" accessibilityLabel="Add academic year" onPress={() => setEditor("new")} hitSlop={10}>
                  <Icon ios="plus" android="add" size={22} color={colors.primary} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <Screen refreshing={resource.loading || resource.refreshing} onRefresh={() => void resource.refresh()}>
        <View style={{ paddingHorizontal: 4, gap: 4 }}>
          <Copy kind="title">Academic years</Copy>
          <Copy kind="caption">Dashboards show the active year by default</Copy>
        </View>

        <ResourceState loading={resource.loading} error={resource.error} retry={() => void resource.refresh()} />

        {resource.data && !years.length && (
          <ListSurface style={{ padding: 16 }}>
            <Copy>No academic years configured.</Copy>
          </ListSurface>
        )}

        {!!years.length && (
          <ListSurface>
            {years.map((year, index) => {
              const standing = academicYearStanding(year);
              return (
                <View key={year.id}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${year.name}${standing === "active" ? ", active year" : ""}`}
                    onPress={() => canManage && setEditor(year)}
                    style={({ pressed }) => [
                      { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, minHeight: 60 },
                      { backgroundColor: pressed && canManage ? colors.hover : "transparent" },
                    ]}
                  >
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: standing === "active" ? colors.primarySoft : colors.hover,
                      }}
                    >
                      <Icon ios="calendar" android="calendar_month" size={16} color={standing === "active" ? colors.primary : colors.text2} />
                    </View>
                    <View style={{ flex: 1, gap: 1 }}>
                      <Copy style={{ fontWeight: "500" }}>{year.name}</Copy>
                      <Copy kind="caption">{academicYearRangeLabel(year)}</Copy>
                    </View>
                    {standing === "active" && <StatusPill label="Active" color={colors.primary} soft={colors.primarySoft} />}
                    {standing === "upcoming" && <StatusPill label="Upcoming" color={colors.info} soft={colors.infoSoft} />}
                    {standing === "archived" && <StatusPill label="Archived" color={colors.text2} soft={colors.hover} />}
                    {canManage && <Icon ios="chevron.right" android="chevron_right" size={14} color={colors.muted} />}
                  </Pressable>
                  {index < years.length - 1 && <View style={{ height: 0.5, marginLeft: 58, backgroundColor: colors.border }} />}
                </View>
              );
            })}
          </ListSurface>
        )}

        {canManage && (
          <Copy kind="caption">Tap a year to edit its dates, set it active, or delete it.</Copy>
        )}
      </Screen>

      {editor && canManage && (
        <YearEditorSheet
          year={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            await resource.refresh();
          }}
        />
      )}
    </>
  );
}

function YearEditorSheet({
  year,
  onClose,
  onSaved,
}: {
  year?: AcademicYearLike;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { colors } = useAppTheme();
  const isEdit = !!year;
  const [name, setName] = useState(year?.name ?? "");
  const [startDate, setStartDate] = useState(year?.startDate.slice(0, 10) ?? "");
  const [endDate, setEndDate] = useState(year?.endDate.slice(0, 10) ?? "");
  const [active, setActive] = useState(year?.isActive ?? false);
  const action = useAction();
  const valid = validAcademicYearDraft(name, startDate, endDate);

  function submit() {
    void action.run(async () => {
      await request(
        year ? `${ACADEMIC_YEARS_PATH}/${year.id}` : ACADEMIC_YEARS_PATH,
        year ? "PATCH" : "POST",
        { name, startDate, endDate, isActive: active },
      );
      await onSaved();
    });
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
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>{isEdit ? "Edit academic year" : "New academic year"}</Copy>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isEdit ? "Save academic year" : "Create academic year"}
            disabled={action.busy || !valid}
            onPress={submit}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, opacity: valid ? 1 : 0.4 }}
          >
            <Icon ios="checkmark" android="check" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 14 }}>
          <Field label="Name" value={name} onChange={setName} disabled={action.busy} placeholder="2026–2027" />
          <Field label="Start date (YYYY-MM-DD)" value={startDate} onChange={setStartDate} disabled={action.busy} />
          <Field label="End date (YYYY-MM-DD)" value={endDate} onChange={setEndDate} disabled={action.busy} />
          <Toggle label="Active year" value={active} onChange={setActive} disabled={action.busy} />
          {active && (
            <Copy kind="caption">
              Setting this year active changes the default year shown across every dashboard — including for other signed-in users.
            </Copy>
          )}

          {isEdit && year && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete academic year"
              disabled={action.busy}
              onPress={() =>
                confirmAction(
                  "Delete academic year permanently?",
                  "Lessons and exams recorded under this year are not removed, but this cannot be undone.",
                  () =>
                    void action.run(async () => {
                      await request(`${ACADEMIC_YEARS_PATH}/${year.id}`, "DELETE");
                      await onSaved();
                    }),
                  true,
                )
              }
              style={{ alignItems: "center", paddingVertical: 14, marginTop: 10 }}
            >
              <Copy style={{ color: colors.danger, fontWeight: "600" }}>Delete academic year</Copy>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
