/**
 * Pure logic for the Servants Prep Files library (SMM-42), pulled out of the
 * screen components so sorting/filtering/formatting are unit-testable
 * without rendering native UI. Mirrors lib/drive.ts on the web — same
 * Google Drive-backed data source, same formatting rules — duplicated here
 * since mobile can't import from the Next.js app's lib/.
 */

// Same public (non-secret) IDs as lib/drive-folders.ts on the web.
export const ROOT_FOLDER = {
  id: "0ByflSbu6LLHWZVR1aDg2WjBHQ1E",
  name: "Files",
  resourceKey: "0-CMdz-90PDFKBVc8EaqffCw",
};

export const FOLDER_MIME = "application/vnd.google-apps.folder";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  iconLink?: string;
  modifiedTime?: string;
  size?: string;
};

export function isFolder(mimeType: string): boolean {
  return mimeType === FOLDER_MIME;
}

/** Real, directly-previewable image types — RN's own <Image> can render these from a public Drive URL with no download step. */
export function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/** Drive's public direct-view URL — works for any file in a publicly-shared folder without the server-side API key, so it's safe to build client-side. */
export function imagePreviewUri(fileId: string): string {
  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

const MIME_LABELS: Record<string, string> = {
  [FOLDER_MIME]: "Folder",
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/vnd.google-apps.document": "Google Doc",
  "application/vnd.google-apps.presentation": "Google Slides",
  "application/vnd.google-apps.spreadsheet": "Google Sheets",
  "video/mp4": "Video",
  "audio/mpeg": "Audio",
  "audio/mp3": "Audio",
  "image/jpeg": "Image",
  "image/png": "Image",
};

export function mimeLabel(mimeType: string): string {
  if (MIME_LABELS[mimeType]) return MIME_LABELS[mimeType];
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Audio";
  return "File";
}

export function formatSize(bytes?: string): string {
  if (!bytes) return "";
  const n = Number(bytes);
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "{Type} · {size} · {date}" — matches the design source's row subtitle exactly. */
export function fileSubtitle(file: DriveFile): string {
  return [mimeLabel(file.mimeType), formatSize(file.size), formatDate(file.modifiedTime)]
    .filter(Boolean)
    .join(" · ");
}

export function splitFolders<T extends { mimeType: string }>(files: T[]): { folders: T[]; regular: T[] } {
  return { folders: files.filter((f) => isFolder(f.mimeType)), regular: files.filter((f) => !isFolder(f.mimeType)) };
}

/** Most-recently-modified first — matches the design source's "Recent" ordering. */
export function sortByRecent<T extends { modifiedTime?: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => (b.modifiedTime ?? "").localeCompare(a.modifiedTime ?? ""));
}

export function searchFiles<T extends { name: string }>(files: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return files;
  return files.filter((f) => f.name.toLowerCase().includes(q));
}

/**
 * The real /api/drive route has no server-side search, pagination, or
 * recursive/"recent across the whole library" endpoint — it only lists one
 * folder's direct children. Search and "Recent" are both scoped to whatever
 * folder is currently open, exactly like the existing web admin page
 * (components/drive-file-browser.tsx) already does; a true cross-folder
 * recent-files feed would need either a new backend endpoint or walking
 * every subfolder's children on every screen load, neither of which this
 * ticket's scope covers.
 */
export function regularSectionTitle(hasFolders: boolean): string {
  return hasFolders ? "Recent" : "Files";
}
