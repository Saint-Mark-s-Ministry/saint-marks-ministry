import { Modal, Pressable, ScrollView, View } from "react-native";
import { Copy, Icon } from "@/components/ui";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { Toggle } from "@/components/forms";
import {
  clearFeedbackFilters,
  hasActiveFilters,
  type BoardMode,
  type FeedbackCategory,
  type FeedbackFilters,
  type FeedbackSort,
  type FeedbackStatusFilter,
} from "@/data/sunday-school-feedback";
import { useAppTheme } from "@/theme";

export const TYPE_OPTIONS: { value: FeedbackCategory; label: string }[] = [
  { value: "ALL", label: "All feedback" },
  { value: "IDEA", label: "Ideas" },
  { value: "PROBLEM", label: "Problems" },
];
export const STATUS_OPTIONS: { value: FeedbackStatusFilter; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "OPEN", label: "Open" },
  { value: "PLANNED", label: "Planned" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "DECLINED", label: "Declined" },
];
export const SORT_OPTIONS: { value: FeedbackSort; label: string }[] = [
  { value: "TOP", label: "Top voted" },
  { value: "NEWEST", label: "Newest" },
];

/** Type, status, sort and "my posts" for the board. Changes apply as they are made; Done just closes. */
export function FeedbackFilterSheet({
  mode,
  filters,
  onChange,
  onClose,
}: {
  mode: BoardMode;
  filters: FeedbackFilters;
  onChange: (next: FeedbackFilters) => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const set = (patch: Partial<FeedbackFilters>) => onChange({ ...filters, ...patch });
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, paddingTop: 24 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close filters"
            onPress={onClose}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}
          >
            <Icon ios="xmark" android="close" size={18} />
          </Pressable>
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>{mode === "roadmap" ? "Roadmap filters" : "Filters"}</Copy>
          <View style={{ width: 44 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 32, gap: 18 }}>
          <Group label="Type">
            <SegmentedControl
              values={TYPE_OPTIONS.map((option) => option.label)}
              selectedIndex={TYPE_OPTIONS.findIndex((option) => option.value === filters.type)}
              onChange={({ nativeEvent }) => set({ type: TYPE_OPTIONS[nativeEvent.selectedSegmentIndex].value })}
              style={{ width: "100%", minHeight: 36 }}
            />
          </Group>
          {mode === "board" && (
            <Group label="Status">
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {STATUS_OPTIONS.map((option) => {
                  const active = filters.status === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityLabel={`Status: ${option.label}`}
                      accessibilityState={{ selected: active }}
                      onPress={() => set({ status: option.value })}
                      style={{
                        minHeight: 44, paddingHorizontal: 14, justifyContent: "center", borderRadius: 10, borderWidth: 1,
                        borderColor: active ? colors.borderStrong : colors.border, backgroundColor: active ? colors.hover : colors.surface,
                      }}
                    >
                      <Copy style={{ fontSize: 13, fontWeight: active ? "600" : "400" }} color={active ? colors.text : colors.muted}>{option.label}</Copy>
                    </Pressable>
                  );
                })}
              </View>
            </Group>
          )}
          <Group label="Sort">
            <SegmentedControl
              values={SORT_OPTIONS.map((option) => option.label)}
              selectedIndex={SORT_OPTIONS.findIndex((option) => option.value === filters.sort)}
              onChange={({ nativeEvent }) => set({ sort: SORT_OPTIONS[nativeEvent.selectedSegmentIndex].value })}
              style={{ width: "100%", minHeight: 36 }}
            />
          </Group>
          <Toggle label="Only my posts" value={filters.mine} onChange={(mine) => set({ mine })} />
          {hasActiveFilters(filters, mode) && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear filters"
              onPress={() => onChange(clearFeedbackFilters(filters))}
              style={{ minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}
            >
              <Copy color={colors.primary} style={{ fontWeight: "600" }}>Clear filters</Copy>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Copy kind="caption">{label}</Copy>
      {children}
    </View>
  );
}
