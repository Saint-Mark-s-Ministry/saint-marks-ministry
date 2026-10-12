import { Pressable } from "react-native";
import { router } from "expo-router";
import type { SundaySchoolDashboard } from "@stmark/contracts";
import { Copy, Icon, styles } from "@/components/ui";
import { useAppTheme } from "@/theme";

/**
 * Academic-year chip (SMM-28 shell, extracted for SMM-48): mirrors the web
 * TopBar's year display, and opens year management. Shared wherever the
 * Sunday School dashboard is already loaded — the Ministry hub, the
 * Birthdays list, and the Sunday School home screen.
 */
export function AcademicYearContext({ dashboard }: { dashboard: SundaySchoolDashboard }) {
  const { colors } = useAppTheme();
  const { attendanceTrend } = dashboard;
  const yearName =
    attendanceTrend.academicYears.find((y) => y.id === attendanceTrend.selectedAcademicYearId)
      ?.name ?? "Current year";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Academic year: ${yearName}. Manage academic years`}
      onPress={() => router.push("/academic-years")}
      style={({ pressed }) => [
        styles.row,
        {
          alignSelf: "flex-start",
          gap: 6,
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: 8,
          backgroundColor: pressed ? colors.primary : colors.primarySoft,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Icon ios="calendar" android="calendar_month" size={14} color={colors.primary} />
      <Copy kind="caption" color={colors.primary}>
        {yearName}
      </Copy>
      <Icon ios="chevron.right" android="chevron_right" size={12} color={colors.primary} />
    </Pressable>
  );
}
