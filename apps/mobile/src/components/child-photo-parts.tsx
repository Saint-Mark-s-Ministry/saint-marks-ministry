import { useState } from "react";
import { ActivityIndicator, Image, Pressable, View } from "react-native";
import { Copy, Icon, InitialsAvatar } from "@/components/ui";
import { apiOrigin } from "@/data/auth-provider";
import { childPhotoUri } from "@/data/child-photo";
import type { PhotoNotice } from "@/data/use-child-photos";
import { useAppTheme } from "@/theme";

/**
 * A child's photo, else the linked account's photo, else initials, exactly as the
 * server's fallback order decides. The monogram stays underneath while a photo
 * loads or if its address fails.
 */
export function ChildAvatar({
  child,
  name,
  size = 36,
}: {
  child: { photoUrl?: string | null; accountPhotoUrl?: string | null; user?: { profileImageUrl?: string | null } | null };
  name: string;
  size?: number;
}) {
  const uri = apiOrigin ? childPhotoUri(child, apiOrigin) : null;
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden" }}>
      <InitialsAvatar name={name} size={size} variant="accent" />
      {uri && failed !== uri && (
        <Image
          source={{ uri }}
          resizeMode="cover"
          accessible
          accessibilityLabel={`${name} profile photo`}
          accessibilityIgnoresInvertColors
          onError={() => setFailed(uri)}
          style={{ position: "absolute", width: size, height: size, borderRadius: size / 2 }}
        />
      )}
    </View>
  );
}

/** The camera shortcut on a roster row: a 44pt control apart from the row's own tap. */
export function TakePhotoButton({ name, busy, onPress }: { name: string; busy: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Take photo of ${name}`}
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
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
      {busy ? <ActivityIndicator color={colors.primary} /> : <Icon ios="camera" android="photo_camera" size={18} color={colors.text2} />}
    </Pressable>
  );
}

/**
 * What happened with a photo, or what to do about it: a refused camera (with Settings
 * and the library as the way around it), a failed upload (the saved photo is
 * unchanged), or the success message. Spoken by a screen reader.
 */
export function PhotoNoticeBanner({
  notice,
  uploading,
  onDismiss,
  onChoose,
  onOpenSettings,
}: {
  notice: PhotoNotice | null;
  /** Shows a progress line while the server is receiving the photo. */
  uploading?: string | null;
  onDismiss: () => void;
  onChoose?: (target: NonNullable<PhotoNotice["target"]>) => void;
  onOpenSettings: () => void;
}) {
  const { colors } = useAppTheme();
  if (uploading) {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={uploading}
        accessibilityLiveRegion="polite"
        style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 18, backgroundColor: colors.hover }}
      >
        <ActivityIndicator color={colors.primary} />
        <Copy style={{ flex: 1 }} color={colors.text2}>{uploading}</Copy>
      </View>
    );
  }
  if (!notice) return null;
  const error = notice.kind === "error";
  const permission = notice.kind === "permission";
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole={error || permission ? "alert" : undefined}
      style={{ gap: 10, padding: 14, borderRadius: 18, backgroundColor: error ? colors.dangerSoft : permission ? colors.warningSoft : colors.hover }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <Copy style={{ flex: 1 }} color={error ? colors.danger : permission ? colors.text : colors.text2}>{notice.message}</Copy>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss message"
          onPress={onDismiss}
          hitSlop={8}
          style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: -12, marginRight: -8 }}
        >
          <Icon ios="xmark" android="close" size={14} color={colors.muted} />
        </Pressable>
      </View>
      {(permission || (error && notice.target)) && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {notice.canOpenSettings && <NoticeAction label="Open Settings" onPress={onOpenSettings} />}
          {notice.target && onChoose && (
            <NoticeAction label="Choose from library" onPress={() => onChoose(notice.target!)} />
          )}
        </View>
      )}
    </View>
  );
}

function NoticeAction({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 16,
        borderRadius: 22,
        justifyContent: "center",
        backgroundColor: pressed ? colors.primarySoft : colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      })}
    >
      <Copy kind="caption" color={colors.primary} style={{ fontWeight: "600" }}>{label}</Copy>
    </Pressable>
  );
}
