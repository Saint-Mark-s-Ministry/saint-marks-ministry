import { View } from "react-native";
import { Copy, styles } from "@/components/ui";
import { PREP_STUDENT_LABEL } from "@/data/prep-student";
import { useAppTheme } from "@/theme";

/** The SP Student pill: text, not only colour, and display only. */
export function PrepStudentBadge() {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.pill, { backgroundColor: colors.primarySoft, alignSelf: "flex-start" }]}>
      <Copy kind="caption" color={colors.primary} style={{ fontWeight: "600" }}>
        {PREP_STUDENT_LABEL}
      </Copy>
    </View>
  );
}
