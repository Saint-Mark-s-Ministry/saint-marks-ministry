import { Image, Linking, View } from "react-native";
import { Button, Copy } from "@/components/ui";
import { isImageFile } from "@/data/rotation-forms";
import { useAppTheme } from "@/theme";

/** A student's signed form: shown inline when it's a photo, opened from a button when it's a PDF. */
export function RotationEvidence({
  fileUrl,
  filename,
  label = "Submitted form",
  height = 220,
}: {
  fileUrl: string;
  filename: string;
  label?: string;
  height?: number;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 8 }}>
      <Copy kind="caption">{label} · {filename}</Copy>
      {isImageFile(null, filename) ? (
        <Image
          source={{ uri: fileUrl }}
          accessibilityLabel={`${label}, ${filename}`}
          resizeMode="contain"
          style={{ width: "100%", height, borderRadius: 12, backgroundColor: colors.hover }}
        />
      ) : (
        <Button secondary label="View signed form" onPress={() => void Linking.openURL(fileUrl).catch(() => undefined)} />
      )}
    </View>
  );
}
