import { useState } from "react";
import { Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import { Copy, Icon, ListSurface, Screen, styles } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { useResource } from "@/data/resources";
import { useAppTheme } from "@/theme";
import {
  ROOT_FOLDER,
  fileSubtitle,
  regularSectionTitle,
  searchFiles,
  sortByRecent,
  splitFolders,
  type DriveFile,
} from "@/data/prep-files";

type FolderCrumb = { id: string; name: string; resourceKey?: string };

export default function PrepFiles() {
  const { colors } = useAppTheme();
  const [stack, setStack] = useState<FolderCrumb[]>([ROOT_FOLDER]);
  const [search, setSearch] = useState("");
  const current = stack[stack.length - 1];

  const resource = useResource<{ files: DriveFile[] }>(
    `/api/drive?folderId=${encodeURIComponent(current.id)}${current.resourceKey ? `&resourceKey=${encodeURIComponent(current.resourceKey)}` : ""}`,
  );
  const offline = resource.error === "Could not reach the server. Check your connection and try again.";

  const all = resource.data?.files ?? [];
  const { folders, regular } = splitFolders(all);
  const recent = sortByRecent(regular);
  const filteredFolders = searchFiles(folders, search);
  const filteredRecent = searchFiles(recent, search);

  function openFolder(f: DriveFile) {
    setSearch("");
    setStack((s) => [...s, { id: f.id, name: f.name }]);
  }

  function openFile(f: DriveFile) {
    router.push({
      pathname: "/prep-file-preview",
      params: {
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        webViewLink: f.webViewLink ?? "",
        size: f.size ?? "",
      },
    });
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: current.name,
          headerLeft: () => (stack.length > 1 ? <BackToParent name={stack[stack.length - 2].name} onPress={() => setStack((s) => s.slice(0, -1))} /> : <MinistrySwitcherHeaderLeft ministry="prep" />),
        }}
      />
      <Stack.SearchBar
        autoCapitalize="none"
        placement="automatic"
        placeholder="Search files"
        onChangeText={(event) => setSearch(event.nativeEvent.text)}
      />
      <Screen refreshing={resource.loading} onRefresh={() => void resource.refresh()}>
        <Copy kind="caption">Program recordings and materials</Copy>

        {offline && (
          <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.dangerSoft, gap: 6 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.danger}>You're offline</Copy>
            <Copy kind="caption">Showing the last data we had. Pull down to try again once you're back online.</Copy>
          </View>
        )}
        {!offline && <ResourceState loading={resource.loading} error={resource.error} retry={() => void resource.refresh()} />}

        {resource.data && !filteredFolders.length && !filteredRecent.length && (
          <Copy>{search ? `No files match "${search}".` : "This folder is empty."}</Copy>
        )}

        {!!filteredFolders.length && (
          <View style={{ gap: 10 }}>
            <Copy style={{ fontSize: 17, fontWeight: "600" }}>Folders</Copy>
            <ListSurface>
              {filteredFolders.map((f, index) => (
                <FolderRow key={f.id} file={f} divider={index < filteredFolders.length - 1} onPress={() => openFolder(f)} />
              ))}
            </ListSurface>
          </View>
        )}

        {!!filteredRecent.length && (
          <View style={{ gap: 10 }}>
            <Copy style={{ fontSize: 17, fontWeight: "600" }}>{regularSectionTitle(!!filteredFolders.length)}</Copy>
            <ListSurface>
              {filteredRecent.map((f, index) => (
                <FileRow key={f.id} file={f} divider={index < filteredRecent.length - 1} onPress={() => openFile(f)} />
              ))}
            </ListSurface>
          </View>
        )}
      </Screen>
    </>
  );
}

function BackToParent({ name, onPress }: { name: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Back to ${name}`} hitSlop={10} onPress={onPress}>
      <Icon ios="chevron.left" android="chevron_left" size={22} />
    </Pressable>
  );
}

function FolderRow({ file, divider, onPress }: { file: DriveFile; divider: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  // Gold tile, confirmed exact from the design source (same token as the
  // Roster mentor-avatar gold — a deliberate neutral accent for folders,
  // independent of Prep's own maroon primary).
  const count = useResource<{ files: DriveFile[] }>(`/api/drive?folderId=${encodeURIComponent(file.id)}`);
  const itemCount = count.data?.files.length;
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
      <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#F6EFDD" }}>
        <Icon ios="folder.fill" android="folder" size={17} color="#8A6A1C" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Copy style={{ fontWeight: "500" }} numberOfLines={1}>{file.name}</Copy>
        <Copy kind="caption" numberOfLines={1}>{itemCount === undefined ? " " : `${itemCount} ${itemCount === 1 ? "item" : "items"}`}</Copy>
      </View>
      <Icon ios="chevron.right" android="chevron_right" size={14} color={colors.muted} />
    </Pressable>
  );
}

function FileRow({ file, divider, onPress }: { file: DriveFile; divider: boolean; onPress: () => void }) {
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
      <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}>
        <Icon ios="doc.fill" android="description" size={17} color={colors.text2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Copy style={{ fontWeight: "500" }} numberOfLines={1}>{file.name}</Copy>
        <Copy kind="caption" numberOfLines={1}>{fileSubtitle(file)}</Copy>
      </View>
      <Icon ios="chevron.right" android="chevron_right" size={14} color={colors.muted} />
    </Pressable>
  );
}
