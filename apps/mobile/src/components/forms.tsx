import { forwardRef, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, Switch, TextInput, View } from "react-native";
import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import { Stack } from "expo-router";
import { Button, Card, Copy, Icon, Screen } from "./ui";
import { GlassChrome } from "./chrome";
import { useAppTheme } from "@/theme";

export const Field = forwardRef<TextInput, {
  label: string; value: string; onChange: (value: string) => void; multiline?: boolean; disabled?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric"; placeholder?: string; secureTextEntry?: boolean;
  /** Shown below the input in the danger color, and announced to VoiceOver as it appears. */
  error?: string;
}>(function Field({ label, value, onChange, multiline = false, disabled = false, secureTextEntry = false, error, ...rest }, ref) {
  const { colors } = useAppTheme();
  const [passwordVisible, setPasswordVisible] = useState(false);
  return <View style={{ gap: 7 }}><View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
    <Copy kind="caption">{label}</Copy>
    {secureTextEntry && <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${passwordVisible ? "Hide" : "Show"} ${label.toLowerCase()}`}
      disabled={disabled}
      hitSlop={10}
      onPress={() => setPasswordVisible(visible => !visible)}
    ><Copy kind="caption" color={disabled ? colors.muted : colors.primary}>{passwordVisible ? "Hide" : "Show"}</Copy></Pressable>}
  </View><TextInput
    ref={ref}
    accessibilityLabel={label} accessibilityHint={error} value={value} onChangeText={onChange} editable={!disabled}
    multiline={multiline} autoCapitalize={rest.keyboardType === "email-address" || secureTextEntry ? "none" : "sentences"}
    autoCorrect={!secureTextEntry} secureTextEntry={secureTextEntry && !passwordVisible} placeholderTextColor={colors.muted}
    style={{ backgroundColor: colors.surface, color: colors.text,
      borderColor: error ? colors.danger : colors.border, borderWidth: error ? 1.5 : 1,
      borderRadius: 12, padding: 14, minHeight: multiline ? 100 : 50, textAlignVertical: "top", opacity: disabled ? 0.5 : 1 }} {...rest} />
    {!!error && <View accessibilityLiveRegion="polite"><Copy kind="caption" color={colors.danger}>{error}</Copy></View>}
  </View>;
});
export type Option = { value: string; label: string };
export function Toggle({ label, value, onChange, disabled = false }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <View style={{ flexDirection: "row", gap: 14, alignItems: "center", justifyContent: "space-between" }}><Copy style={{ flex: 1 }}>{label}</Copy><Switch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={disabled} /></View>;
}
export function Choice({ label, value, options, onChange, disabled = false, compact = false }: {
  label: string; value: string; options: Option[]; onChange: (value: string) => void; disabled?: boolean; compact?: boolean;
}) {
  const { colors } = useAppTheme();
  const selectedLabel = options.find(option => option.value === value)?.label ?? "Choose…";
  const unavailable = disabled || options.length === 0;
  const actions: MenuAction[] = options.map(option => ({
    id: option.value,
    title: option.label,
    state: option.value === value ? "on" : "off",
  }));
  const trigger = <View
    accessibilityRole="button"
    accessibilityLabel={`${label}: ${selectedLabel}`}
    accessibilityHint="Opens a menu"
    accessibilityState={{ disabled: unavailable }}
    style={{
      width: compact ? undefined : "100%",
      minWidth: compact ? 170 : undefined,
      opacity: unavailable ? 0.45 : 1,
    }}
  ><GlassChrome interactive={!unavailable} style={{ borderRadius: 16 }}><View style={{
    minHeight: 52, paddingHorizontal: 20, paddingVertical: 14, flexDirection: "row",
    alignItems: "center", justifyContent: "space-between", gap: 12,
  }}><Copy color={colors.primary} style={{ flex: 1, fontWeight: "600", textAlign: "center" }}>{selectedLabel}</Copy>
    <Icon ios="chevron.up.chevron.down" android="unfold_more" size={15} color={colors.primary} />
  </View></GlassChrome></View>;

  return <View style={{ gap: 7, alignSelf: compact ? "flex-start" : "stretch" }}><Copy kind="caption">{label}</Copy>
    {unavailable ? trigger : <MenuView
      title={label}
      actions={actions}
      style={{ alignSelf: compact ? "flex-start" : "stretch" }}
      onPressAction={({ nativeEvent }) => onChange(nativeEvent.event)}
    >{trigger}</MenuView>}
  </View>;
}
export function ResourceState({ loading, error, retry, empty }: { loading: boolean; error?: string; retry: () => void; empty?: boolean }) {
  if (loading) return <ActivityIndicator accessibilityLabel="Loading" />;
  if (error) return <Card><Copy>{error}</Copy><Button label="Try again" onPress={retry} /></Card>;
  return empty ? <Card><Copy>No records found.</Copy></Card> : null;
}
export function Page({ title, children, loading = false, refreshing = false, error, refresh }: {
  title: string; children: ReactNode; loading?: boolean; refreshing?: boolean; error?: string; refresh?: () => void;
}) {
  return <><Stack.Screen options={{ title }} /><Screen refreshing={loading || refreshing} onRefresh={refresh}>
    <ResourceState loading={loading} error={error} retry={() => refresh?.()} />{children}
  </Screen></>;
}
export function useAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>, success?: string) => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await action(); if (success) Alert.alert(success); }
    catch (error) { Alert.alert("Unable to complete", error instanceof Error ? error.message : "Please try again."); }
    finally { lock.current = false; setBusy(false); }
  };
  return { busy, run };
}
export function confirmAction(title: string, message: string, action: () => void, destructive = false) {
  Alert.alert(title, message, [{ text: "Cancel", style: "cancel" }, { text: "Confirm", style: destructive ? "destructive" : "default", onPress: action }]);
}
