// Server-side validation shared by the slip upload routes (/api/slips and
// /api/slips/mine). Kept out of the route files, which may only export handlers.

export const SLIP_FILE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'application/pdf']
export const SLIP_MAX_BYTES = 4.5 * 1024 * 1024 // Vercel's server upload limit

/** Returns an error message for an unacceptable slip file, or null if it is fine. */
export function slipFileError(file: { type: string; size: number }): string | null {
  if (!SLIP_FILE_TYPES.includes(file.type)) return 'Please upload a photo (PNG, JPG, WEBP, GIF) or a PDF'
  if (file.size === 0) return 'The file is empty'
  if (file.size > SLIP_MAX_BYTES) return 'File size exceeds 4.5 MB limit'
  return null
}
