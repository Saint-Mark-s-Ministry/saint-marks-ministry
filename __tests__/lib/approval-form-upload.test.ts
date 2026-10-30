import { describe, expect, it } from 'vitest'
import {
  APPROVAL_FORM_MAX_BYTES, approvalFormFileError, approvalFormStorageName,
  isOwnApprovalFormPath, readApprovalFormUploadResponse,
} from '@/lib/approval-form-upload'

describe('approval form upload responses', () => {
  it.each([413, 401, 502])('handles a non-JSON %s hosting response with an actionable error', async (status) => {
    await expect(readApprovalFormUploadResponse(new Response('<html>Error</html>', { status })))
      .rejects.toThrow(status === 413 ? /100 MB/ : status === 401 ? /Sign in again/ : /try again/)
  })

  it('handles Safari JSON parsing failures without displaying the browser message', async () => {
    const response = { status: 502, ok: false, json: async () => { throw new SyntaxError('The string did not match the expected pattern.') } } as unknown as Response
    await expect(readApprovalFormUploadResponse(response)).rejects.toThrow('Unable to upload the form right now. Please try again.')
  })

  it('preserves a specific API validation error', async () => {
    await expect(readApprovalFormUploadResponse(Response.json({ error: 'Please choose a saved file' }, { status: 400 })))
      .rejects.toThrow('Please choose a saved file')
  })

  it.each([null, [], {}, { url: 123, filename: 'file', complete: true }, { url: 'https://example.com/file', filename: 'file' }])('rejects an incomplete success response %s', async (data) => {
    await expect(readApprovalFormUploadResponse(Response.json(data))).rejects.toThrow('Unable to confirm the upload')
  })

  it('recognizes a followed login redirect', async () => {
    const response = new Response('<html>Login</html>')
    Object.defineProperty(response, 'redirected', { value: true })
    await expect(readApprovalFormUploadResponse(response)).rejects.toThrow('Sign in again')
  })
})

describe('approval form file limits and paths', () => {
  it('accepts files up to 100 MB and rejects empty or larger files', () => {
    expect(approvalFormFileError({ size: APPROVAL_FORM_MAX_BYTES })).toBeNull()
    expect(approvalFormFileError({ size: APPROVAL_FORM_MAX_BYTES + 1 })).toContain('100 MB')
    expect(approvalFormFileError({ size: 0 })).toContain('empty')
  })

  it.each(['../scan.HEIC', 'scan #1 (signed).pdf', 'إقرار.pdf', 'scan.html', '.hidden', 'a'.repeat(260)])('creates an owned storage path for %s', (filename) => {
    const name = approvalFormStorageName(filename)
    expect(isOwnApprovalFormPath(`mentor-approval-forms/student-1/12345678-1234-1234-1234-123456789abc/${name}`, 'student-1')).toBe(true)
  })
})
