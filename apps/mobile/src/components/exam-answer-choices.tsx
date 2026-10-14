import { Pressable, View } from "react-native";
import { EXAM_CHOICES } from "@/data/live-exams";
import { useAppTheme } from "@/theme";
import { Copy } from "./ui";

export function ExamAnswerChoices({ question, answer, count, disabled, choose }: {
  question: number; answer: string; count: number; disabled: boolean; choose: (answer: string) => void;
}) {
  const { colors } = useAppTheme();
  const choices = EXAM_CHOICES.slice(0, count).split("");
  const columns = count > 4 ? Math.ceil(count / 2) : count;
  const rows = count > 4 ? [choices.slice(0, columns), choices.slice(columns)] : [choices];
  return <View style={{ gap: 8, width: "100%" }} accessibilityRole="radiogroup">
    {rows.map((row, index) => <View key={index} style={{ flexDirection: "row", gap: 8, width: "100%" }}>
    {row.map(choice => <Pressable key={choice}
      accessibilityRole="radio" accessibilityLabel={`Question ${question + 1}, answer ${choice}`}
      accessibilityHint={answer === choice ? "Tap again to clear this answer" : "Select this answer"}
      accessibilityState={{ selected: answer === choice, checked: answer === choice, disabled }} disabled={disabled}
      onPress={() => choose(answer === choice ? "" : choice)} style={({ pressed }) => ({
        flex: 1, minWidth: 44, minHeight: 52, borderRadius: 14, borderWidth: 1,
        alignItems: "center", justifyContent: "center", opacity: disabled ? 0.55 : pressed ? 0.7 : 1,
        backgroundColor: answer === choice ? colors.primary : colors.surface,
        borderColor: answer === choice ? colors.primary : colors.border,
      })}><Copy color={answer === choice ? "#FFFFFF" : colors.text} style={{ fontWeight: "600" }}>{choice}</Copy></Pressable>)}
    </View>)}
  </View>;
}
