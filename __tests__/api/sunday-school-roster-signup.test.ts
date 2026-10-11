import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashRosterLinkToken } from '@/lib/sunday-school-roster-link-token'

const mocks = vi.hoisted(() => ({
  findLink: vi.fn(),
  findChild: vi.fn(),
  transaction: vi.fn(),
  claimUse: vi.fn(),
  createChild: vi.fn(),
  updateChild: vi.fn(),
  enrollChildInClass: vi.fn(),
  recordAuditEvent: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    sundaySchoolRosterLink: { findUnique: mocks.findLink },
    sundaySchoolChild: { findFirst: mocks.findChild },
    $transaction: mocks.transaction,
  },
}))
vi.mock('@/lib/sunday-school-enrollment', () => ({
  enrollChildInClass: mocks.enrollChildInClass,
}))
vi.mock('@/lib/audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }))

import { GET, POST } from '@/app/api/public/roster-signup/route'

// A real, correctly shaped token so the shape guard is exercised rather than bypassed.
const TOKEN = 'Ab3-_cdefghijklmnopqrstuvwxyz0123456789XYZ'

const activeLink = {
  id: 'link-1',
  classId: 'class-1',
  sundaySchoolYearId: 'ss-year-1',
  label: 'Sunday table',
  expiresAt: new Date(Date.now() + 3600_000),
  maxUses: 40,
  useCount: 3,
  revokedAt: null,
  class: {
    id: 'class-1',
    name: 'Grade 3 Boys',
    level: 'GRADE_3',
    status: 'ACTIVE',
    isActive: true,
  },
}

function signupRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/public/roster-signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return { token: TOKEN, firstName: 'Mina', lastName: 'Botros', ...overrides }
}

const transactionClient = {
  sundaySchoolRosterLink: { updateMany: mocks.claimUse },
  sundaySchoolChild: { create: mocks.createChild, update: mocks.updateChild },
}

