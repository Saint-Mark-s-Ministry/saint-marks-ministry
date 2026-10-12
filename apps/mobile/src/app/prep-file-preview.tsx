import { useState } from "react";
import { Alert, Image, Linking, Pressable, Share, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Copy, Icon } from "@/components/ui";
import { useAppTheme } from "@/theme";
import { formatSize, imagePreviewUri, isImage, mimeLabel } from "@/data/prep-files";

export default function PrepFilePreview() {
  const { colors } = useAppTheme();
  const { id, name, mimeType, webViewLink, size } = useLocalSearchParams<{
    id: string;
    name: string;
    mimeType: string;
    webViewLink: string;
    size: string;
  }>();
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = isImage(mimeType) && !imageFailed;

  function share() {
    if (!webViewLink) return;
    void Share.share({ message: name, url: webViewLink }).catch(() => undefined);
  }

  function openInDrive() {
    if (!webViewLink) {
      Alert.alert("Link unavailable", "This file has no Drive link to open.");
      return;
    }
    void Linking.openURL(webViewLink).catch(() =>
      Alert.alert("Couldn't open Drive", "Please try again."),
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={{ alignItems: "center" }}>
              <Copy style={{ fontWeight: "600" }} numberOfLines={1}>{name}</Copy>
              <Copy kind="caption">{mimeLabel(mimeType)}</Copy>
            </View>
          ),
          headerLargeTitle: false,
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Share" hitSlop={8} onPress={share}>
              <Icon ios="square.and.arrow.up" android="share" size={20} />
            </Pressable>
          ),
        }}
      />
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 16, gap: 16 }}>
        <View style={{ flex: 1, borderRadius: 18, overflow: "hidden", backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
          {showImage ? (
            <Image
              source={{ uri: imagePreviewUri(id) }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="contain"
              onError={() => setImageFailed(true)}
              accessibilityLabel={name}
            />
          ) : (
            <View style={{ alignItems: "center", gap: 10, padding: 32 }}>
              <Icon ios="doc.fill" android="description" size={40} color={colors.muted} />
              <Copy kind="heading" style={{ textAlign: "center" }}>{mimeLabel(mimeType)}</Copy>
              <Copy kind="caption" style={{ textAlign: "center" }}>
                Preview isn't available for this file type here — open it in Drive to view it.
              </Copy>
            </View>
          )}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.hover, borderRadius: 32, height: 64, paddingHorizontal: 18 }}>
          <Copy kind="caption" numberOfLines={1} style={{ flex: 1 }}>
            {name}
            {size ? ` · ${formatSize(size)}` : ""}
          </Copy>
          <Pressable
            accessibilityRole="button"
            onPress={openInDrive}
            style={({ pressed }) => ({
              backgroundColor: colors.text,
              height: 48,
              paddingHorizontal: 16,
              borderRadius: 24,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Copy style={{ fontWeight: "600" }} color={colors.background}>Open in Drive</Copy>
          </Pressable>
        </View>
      </View>
    </>
  );
}
