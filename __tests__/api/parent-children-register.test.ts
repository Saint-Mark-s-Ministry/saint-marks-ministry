import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  childCreate: vi.fn(),
  requestFindFirst: vi.fn(),
  guardianFindFirst: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/notifications', () => ({ notifyChildRegistrationSubmitted: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/email', () => ({ normalizeOptionalEmail: (value: string | null) => value ?? null }))
vi.mock('@/lib/sunday-school-class', () => ({ isValidLevel: () => true }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    childRegistrationRequest: { create: mocks.childCreate, findFirst: mocks.requestFindFirst },
    sundaySchoolChildGuardian: { findFirst: mocks.guardianFindFirst },
  },
}))

import { POST } from '@/app/api/parent/children/register/route'
import { GET as duplicateCheck } from '@/app/api/parent/children/duplicate-check/route'

const parent = { id: 'parent-1', name: 'Mary Parent', email: 'mary@example.com', role: 'PARENT' }
const body = (over: Record<string, unknown> = {}) => ({
  firstName: 'Anna',
  lastName: 'Lee',
  birthDate: '2019-02-03',
  intendedLevel: 'GRADE_2',
  guardianPhone: '(555) 123-4567',
  ...over,
})
const post = (payload: Record<string, unknown>) =>
  POST(new NextRequest('http://localhost/api/parent/children/register', { method: 'POST', body: JSON.stringify(payload) }))

describe('POST /api/parent/children/register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireRole.mockResolvedValue(parent)
    mocks.guardianFindFirst.mockResolvedValue(null)
    mocks.requestFindFirst.mockResolvedValue(null)
    mocks.childCreate.mockResolvedValue({ id: 'req-1' })
  })

  it('refuses a date that does not exist, and stores nothing', async () => {
    const response = await post(body({ birthDate: '2019-02-31' }))

    expect(response.status).toBe(400)
    expect(mocks.childCreate).not.toHaveBeenCalled()
  })

  it('refuses a phone number that cannot be normalized', async () => {
    const response = await post(body({ guardianPhone: '555-CALL-ME' }))

    expect(response.status).toBe(400)
    expect(mocks.childCreate).not.toHaveBeenCalled()
  })

  it('refuses a child the parent already has, without creating a second request', async () => {
    mocks.guardianFindFirst.mockResolvedValue({ id: 'link-1' })

    const response = await post(body())
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json.code).toBe('DUPLICATE_CHILD')
    expect(mocks.childCreate).not.toHaveBeenCalled()
  })

  it('stores the normalized phone and the parent as submitter', async () => {
    const response = await post(body())

    expect(response.status).toBe(201)
    const data = mocks.childCreate.mock.calls[0][0].data
    expect(data.guardianPhone).toBe('5551234567')
    expect(data.submittedByUserId).toBe('parent-1')
    expect(data.birthDate.toISOString()).toBe('2019-02-03T00:00:00.000Z')
    // The duplicate check only looks at this parent's own records.
    expect(mocks.guardianFindFirst.mock.calls[0][0].where.parentId).toBe('parent-1')
  })
})

describe('GET /api/parent/children/duplicate-check', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireRole.mockResolvedValue(parent)
    mocks.guardianFindFirst.mockResolvedValue(null)
    mocks.requestFindFirst.mockResolvedValue(null)
  })

  it('reports a pending request for this parent without revealing any record', async () => {
    mocks.requestFindFirst.mockResolvedValue({ id: 'req-9' })

    const response = await duplicateCheck(
      new NextRequest('http://localhost/api/parent/children/duplicate-check?firstName=anna&lastName=LEE&birthDate=2019-02-03'),
    )

    expect(await response.json()).toEqual({ duplicate: 'pending' })
    expect(mocks.requestFindFirst.mock.calls[0][0].where.submittedByUserId).toBe('parent-1')
  })

  it('needs a real calendar date', async () => {
    const response = await duplicateCheck(
      new NextRequest('http://localhost/api/parent/children/duplicate-check?firstName=Anna&lastName=Lee&birthDate=2019-02-31'),
    )

    expect(response.status).toBe(400)
  })
})
