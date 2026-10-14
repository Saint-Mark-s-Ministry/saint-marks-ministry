import { useState } from "react";
import { Image, View } from "react-native";
import { apiOrigin, useAuth } from "@/data/auth-provider";
import { InitialsAvatar } from "./ui";

/** Keep the monogram visible while a photo loads, or if its URL fails. */
export function AccountAvatar({ size = 32, filled = false }: { size?: number; filled?: boolean }) {
  const { user } = useAuth();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  let uri: string | null = null;
  if (user?.profileImageUrl) {
    try {
      const url = new URL(user.profileImageUrl, apiOrigin);
      if (url.protocol === "https:" || url.protocol === "http:") uri = url.toString();
    } catch { /* An invalid or unavailable photo falls back to the monogram. */ }
  }
  return <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden" }}>
    <InitialsAvatar name={user?.name} size={size} filled={filled} />
    {uri && failedUrl !== uri && <Image source={{ uri }} resizeMode="cover" accessible={false}
      accessibilityIgnoresInvertColors onError={() => setFailedUrl(uri)}
      style={{ position: "absolute", width: size, height: size, borderRadius: size / 2 }} />}
  </View>;
}
