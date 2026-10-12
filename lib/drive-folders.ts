export const DRIVE_FOLDER_ID = "0ByflSbu6LLHWZVR1aDg2WjBHQ1E"
export const DRIVE_RESOURCE_KEY = "0-CMdz-90PDFKBVc8EaqffCw"

/** Google Drive file and folder IDs are URL-safe base64-ish tokens. */
const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/

/** True for a string shaped like a Drive ID; anything else never reaches the Drive query. */
export function isDriveId(value: unknown): value is string {
  return typeof value === "string" && DRIVE_ID.test(value)
}

export interface DriveCrumb {
  id: string
  name: string
  resourceKey?: string
}

export const DRIVE_ROOT_CRUMB: DriveCrumb = { id: DRIVE_FOLDER_ID, name: "Files", resourceKey: DRIVE_RESOURCE_KEY }

const MAX_DEPTH = 20

/** Where the browser keeps the open folder path for this tab. */
export const DRIVE_PATH_STORAGE_KEY = "drive-file-browser:path"

/**
 * The folder path below the root, as stored for this tab, so returning from a
 * file preview (a separate page on phones) or reloading lands in the same
 * folder instead of the root.
 */
export function serializeCrumbs(crumbs: DriveCrumb[]): string {
  return JSON.stringify(crumbs.slice(1).map(({ id, name }) => ({ id, name })))
}

/** Rebuild a path from storage; anything malformed falls back to the root. */
export function parseStoredCrumbs(raw: string | null): DriveCrumb[] {
  const crumbs: DriveCrumb[] = [DRIVE_ROOT_CRUMB]
  if (!raw) return crumbs
  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch {
    return crumbs
  }
  if (!Array.isArray(stored)) return crumbs
  for (const entry of stored.slice(0, MAX_DEPTH)) {
    // Stop at the first malformed level rather than skipping it, so the path
    // never jumps to an unrelated folder.
    if (!entry || typeof entry !== "object" || !isDriveId((entry as DriveCrumb).id)) break
    const name = (entry as DriveCrumb).name
    crumbs.push({ id: (entry as DriveCrumb).id, name: typeof name === "string" && name.trim() ? name.trim() : "Folder" })
  }
  return crumbs
}
