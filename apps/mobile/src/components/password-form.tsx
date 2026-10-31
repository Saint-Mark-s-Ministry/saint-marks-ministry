import { useState } from "react";
import { View } from "react-native";
import { Button, Copy, ListSurface } from "./ui";
import { Field, useAction } from "./forms";
import { request } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { PASSWORD_MIN_LENGTH, meetsMinimumLength, passwordStrength, validatePasswordChange } from "@/data/account";
import { useAppTheme } from "@/theme";

const STRENGTH_LABEL: Record<string, string> = {
  weak: "Too short",
  fair: "Fair",
  good: "Good",
  strong: "Strong",
};
const STRENGTH_FILL: Record<string, number> = { weak: 0.15, fair: 0.4, good: 0.7, strong: 1 };

export function PasswordForm({ forced = false }: { forced?: boolean }) {
  const { colors } = useAppTheme();
  const { signOut } = useAuth();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const action = useAction();

  const strength = newPassword ? passwordStrength(newPassword) : null;
  const strengthColor = strength === "strong" ? colors.success : strength === "good" ? colors.info : colors.warning;

  if (success) {
    return (
      <ListSurface style={{ padding: 20, alignItems: "center", gap: 8 }}>
        <Copy kind="heading">Password changed</Copy>
        <Copy kind="caption" style={{ textAlign: "center" }}>
          Signing you out so you can sign back in with your new password.
        </Copy>
      </ListSurface>
    );
  }

  function submit() {
    setFieldError(null);
    const { error } = validatePasswordChange(currentPassword, newPassword, confirmation);
    if (error) {
      setFieldError(error);
      return;
    }
    void action.run(async () => {
      await request("/api/auth/change-password", "POST", { currentPassword, newPassword });
      setCurrent("");
      setNew("");
      setConfirmation("");
      setSuccess(true);
      setTimeout(() => void signOut(), 1200);
    });
  }

  return (
    <View style={{ gap: 14 }}>
      <Field
        label="Current password"
        value={currentPassword}
        onChange={setCurrent}
        secureTextEntry
        disabled={action.busy}
        placeholder="Required"
      />
      <Field
        label="New password"
        value={newPassword}
        onChange={setNew}
        secureTextEntry
        disabled={action.busy}
        placeholder={`Minimum ${PASSWORD_MIN_LENGTH} characters`}
      />
      {!!newPassword && (
        <View style={{ gap: 6 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.hover, overflow: "hidden" }}>
            <View style={{ height: "100%", width: `${(STRENGTH_FILL[strength!] ?? 0) * 100}%`, backgroundColor: strengthColor }} />
          </View>
          <Copy kind="caption" color={strengthColor}>
            {STRENGTH_LABEL[strength!]}
            {meetsMinimumLength(newPassword) ? " · meets the minimum length" : ` · needs ${PASSWORD_MIN_LENGTH - newPassword.length} more characters`}
          </Copy>
          {meetsMinimumLength(newPassword) && strength !== "strong" && (
            <Copy kind="caption">Tip: mixing upper/lowercase, numbers, and symbols makes it stronger.</Copy>
          )}
        </View>
      )}
      <Field
        label="Confirm new password"
        value={confirmation}
        onChange={setConfirmation}
        secureTextEntry
        disabled={action.busy}
        placeholder="Required"
        error={fieldError ?? undefined}
      />
      {forced && <Copy kind="caption">You must change your password before continuing.</Copy>}
      <Button
        label={action.busy ? "Changing…" : "Change password"}
        disabled={action.busy || !currentPassword || !newPassword || !confirmation}
        onPress={submit}
      />
    </View>
  );
}
