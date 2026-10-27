import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Copy, Icon, Screen } from "@/components/ui";
import { StudentHistoryView } from "@/components/student-history-view";
import { isWide, paneWidths } from "@/data/duo-layout";
import type { StudentHistoryTarget } from "@/data/student-history";
import { useStudentHistory } from "@/data/use-student-history";
import { useAppTheme } from "@/theme";

export type Selection = {
  /** The child shown in the detail pane. */
  selected: StudentHistoryTarget | null;
  select: (target: StudentHistoryTarget) => void;
};

const SelectionContext = createContext<Selection | null>(null);

/**
 * The detail pane's selection when the screen is showing two panes, or null on a phone. Controls that
 * would otherwise open the History sheet (the clock buttons, a child's name) select here instead, so
 * the list never moves and the history appears beside it.
 */
export function useSplitSelection(): Selection | null {
  return useContext(SelectionContext);
}

/**
 * Two panes on a wide window (the iPhone Duo fully open, or anything at least as wide): the screen's own
 * list on the left, the selected child's history on the right. On a phone it renders the list alone,
 * exactly as before. Width is the window less the vertical bar's inset, never the device name.
 */
export function SplitScreen({
  children,
  listMin,
}: {
  children: ReactNode | ((split: Selection | null) => ReactNode);
  /** A wider minimum for a list whose rows carry controls, such as Take attendance. */
  listMin?: number;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const [selected, setSelected] = useState<StudentHistoryTarget | null>(null);
  const select = useCallback((target: StudentHistoryTarget) => setSelected(target), []);
  const usable = width - insets.left - insets.right;
  const value = useMemo<Selection>(() => ({ selected, select }), [selected, select]);

  const render = (split: Selection | null) => (typeof children === "function" ? children(split) : children);
  if (!isWide(usable)) return <>{render(null)}</>;
  const { list } = paneWidths(usable, listMin);
  return (
    <SelectionContext.Provider value={value}>
      <View style={{ flex: 1, flexDirection: "row", paddingLeft: insets.left, paddingRight: insets.right }}>
        <View style={{ width: list, borderRightWidth: 0.5, borderRightColor: colors.border }}>{render(value)}</View>
        <View style={{ flex: 1 }} accessibilityLabel="Details">
          {selected ? <HistoryPane key={`${selected.program}:${selected.id}`} target={selected} /> : <EmptyDetail />}
        </View>
      </View>
    </SelectionContext.Provider>
  );
}

function HistoryPane({ target }: { target: StudentHistoryTarget }) {
  const state = useStudentHistory(target);
  return (
    <Screen refreshing={false} onRefresh={() => void state.retry()}>
      <StudentHistoryView target={target} state={state} embedded />
    </Screen>
  );
}

function EmptyDetail() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 32 }}>
      <Icon ios="person.crop.circle" android="account_circle" size={44} />
      <Copy kind="heading" style={{ textAlign: "center" }}>Select a child</Copy>
      <Copy kind="caption" style={{ textAlign: "center" }}>
        Their attendance, notes and visitations appear here.
      </Copy>
    </View>
  );
}
