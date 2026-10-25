import { useCallback, useRef } from "react";
import { Pressable, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { router } from "expo-router";
import { Copy, Icon } from "@/components/ui";
import { feedback } from "@/data/haptics";
import { useAuth } from "@/data/auth-provider";
import { studentHistoryRoute, type StudentHistoryTarget } from "@/data/student-history";
import { useAppTheme } from "@/theme";

/**
 * Whether this person's account may ask for a child's history at all. This only
 * decides whether to offer the control; the server re-checks the viewer's class
 * scope on every request and a refusal is shown in the sheet.
 */
export function useCanOpenStudentHistory(): boolean {
  const { user } = useAuth();
  return !!user?.sundaySchool?.hasAccess;
}

/**
 * Opens the history sheet for a saved Sunday School child. The sheet is a
 * separate screen presented over the current one, so the current screen stays
 * mounted underneath: its filters, scroll position, selected class and date,
 * and any unsaved attendance or grading marks are exactly as they were.
 */
export function useOpenStudentHistory(): (target: StudentHistoryTarget) => void {
  const lastOpened = useRef(0);
  return useCallback((target: StudentHistoryTarget) => {
    // A double tap must not stack two sheets.
    const now = Date.now();
    if (now - lastOpened.current < 800) return;
    lastOpened.current = now;
    feedback("selection");
    router.push(studentHistoryRoute(target));
  }, []);
}

export function historyTarget(id: string, name: string): StudentHistoryTarget {
  return { id, name, program: "sunday-school" };
}

/**
 * A separate control beside a row that already has its own tap (it opens the
 * profile): the clock opens history, the row does what it always did.
 */
export function StudentHistoryButton({ childId, name }: { childId: string; name: string }) {
  const { colors } = useAppTheme();
  const canOpen = useCanOpenStudentHistory();
  const open = useOpenStudentHistory();
  if (!canOpen) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Attendance, notes and visitations for ${name}`}
      onPress={() => open(historyTarget(childId, name))}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? colors.primarySoft : colors.hover,
      })}
    >
      <Icon ios="clock.arrow.circlepath" android="history" size={18} color={colors.text2} />
    </Pressable>
  );
}

/**
 * A saved child's name that opens their history. Where the account can't open
 * history it is plain text, so nobody is offered a control that always refuses.
 */
export function StudentNameButton({
  childId,
  name,
  label,
  style,
  containerStyle,
  numberOfLines,
}: {
  childId: string;
  /** The text shown. The record opened is always `childId`, never this text. */
  name: string;
  /** Spoken label; defaults to the name with its action. */
  label?: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  numberOfLines?: number;
}) {
  const canOpen = useCanOpenStudentHistory();
  const open = useOpenStudentHistory();
  const { colors } = useAppTheme();
  if (!canOpen) {
    return (
      <Copy numberOfLines={numberOfLines} style={style}>
        {name}
      </Copy>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? `${name}, view attendance, notes and visitations`}
      onPress={() => open(historyTarget(childId, name))}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      style={({ pressed }) => [{ minHeight: 44, justifyContent: "center", opacity: pressed ? 0.6 : 1 }, containerStyle]}
    >
      <Copy numberOfLines={numberOfLines} color={colors.primary} style={style}>
        {name}
      </Copy>
    </Pressable>
  );
}

/** A labelled pill for screens whose header already names the child (a visitation record). */
export function StudentHistoryLink({ childId, name }: { childId: string; name: string }) {
  const { colors } = useAppTheme();
  const canOpen = useCanOpenStudentHistory();
  const open = useOpenStudentHistory();
  if (!canOpen) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Attendance, notes and visitations for ${name}`}
      onPress={() => open(historyTarget(childId, name))}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        minHeight: 44,
        paddingHorizontal: 14,
        borderRadius: 22,
        backgroundColor: pressed ? colors.primarySoft : colors.hover,
      })}
    >
      <Icon ios="clock.arrow.circlepath" android="history" size={16} color={colors.primary} />
      <Copy color={colors.primary} style={{ fontWeight: "600" }}>
        History
      </Copy>
    </Pressable>
  );
}
