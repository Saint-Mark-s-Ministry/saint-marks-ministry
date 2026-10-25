import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), application: vi.fn(), requirement: vi.fn(), put: vi.fn(),
  updateRegistration: vi.fn(), updateEnrollment: vi.fn(), clear: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/annual-mentor-information', () => ({ getAnnualMentorRequirement: mocks.requirement }))
vi.mock('@vercel/blob', () => ({ put: mocks.put }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  registrationSubmission: { findFirst: mocks.application },
  $transaction: async (callback: (tx: unknown) => unknown) => callback({
    registrationSubmission: { update: mocks.updateRegistration },
    studentEnrollment: { update: mocks.updateEnrollment },
    notification: { deleteMany: mocks.clear },
  }),
} }))
import { POST } from '@/app/api/registration/application/upload/route'

function upload(type = 'application/pdf') {
  return POST({ formData: async () => ({ get: () => new File(['signed form'], 'approval.pdf', { type }) }) } as unknown as NextRequest)
}

describe('approval form upload for legacy Year 2 students', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ id: 'student-1' })
    mocks.application.mockResolvedValue(null)
    mocks.requirement.mockResolvedValue({ information: { reviewedAt: null } })
    mocks.put.mockResolvedValue({ url: 'https://example.com/form.pdf' })
  })

  it('stores a form on the enrollment when no registration exists, without clearing pending review', async () => {
    const response = await upload()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ complete: false })
    expect(mocks.updateEnrollment).toHaveBeenCalledWith({
      where: { studentId: 'student-1' },
      data: { approvalFormUrl: 'https://example.com/form.pdf', approvalFormFilename: 'approval.pdf' },
    })
    expect(mocks.updateRegistration).not.toHaveBeenCalled()
    expect(mocks.clear).not.toHaveBeenCalled()
  })

  it('reports completion once mentor information has been reviewed', async () => {
    mocks.requirement.mockResolvedValue({ information: { reviewedAt: new Date() } })
    expect(await (await upload()).json()).toMatchObject({ complete: true })
    expect(mocks.clear).toHaveBeenCalledOnce()
  })

  it('rejects unsupported uploads before writing storage or database records', async () => {
    expect((await upload('text/html')).status).toBe(400)
    expect(mocks.put).not.toHaveBeenCalled()
    expect(mocks.updateEnrollment).not.toHaveBeenCalled()
  })

  it('does not allow accounts without an approved application or active Year 2 enrollment', async () => {
    mocks.requirement.mockResolvedValue(null)
    expect((await upload()).status).toBe(404)
    expect(mocks.put).not.toHaveBeenCalled()
  })
})
