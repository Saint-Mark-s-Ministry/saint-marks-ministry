import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { Copy, Icon, ListSurface, styles } from "@/components/ui";
import { Page } from "@/components/forms";
import { useResource } from "@/data/resources";
import { useAppTheme } from "@/theme";

// Mirrors lib/drive-folders.ts on the web — same public (non-secret) IDs,
// just duplicated here since mobile can't import from the Next.js app's lib/.
const ROOT_FOLDER = { id: "0ByflSbu6LLHWZVR1aDg2WjBHQ1E", name: "Files", resourceKey: "0-CMdz-90PDFKBVc8EaqffCw" };
const FOLDER_MIME = "application/vnd.google-apps.folder";

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
  size?: string;
};

function formatSize(bytes?: string) {
  if (!bytes) return "";
  const n = Number(bytes);
  if (Number.isNaN(n)) return "";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PrepFiles() {
  const { colors } = useAppTheme();
  const [stack, setStack] = useState<{ id: string; name: string; resourceKey?: string }[]>([ROOT_FOLDER]);
  const current = stack[stack.length - 1];
  const resource = useResource<{ files: DriveFile[] }>(
    `/api/drive?folderId=${encodeURIComponent(current.id)}${current.resourceKey ? `&resourceKey=${encodeURIComponent(current.resourceKey)}` : ""}`,
  );
  const files = resource.data?.files ?? [];
  const folders = files.filter((f) => f.mimeType === FOLDER_MIME);
  const regular = files.filter((f) => f.mimeType !== FOLDER_MIME);

  return (
    <Page title={current.name} loading={resource.loading} error={resource.error} refresh={() => void resource.refresh()}>
      <Copy kind="caption">Program recordings and materials</Copy>
      {stack.length > 1 && (
        <Pressable accessibilityRole="button" onPress={() => setStack((s) => s.slice(0, -1))}>
          <Copy kind="caption" color={colors.primary}>
            ← Back to {stack[stack.length - 2].name}
          </Copy>
        </Pressable>
      )}

      {!!folders.length && (
        <>
          <Copy kind="heading">Folders</Copy>
          <ListSurface>
            {folders.map((f, index) => (
              <Row
                key={f.id}
                icon="folder"
                title={f.name}
                subtitle={undefined}
                divider={index < folders.length - 1}
                onPress={() => setStack((s) => [...s, { id: f.id, name: f.name, resourceKey: undefined }])}
              />
            ))}
          </ListSurface>
        </>
      )}

      {!!regular.length && (
        <>
          <Copy kind="heading">Files</Copy>
          <ListSurface>
            {regular.map((f, index) => (
              <Row
                key={f.id}
                icon="doc"
                title={f.name}
                subtitle={formatSize(f.size)}
                divider={index < regular.length - 1}
                onPress={() => {
                  if (f.webViewLink) void Linking.openURL(f.webViewLink).catch(() => undefined);
                }}
              />
            ))}
          </ListSurface>
        </>
      )}

      {resource.data && !files.length && <Copy kind="caption">This folder is empty.</Copy>}
    </Page>
  );
}

function Row({
  icon,
  title,
  subtitle,
  divider,
  onPress,
}: {
  icon: "folder" | "doc";
  title: string;
  subtitle?: string;
  divider: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.compactRow,
        divider && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
        { backgroundColor: pressed ? colors.primarySoft : "transparent" },
      ]}
    >
      <Icon ios={icon === "folder" ? "folder.fill" : "doc.fill"} android={icon === "folder" ? "folder" : "description"} size={20} />
      <View style={{ flex: 1, gap: 2 }}>
        <Copy style={{ fontWeight: "600" }}>{title}</Copy>
        {!!subtitle && <Copy kind="caption">{subtitle}</Copy>}
      </View>
      <Icon ios="chevron.right" android="chevron_right" size={14} color={colors.muted} />
    </Pressable>
  );
}