describe('public roster sign-up API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findLink.mockResolvedValue(activeLink)
    mocks.findChild.mockResolvedValue(null)
    mocks.claimUse.mockResolvedValue({ count: 1 })
    mocks.createChild.mockResolvedValue({ id: 'child-new' })
    mocks.updateChild.mockResolvedValue({ id: 'child-existing' })
    mocks.enrollChildInClass.mockResolvedValue({ enrollmentId: 'enrollment-1' })
    mocks.transaction.mockImplementation(async callback => callback(transactionClient))
  })

  describe('token handling', () => {
    it('looks the link up by hash, never by the plaintext token', async () => {
      await POST(signupRequest(validBody()))

      expect(mocks.findLink).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: hashRosterLinkToken(TOKEN) } })
      )
      const call = JSON.stringify(mocks.findLink.mock.calls[0])
      expect(call).not.toContain(TOKEN)
    })

    it('rejects a malformed token without touching the database', async () => {
      const response = await POST(signupRequest(validBody({ token: "' OR 1=1 --" })))

      expect(response.status).toBe(404)
      expect(mocks.findLink).not.toHaveBeenCalled()
      expect(mocks.transaction).not.toHaveBeenCalled()
    })

    it('rejects an unknown token', async () => {
      mocks.findLink.mockResolvedValue(null)

      const response = await POST(signupRequest(validBody()))

      expect(response.status).toBe(404)
      expect(mocks.transaction).not.toHaveBeenCalled()
    })
  })

  describe('link bounds', () => {
    it.each([
      ['revoked', { revokedAt: new Date(Date.now() - 1000) }],
      ['expired', { expiresAt: new Date(Date.now() - 1000) }],
      ['exhausted', { useCount: 40, maxUses: 40 }],
    ])('refuses a %s link and writes nothing', async (_label, overrides) => {
      mocks.findLink.mockResolvedValue({ ...activeLink, ...overrides })

      const response = await POST(signupRequest(validBody()))

      expect(response.status).toBe(410)
      expect(mocks.transaction).not.toHaveBeenCalled()
      expect(mocks.createChild).not.toHaveBeenCalled()
    })

    it('refuses a link whose class has since been archived', async () => {
      mocks.findLink.mockResolvedValue({
        ...activeLink,
        class: { ...activeLink.class, isActive: false, status: 'ARCHIVED' },
      })

      const response = await POST(signupRequest(validBody()))

      expect(response.status).toBe(410)
      expect(mocks.createChild).not.toHaveBeenCalled()
    })

    it('claims a use atomically, re-checking every bound in the update itself', async () => {
      await POST(signupRequest(validBody()))

      expect(mocks.claimUse).toHaveBeenCalledWith({
        where: {
          id: 'link-1',
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
          useCount: { lt: 40 },
        },
        data: { useCount: { increment: 1 } },
      })
    })

    it('saves nothing when the cap was taken by a concurrent sign-up', async () => {
      mocks.claimUse.mockResolvedValue({ count: 0 })

      const response = await POST(signupRequest(validBody()))

      expect(response.status).toBe(410)
      expect(mocks.createChild).not.toHaveBeenCalled()
      expect(mocks.enrollChildInClass).not.toHaveBeenCalled()
    })
  })

  describe('the destination comes from the link, never the request', () => {
    it('ignores a classId, level, and isActive smuggled into the body', async () => {
      const response = await POST(signupRequest(validBody({
        classId: 'someone-elses-class',
        level: 'GRADE_12',
        rosterLinkId: 'other-link',
        userId: 'user-1',
        isActive: false,
        status: 'ARCHIVED',
      })))

      expect(response.status).toBe(201)
      expect(mocks.createChild).toHaveBeenCalledWith({
        data: expect.objectContaining({
          classId: 'class-1',
          level: 'GRADE_3',
          rosterLinkId: 'link-1',
          isActive: true,
          status: 'ACTIVE',
        }),
        select: { id: true },
      })
      expect(mocks.createChild.mock.calls[0][0].data).not.toHaveProperty('userId')
      expect(mocks.enrollChildInClass).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          classId: 'class-1',
          sundaySchoolYearId: 'ss-year-1',
          level: 'GRADE_3',
          movedById: null,
        })
      )
    })

    it('only looks for an existing child inside the link\'s own class', async () => {
      await POST(signupRequest(validBody()))

      expect(mocks.findChild).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ classId: 'class-1' }),
        })
      )
    })
  })

  describe('validation', () => {
    it('requires a first and last name', async () => {
      const response = await POST(signupRequest({ token: TOKEN, firstName: ' ', lastName: '' }))

      expect(response.status).toBe(400)
      expect(mocks.transaction).not.toHaveBeenCalled()
    })

    it('rejects an invalid guardian email and an impossible birth date', async () => {
      expect((await POST(signupRequest(validBody({ guardianEmail: 'nope' })))).status).toBe(400)
      expect((await POST(signupRequest(validBody({ birthDate: '2015-02-30' })))).status).toBe(400)
      expect(mocks.transaction).not.toHaveBeenCalled()
    })

    it('stores a birth date at midnight UTC so the calendar day cannot shift', async () => {
      await POST(signupRequest(validBody({ birthDate: '2015-04-12' })))

      expect(mocks.createChild.mock.calls[0][0].data.birthDate)
        .toEqual(new Date('2015-04-12T00:00:00.000Z'))
    })

    it('stores a valid gender for attendance grouping', async () => {
      await POST(signupRequest(validBody({ gender: 'FEMALE' })))

      expect(mocks.createChild.mock.calls[0][0].data.gender).toBe('FEMALE')
    })
  })

  describe('matching a child already on the roster', () => {
    it('fills blanks without overwriting what a servant already entered', async () => {
      mocks.findChild.mockResolvedValue({
        id: 'child-existing',
        birthDate: new Date('2015-04-12T00:00:00.000Z'),
        guardianName: 'Servant-entered Name',
        guardianPhone: null,
        guardianEmail: null,
        notes: 'Existing note',
      })

      const response = await POST(signupRequest(validBody({
        birthDate: '2010-01-01',
        guardianName: 'Public Submission',
        guardianPhone: '555-0000',
        notes: 'Public note',
      })))

      expect(response.status).toBe(201)
      expect(mocks.createChild).not.toHaveBeenCalled()

      const data = mocks.updateChild.mock.calls[0][0].data
      expect(data).not.toHaveProperty('birthDate')
      expect(data).not.toHaveProperty('guardianName')
      expect(data).not.toHaveProperty('notes')
      expect(data.guardianPhone).toBe('555-0000')
    })
  })

  describe('what the response reveals', () => {
    it('returns only the submitter\'s own name and the class', async () => {
      const response = await POST(signupRequest(validBody()))
      const body = await response.json()

      expect(body).toEqual({
        success: true,
        firstName: 'Mina',
        className: 'Grade 3 Boys',
        needsServantReview: false,
      })
    })

    it('flags a grade conflict for a servant instead of failing silently', async () => {
      mocks.enrollChildInClass.mockResolvedValue(null)

      const body = await (await POST(signupRequest(validBody()))).json()

      expect(body.needsServantReview).toBe(true)
      expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ result: 'FAILED' })
      )
    })

    it('GET exposes the class and nothing about its roster', async () => {
      const response = await GET(
        new NextRequest(`http://localhost/api/public/roster-signup?token=${TOKEN}`)
      )
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(Object.keys(body).sort()).toEqual(
        ['className', 'expiresAt', 'label', 'levelLabel', 'remainingUses'].sort()
      )
      expect(body.className).toBe('Grade 3 Boys')
      expect(body.remainingUses).toBe(37)
    })

    it('GET refuses an expired link', async () => {
      mocks.findLink.mockResolvedValue({ ...activeLink, expiresAt: new Date(Date.now() - 1000) })

      const response = await GET(
        new NextRequest(`http://localhost/api/public/roster-signup?token=${TOKEN}`)
      )

      expect(response.status).toBe(410)
    })
  })

  it('records an audit event naming the link that let the child in', async () => {
    await POST(signupRequest(validBody()))

    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SUNDAY_SCHOOL_ROSTER_LINK_SIGNUP',
        entityType: 'SundaySchoolChild',
        entityId: 'child-new',
        result: 'SUCCESS',
        metadata: expect.objectContaining({ rosterLinkId: 'link-1', classId: 'class-1' }),
      })
    )
  })
})
