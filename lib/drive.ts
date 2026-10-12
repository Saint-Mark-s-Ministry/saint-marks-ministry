export interface DriveFile {
  id: string
  name: string
  mimeType: string
  webViewLink: string
  iconLink: string
  modifiedTime: string
  size?: string
}

const MIME_LABELS: Record<string, string> = {
  "application/vnd.google-apps.folder": "Folder",
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
}

export function mimeLabel(mimeType: string): string {
  return MIME_LABELS[mimeType] ?? "File"
}

export function isFolder(mimeType: string): boolean {
  return mimeType === "application/vnd.google-apps.folder"
}

export function formatSize(bytes?: string): string {
  if (!bytes) return ""
  const n = parseInt(bytes, 10)
  if (isNaN(n)) return ""
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

/** Drive returns at most this many items per page; we follow nextPageToken for the rest. */
const PAGE_SIZE = 1000
/** A safety bound on pagination: 10 pages is 10,000 items in one folder. */
const MAX_PAGES = 10

/**
 * Every file in a Drive folder, or `null` when Drive could not be reached or
 * refused the request, so callers can tell a failure from an empty folder.
 * `folderId` must already be validated with `isDriveId`.
 */
export async function getDriveFiles(
  folderId: string,
  resourceKey?: string
): Promise<DriveFile[] | null> {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    console.error("Drive: GOOGLE_API_KEY is not set")
    return null
  }

  const headers: HeadersInit = { "Content-Type": "application/json" }
  if (resourceKey) {
    headers["X-Goog-Drive-Resource-Keys"] = `${folderId}/${resourceKey}`
  }

  const files: DriveFile[] = []
  let pageToken: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      key: apiKey,
      fields: "nextPageToken,files(id,name,mimeType,webViewLink,iconLink,modifiedTime,size)",
      orderBy: "folder,name",
      pageSize: String(PAGE_SIZE),
    })
    if (pageToken) params.set("pageToken", pageToken)

    let res: Response
    try {
      res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers,
        next: { revalidate: process.env.NODE_ENV === "development" ? 0 : 3600 },
      })
    } catch (error: unknown) {
      console.error("Drive: request failed:", error instanceof Error ? error.message : error)
      return null
    }
    if (!res.ok) {
      console.error(`Drive: listing folder ${folderId} responded ${res.status}`)
      return null
    }

    const data = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string }
    files.push(...(data.files ?? []))
    pageToken = data.nextPageToken
    if (!pageToken) break
  }
  return files
}
