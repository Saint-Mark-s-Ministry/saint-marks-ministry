import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ account: vi.fn(), sundaySchool: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.account } } }))
vi.mock('@/lib/sunday-school-access', () => ({ getSundaySchoolAccess: mocks.sundaySchool }))
import { getFeedbackAccess } from '@/lib/feedback-access'

const noSundaySchool = {
  canRead: false, isAdmin: false, readOnly: false,
  servantClassIds: new Set(), coordinatorClassIds: new Set(), coordinatorAgeGroupIds: new Set(),
  coordinatorLevels: new Set(), visibleClassIds: new Set(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.sundaySchool.mockResolvedValue(noSundaySchool)
})

describe('shared feedback access', () => {
  it('grants prep staff feedback participation without granting class or moderation access', async () => {
    mocks.account.mockResolvedValue({ id: 'user', role: 'SERVANT_PREP', isDisabled: false })
    const access = await getFeedbackAccess({ id: 'user' })
    expect(access).toEqual({ ...noSundaySchool, canRead: true })
    expect(noSundaySchool.canRead).toBe(false)
  })

  it.each(['MENTOR', 'STUDENT', 'PARENT', 'SERVANT'])(
    'denies a %s without Sunday School access', async role => {
      mocks.account.mockResolvedValue({ id: 'user', role, isDisabled: false })
      expect((await getFeedbackAccess({ id: 'user' })).canRead).toBe(false)
    },
  )

  it('uses the current database role rather than a stale session role', async () => {
    mocks.account.mockResolvedValue({ id: 'user', role: 'STUDENT', isDisabled: false })
    const sessionUser = { id: 'user', role: 'SERVANT_PREP' }
    expect((await getFeedbackAccess(sessionUser)).canRead).toBe(false)
    expect(mocks.sundaySchool).toHaveBeenCalledWith({ id: 'user', role: 'STUDENT', isDisabled: false })
  })

  it('preserves existing Sunday School feedback participation', async () => {
    mocks.account.mockResolvedValue({ id: 'user', role: 'SERVANT', isDisabled: false })
    mocks.sundaySchool.mockResolvedValue({ ...noSundaySchool, canRead: true })
    expect((await getFeedbackAccess({ id: 'user' })).canRead).toBe(true)
  })

  it.each([null, { id: 'user', role: 'SERVANT_PREP', isDisabled: true }])('denies missing or disabled accounts', async account => {
    mocks.account.mockResolvedValue(account)
    await expect(getFeedbackAccess({ id: 'user' })).rejects.toThrow('Forbidden')
    expect(mocks.sundaySchool).not.toHaveBeenCalled()
  })
})
