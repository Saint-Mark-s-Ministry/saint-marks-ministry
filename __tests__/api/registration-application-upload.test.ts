import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), application: vi.fn(), requirement: vi.fn(), put: vi.fn(), head: vi.fn(), token: vi.fn(),
  updateRegistration: vi.fn(), updateEnrollment: vi.fn(), clear: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/annual-mentor-information', () => ({ getAnnualMentorRequirement: mocks.requirement }))
vi.mock('@vercel/blob', () => ({ put: mocks.put, head: mocks.head }))
vi.mock('@vercel/blob/client', () => ({ generateClientTokenFromReadWriteToken: mocks.token }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  registrationSubmission: { findFirst: mocks.application },
  $transaction: async (callback: (tx: unknown) => unknown) => callback({
    registrationSubmission: { update: mocks.updateRegistration },
    studentEnrollment: { update: mocks.updateEnrollment },
    notification: { deleteMany: mocks.clear },
  }),
} }))
import { POST } from '@/app/api/registration/application/upload/route'
import { APPROVAL_FORM_MAX_BYTES, APPROVAL_FORM_CONTENT_TYPE } from '@/lib/approval-form-upload'

function upload(type = 'application/pdf') {
  return POST({ headers: new Headers(), formData: async () => ({ get: () => new File(['signed form'], 'approval.pdf', { type }) }) } as unknown as NextRequest)
}

const path = 'mentor-approval-forms/student-1/12345678-1234-1234-1234-123456789abc/approval.HEIC'
function jsonUpload(data: unknown) {
  return POST(new Request('https://example.com/api/registration/application/upload', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }) as NextRequest)
}

describe('approval form upload for legacy Year 2 students', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ id: 'student-1' })
    mocks.application.mockResolvedValue(null)
    mocks.requirement.mockResolvedValue({ information: { reviewedAt: null } })
    mocks.put.mockResolvedValue({ url: 'https://example.com/form.pdf', downloadUrl: 'https://example.com/form.pdf?download=1' })
    mocks.token.mockResolvedValue('scoped-client-token')
    mocks.head.mockResolvedValue({ pathname: path, url: 'https://example.com/form.HEIC', downloadUrl: 'https://example.com/form.HEIC?download=1', size: 8000000, contentType: APPROVAL_FORM_CONTENT_TYPE })
  })

  it('stores a form on the enrollment when no registration exists, without clearing pending review', async () => {
    const response = await upload()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ complete: false })
    expect(mocks.updateEnrollment).toHaveBeenCalledWith({
      where: { studentId: 'student-1' },
      data: { approvalFormUrl: 'https://example.com/form.pdf?download=1', approvalFormFilename: 'approval.pdf' },
    })
    expect(mocks.updateRegistration).not.toHaveBeenCalled()
    expect(mocks.clear).not.toHaveBeenCalled()
  })

  it('reports completion once mentor information has been reviewed', async () => {
    mocks.requirement.mockResolvedValue({ information: { reviewedAt: new Date() } })
    expect(await (await upload()).json()).toMatchObject({ complete: true })
    expect(mocks.clear).toHaveBeenCalledOnce()
  })

  it('stores arbitrary file formats as downloads rather than executable content', async () => {
    expect((await upload('text/html')).status).toBe(200)
    expect(mocks.put).toHaveBeenCalledWith(expect.any(String), expect.any(File), expect.objectContaining({ contentType: APPROVAL_FORM_CONTENT_TYPE }))
  })

  it('does not allow accounts without an approved application or active Year 2 enrollment', async () => {
    mocks.requirement.mockResolvedValue(null)
    expect((await upload()).status).toBe(404)
    expect(mocks.put).not.toHaveBeenCalled()
  })
})


