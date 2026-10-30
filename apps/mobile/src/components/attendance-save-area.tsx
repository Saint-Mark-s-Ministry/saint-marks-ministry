import { ActivityIndicator, Pressable, useWindowDimensions, View } from "react-native";
import { Copy, Icon, styles } from "@/components/ui";
import {
  attendanceNotices,
  savedByLabel,
  saveStatusText,
  type AttendanceNoticeAction,
  type StatusTone,
} from "@/data/attendance-draft";
import type { EditorState, EditorSummary } from "@/data/attendance-editor";
import { useAppTheme } from "@/theme";

/** Banners above the roster: a failed save, a recovered draft, children who left, a device that cannot keep marks. */
export function AttendanceNotices({
  state,
  summary,
  canEdit,
  onAction,
}: {
  state: EditorState;
  summary: EditorSummary;
  canEdit: boolean;
  onAction: (action: AttendanceNoticeAction) => void;
}) {
  const { colors } = useAppTheme();
  const notices = attendanceNotices({
    canEdit,
    recovered: state.recovered,
    pendingCount: summary.pendingCount,
    storageError: state.storageError,
    removedCount: state.removedCount,
    saveError: state.saveError,
    retryable: state.retryable,
    refreshError: state.refreshError,
    saving: state.saving,
  });
  if (!notices.length) return null;
  const tone = (value: StatusTone) =>
    value === "danger"
      ? { bg: colors.dangerSoft, fg: colors.danger }
      : { bg: colors.warningSoft, fg: colors.warning };
  const label: Record<AttendanceNoticeAction, string> = {
    resume: "Resume saving marks",
    retry: "Retry pending marks",
    reload: "Reload roster and recover marks",
  };
  return (
    <View style={{ gap: 10 }}>
      {notices.map((notice) => (
        <View
          key={notice.id}
          accessibilityRole={notice.tone === "danger" ? "alert" : undefined}
          style={{ backgroundColor: tone(notice.tone).bg, borderRadius: 18, padding: 14, gap: 10 }}
        >
          <Copy color={tone(notice.tone).fg}>{notice.text}</Copy>
          {notice.actions.map((action) => (
            <Pressable
              key={action}
              accessibilityRole="button"
              accessibilityLabel={label[action]}
              accessibilityState={{ disabled: state.saving }}
              disabled={state.saving}
              onPress={() => onAction(action)}
              style={({ pressed }) => ({
                minHeight: 44,
                justifyContent: "center",
                opacity: state.saving ? 0.4 : pressed ? 0.6 : 1,
              })}
            >
              <Copy color={colors.primary} style={{ fontWeight: "600" }}>{label[action]}</Copy>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

/** The bar is persistent chrome: its text stops growing here so the roster stays on screen at the largest text sizes. */
const CAP = 1.3;

/**
 * The bar under the roster. Top: where the marks are now (this device only, saving, saved to the church,
 * or not saved), then who saved last and when, as the server reports it. Below: "Mark rest present" and the
 * explicit "Save attendance", which records the children still unmarked as absent. At large text sizes the
 * two buttons stack rather than squeezing each other.
 */
export function AttendanceSaveBar({
  state,
  summary,
  canEdit,
  bottomInset,
  onMarkRest,
  onSave,
}: {
  state: EditorState;
  summary: EditorSummary;
  canEdit: boolean;
  bottomInset: number;
  onMarkRest: () => void;
  onSave: () => void;
}) {
  const { colors } = useAppTheme();
  const { fontScale } = useWindowDimensions();
  const status = saveStatusText(summary.saveState, summary.pendingCount);
  const toneColor = { muted: colors.text2, warning: colors.warning, success: colors.success, danger: colors.danger }[status.tone];
  const context = savedByLabel(state.lastSavedBy);
  const stacked = fontScale >= 1.3;
  const editable = canEdit && state.phase === "ready" && !state.finalizing;
  const saveLabel = state.saving ? "Saving…" : summary.canFinalize ? "Save attendance" : "Saved";
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset + 18 }}>
      {/* An opaque surface, not glass: this bar's solid buttons are content (chrome.tsx's own rule). */}
      <View
        style={{
          borderRadius: 28,
          paddingVertical: 12,
          paddingHorizontal: 16,
          gap: 10,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: "#000",
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        }}
      >
        <View accessible accessibilityLiveRegion="polite" accessibilityLabel={`${status.title}.${context ? ` ${context}` : ""}`} style={{ gap: 2 }}>
          <View style={[styles.row, { gap: 8, alignItems: "flex-start" }]}>
            {summary.saveState === "saving" ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <View style={{ paddingTop: 2 }}>
                <Icon
                  ios={
                    summary.saveState === "saved"
                      ? "checkmark.circle.fill"
                      : summary.saveState === "failed"
                        ? "exclamationmark.triangle.fill"
                        : summary.saveState === "local" || summary.saveState === "recovered"
                          ? "iphone"
                          : "circle.dashed"
                  }
                  android={summary.saveState === "saved" ? "check_circle" : summary.saveState === "failed" ? "warning" : "smartphone"}
                  size={16}
                  color={toneColor}
                />
              </View>
            )}
            <Copy color={toneColor} maxFontSizeMultiplier={CAP} style={{ fontWeight: "600", flex: 1, minWidth: 0 }}>{status.title}</Copy>
          </View>
          {!!context && <Copy kind="caption" maxFontSizeMultiplier={CAP}>{context}</Copy>}
        </View>
        {canEdit && <View style={{ flexDirection: stacked ? "column" : "row", gap: 8 }}>
          <BarButton label="Mark rest present" disabled={!editable || summary.unmarkedCount === 0} onPress={onMarkRest} grow={!stacked} />
          <BarButton
            label={saveLabel}
            accessibilityLabel={
              summary.canFinalize && summary.unmarkedCount > 0
                ? `Save attendance and mark ${summary.unmarkedCount} unmarked ${summary.unmarkedCount === 1 ? "child" : "children"} absent`
                : saveLabel
            }
            primary
            disabled={!summary.canFinalize || state.finalizing}
            onPress={onSave}
            grow={!stacked}
          />
        </View>}
        {!stacked && summary.canFinalize && summary.unmarkedCount > 0 && (
          <Copy kind="caption" maxFontSizeMultiplier={CAP}>
            Saving records the {summary.unmarkedCount} unmarked {summary.unmarkedCount === 1 ? "child" : "children"} as absent.
          </Copy>
        )}
      </View>
    </View>
  );
}

// The shared Button (an @expo/ui Host) collapses to zero width as a row sibling, so this bar uses Pressable.
function BarButton({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
  primary = false,
  grow = true,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  grow?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={({ pressed }) => ({
        flex: grow ? 1 : undefined,
        minHeight: 48,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 24,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: primary ? colors.primary : colors.hover,
        borderWidth: primary ? 0 : 1,
        borderColor: colors.border,
        opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
      })}
      onPress={onPress}
    >
      <Copy maxFontSizeMultiplier={CAP} style={{ fontWeight: "600", fontSize: 15, textAlign: "center" }} color={primary ? colors.onAction : colors.text}>
        {label}
      </Copy>
    </Pressable>
  );
}
