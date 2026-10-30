// Files go directly to Blob storage rather than through Vercel's 4.5 MB
// server-request limit. Any file format is accepted and served as a download.
export const APPROVAL_FORM_MAX_BYTES = 100 * 1024 * 1024
export const APPROVAL_FORM_SIZE_ERROR = 'Please choose a file no larger than 100 MB.'
export const APPROVAL_FORM_CONTENT_TYPE = 'application/octet-stream'

export function approvalFormFileError(file: Pick<File, 'size'>): string | null {
  if (file.size > APPROVAL_FORM_MAX_BYTES) return APPROVAL_FORM_SIZE_ERROR
  if (file.size === 0) return 'This file is empty. Please choose the saved form again.'
  return null
}

export function approvalFormStorageName(filename: string): string {
  return filename.normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '_').replace(/^\./, '_').slice(-150) || 'form'
}

export function approvalFormPrefix(userId: string): string {
  return `mentor-approval-forms/${userId}/`
}

export function isOwnApprovalFormPath(pathname: string, userId: string): boolean {
  const prefix = approvalFormPrefix(userId)
  return pathname.startsWith(prefix) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-zA-Z0-9_.-]{1,150}$/.test(pathname.slice(prefix.length)) &&
    !pathname.includes('..')
}

export async function readApprovalFormResponse(response: Response): Promise<Record<string, unknown>> {
  // Hosting errors can be plain text or HTML. Safari reports invalid JSON as
  // "The string did not match the expected pattern"; never show that to users.
  const data: unknown = await response.json().catch(() => null)
  const result = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null

  if (response.status === 413) throw new Error(APPROVAL_FORM_SIZE_ERROR)
  if (response.status === 401 || response.redirected) {
    throw new Error('Your session may have expired. Sign in again, then upload the form.')
  }
  if (!response.ok) {
    throw new Error(typeof result?.error === 'string' && result.error
      ? result.error
      : 'Unable to upload the form right now. Please try again.')
  }
  if (!result) throw new Error('Unable to confirm the upload. Refresh the page to check your form before trying again.')
  return result
}

interface ApprovalFormUploadResult {
  url: string
  filename: string
  complete: boolean
  mentorReviewStatus?: string
}

export async function readApprovalFormUploadResponse(response: Response): Promise<ApprovalFormUploadResult> {
  const result = await readApprovalFormResponse(response)
  if (!result || typeof result.url !== 'string' || !result.url ||
    typeof result.filename !== 'string' || !result.filename || typeof result.complete !== 'boolean') {
    throw new Error('Unable to confirm the upload. Refresh the page to check your form before trying again.')
  }

  return {
    url: result.url,
    filename: result.filename,
    complete: result.complete,
    ...(typeof result.mentorReviewStatus === 'string' ? { mentorReviewStatus: result.mentorReviewStatus } : {}),
  }
}