describe('direct approval form uploads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ id: 'student-1' })
    mocks.application.mockResolvedValue(null)
    mocks.requirement.mockResolvedValue({ enrollment: { status: 'WITHDRAWN' }, information: { reviewedAt: null } })
    mocks.token.mockResolvedValue('scoped-client-token')
    mocks.head.mockResolvedValue({ pathname: path, downloadUrl: 'https://example.com/form.HEIC?download=1', size: 8000000, contentType: APPROVAL_FORM_CONTENT_TYPE })
  })

  it('issues a constrained token for a large iPhone file without replacing the existing form', async () => {
    const response = await jsonUpload({ action: 'prepare', filename: 'approval.HEIC', size: 8000000 })
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toEqual({ pathname: expect.stringMatching(/^mentor-approval-forms\/student-1\/[a-f0-9-]+\/approval.HEIC$/), clientToken: 'scoped-client-token' })
    expect(mocks.token).toHaveBeenCalledWith(expect.objectContaining({
      pathname: data.pathname, allowedContentTypes: [APPROVAL_FORM_CONTENT_TYPE],
      maximumSizeInBytes: APPROVAL_FORM_MAX_BYTES, allowOverwrite: false, validUntil: expect.any(Number),
    }))
    expect(mocks.updateEnrollment).not.toHaveBeenCalled()
    expect(mocks.head).not.toHaveBeenCalled()
  })

  it.each(['scan.HEIC', 'scan.HEIF', 'scan.webp', 'scan.docx', 'scan', 'scan.html'])('accepts %s without a MIME allowlist', async (filename) => {
    expect((await jsonUpload({ action: 'prepare', filename, size: 5000 })).status).toBe(200)
  })

  it('verifies the stored blob and updates a withdrawn legacy enrollment without approving it', async () => {
    const response = await jsonUpload({ action: 'complete', filename: 'approval.HEIC', pathname: path, url: 'https://untrusted.example/file' })
    expect(response.status).toBe(200)
    expect(mocks.head).toHaveBeenCalledWith(path, expect.any(Object))
    expect(await response.json()).toEqual({ url: 'https://example.com/form.HEIC?download=1', filename: 'approval.HEIC', complete: false })
    expect(mocks.updateEnrollment).toHaveBeenCalledWith({ where: { studentId: 'student-1' }, data: { approvalFormUrl: 'https://example.com/form.HEIC?download=1', approvalFormFilename: 'approval.HEIC' } })
    expect(mocks.clear).not.toHaveBeenCalled()
  })

  it('updates an approved registration when one exists', async () => {
    mocks.application.mockResolvedValue({ id: 'registration-1', fatherOfConfessionName: 'Father', mentorName: 'Mentor', mentorPhone: '555', mentorEmail: 'mentor@example.com' })
    mocks.requirement.mockResolvedValue(null)
    const response = await jsonUpload({ action: 'complete', filename: 'approval.HEIC', pathname: path })
    expect(await response.json()).toMatchObject({ complete: true })
    expect(mocks.updateRegistration).toHaveBeenCalledWith({ where: { id: 'registration-1' }, data: { approvalFormUrl: 'https://example.com/form.HEIC?download=1', approvalFormFilename: 'approval.HEIC' } })
    expect(mocks.updateEnrollment).not.toHaveBeenCalled()
    expect(mocks.clear).toHaveBeenCalledOnce()
  })

  it.each([path.replace('student-1/', 'student-2/'), path.replace('/approval.HEIC', '/../approval.HEIC'), 'https://untrusted.example/file', path.replace('approval.HEIC', 'another.HEIC')])('rejects unowned or invalid reference %s before storage access', async (pathname) => {
    expect((await jsonUpload({ action: 'complete', filename: 'approval.HEIC', pathname })).status).toBe(400)
    expect(mocks.head).not.toHaveBeenCalled()
    expect(mocks.updateEnrollment).not.toHaveBeenCalled()
  })

  it.each([0, -1, 1.5, APPROVAL_FORM_MAX_BYTES + 1, '123'])('rejects invalid size %s before issuing a token', async (size) => {
    expect((await jsonUpload({ action: 'prepare', filename: 'approval.HEIC', size })).status).toBe(400)
    expect(mocks.token).not.toHaveBeenCalled()
  })

  it.each([{ contentType: 'text/html' }, { size: 0 }, { size: APPROVAL_FORM_MAX_BYTES + 1 }, { pathname: path.replace('student-1/', 'student-2/') }])('rejects invalid storage metadata %s without replacing the form', async (metadata) => {
    mocks.head.mockResolvedValue({ pathname: path, size: 100, contentType: APPROVAL_FORM_CONTENT_TYPE, ...metadata })
    expect((await jsonUpload({ action: 'complete', filename: 'approval.HEIC', pathname: path })).status).toBe(400)
    expect(mocks.updateEnrollment).not.toHaveBeenCalled()
  })

  it('preserves the saved form when storage verification fails', async () => {
    mocks.head.mockRejectedValue(new Error('Blob not found'))
    expect((await jsonUpload({ action: 'complete', filename: 'approval.HEIC', pathname: path })).status).toBe(500)
    expect(mocks.updateEnrollment).not.toHaveBeenCalled()
    expect(mocks.clear).not.toHaveBeenCalled()
  })

  it.each(['prepare', 'complete'])('rechecks eligibility at %s', async (action) => {
    mocks.requirement.mockResolvedValue(null)
    expect((await jsonUpload({ action, filename: 'approval.HEIC', pathname: path, size: 5000 })).status).toBe(404)
    expect(mocks.token).not.toHaveBeenCalled()
    expect(mocks.head).not.toHaveBeenCalled()
    expect(mocks.updateEnrollment).not.toHaveBeenCalled()
  })

  it('requires authentication before issuing a token', async () => {
    mocks.auth.mockRejectedValue(new Error('Unauthorized'))
    expect((await jsonUpload({ action: 'prepare', filename: 'approval.HEIC', size: 100 })).status).toBe(401)
    expect(mocks.token).not.toHaveBeenCalled()
  })
})
