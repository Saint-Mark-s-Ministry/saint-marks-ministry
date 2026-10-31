import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getSundaySchoolAccess: vi.fn(),
  canReviewChildRegistrationAtLevel: vi.fn(),
  canCoordinateClass: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  notifyChildRegistrationReviewed: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: mocks.getSundaySchoolAccess,
  canReviewChildRegistrationAtLevel: mocks.canReviewChildRegistrationAtLevel,
  canCoordinateClass: mocks.canCoordinateClass,
}))
vi.mock('@/lib/notifications', () => ({
  notifyChildRegistrationReviewed: mocks.notifyChildRegistrationReviewed,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    childRegistrationRequest: { findUnique: mocks.findUnique, update: mocks.update },
  },
}))

import { POST } from '@/app/api/sunday-school/child-registrations/[id]/review/route'

const pendingRequest = {
  id: 'req-1',
  status: 'PENDING',
  firstName: 'Anna',
  lastName: 'Youssef',
  intendedLevel: 'ELEMENTARY',
  submittedByUserId: 'parent-1',
}

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/sunday-school/child-registrations/req-1/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as unknown as NextRequest,
    { params: Promise.resolve({ id: 'req-1' }) }
  )
}

describe('POST .../child-registrations/[id]/review — request_changes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'coordinator-1', role: 'SERVANT' })
    mocks.getSundaySchoolAccess.mockResolvedValue({ isAdmin: false, coordinatorLevels: new Set(['ELEMENTARY']) })
    mocks.canReviewChildRegistrationAtLevel.mockReturnValue(true)
    mocks.findUnique.mockResolvedValue(pendingRequest)
    mocks.update.mockResolvedValue({ ...pendingRequest, status: 'CHANGES_REQUESTED', reviewNote: 'Need a clearer photo of the baptism certificate' })
    mocks.notifyChildRegistrationReviewed.mockResolvedValue(undefined)
  })

  it('requires a note', async () => {
    const response = await post({ action: 'request_changes' })
    expect(response.status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('moves a pending request to CHANGES_REQUESTED and notifies the submitter', async () => {
    const response = await post({ action: 'request_changes', note: 'Need a clearer photo of the baptism certificate' })

    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'req-1' },
      data: expect.objectContaining({
        status: 'CHANGES_REQUESTED',
        reviewedBy: 'coordinator-1',
        reviewNote: 'Need a clearer photo of the baptism certificate',
      }),
    })
    expect(mocks.notifyChildRegistrationReviewed).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CHANGES_REQUESTED', userId: 'parent-1' })
    )
  })

  it('also allows reviewing a request that already has changes requested (no in-app resubmission yet)', async () => {
    mocks.findUnique.mockResolvedValue({ ...pendingRequest, status: 'CHANGES_REQUESTED' })
    const response = await post({ action: 'reject', note: 'Unable to confirm identity' })
    expect(response.status).toBe(200)
  })

  it('refuses a request that is already approved', async () => {
    mocks.findUnique.mockResolvedValue({ ...pendingRequest, status: 'APPROVED' })
    const response = await post({ action: 'request_changes', note: 'anything' })
    expect(response.status).toBe(400)
  })
})
