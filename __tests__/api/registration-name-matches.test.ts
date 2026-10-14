import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { UserRole } from '@prisma/client'

const mocks = vi.hoisted(() => ({ session: vi.fn(), submissions: vi.fn(), submission: vi.fn(), count: vi.fn(), users: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  registrationSubmission: { findMany: mocks.submissions, findUnique: mocks.submission, count: mocks.count },
  user: { findMany: mocks.users },
} }))
vi.mock('@vercel/blob', () => ({ del: vi.fn() }))

import { GET as list } from '@/app/api/registration/submissions/route'
import { GET as detail } from '@/app/api/registration/submissions/[id]/route'
import { withRegistrationNameMatches } from '@/lib/registration-name-matches'

const applicant = { id: 'application', fullName: 'Same Exact Name', createdUserId: null }
const match = { id: 'existing', name: 'Same Exact Name', email: 'existing@example.com', isDisabled: true }
const request = () => new NextRequest('http://localhost/api/registration/submissions')
const params = { params: Promise.resolve({ id: 'application' }) }

describe('registration exact-name warnings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.mockResolvedValue({ user: { role: UserRole.SERVANT_PREP } })
    mocks.submissions.mockResolvedValue([applicant])
    mocks.submission.mockResolvedValue(applicant)
    mocks.count.mockResolvedValue(1)
    mocks.users.mockResolvedValue([match])
  })
  it('adds live matching accounts to the list and detail for reviewers', async () => {
    expect((await (await list(request())).json()).submissions[0].exactNameMatches).toEqual([match])
    expect((await (await detail(request(), params)).json()).exactNameMatches).toEqual([match])
    expect(mocks.users.mock.calls[0][0]).toMatchObject({
      where: { name: { in: ['Same Exact Name'] } },
      select: { id: true, name: true, email: true, isDisabled: true },
    })
  })
  it('does not expose account matches to unauthenticated or student users', async () => {
    mocks.session.mockResolvedValue(null)
    expect((await list(request())).status).toBe(401)
    expect((await detail(request(), params)).status).toBe(401)
    mocks.session.mockResolvedValue({ user: { role: UserRole.STUDENT } })
    expect((await list(request())).status).toBe(403)
    expect((await detail(request(), params)).status).toBe(403)
    expect(mocks.users).not.toHaveBeenCalled()
  })
  it('excludes the linked account but keeps other matches, including disabled accounts', async () => {
    mocks.users.mockResolvedValue([{ ...match, id: 'self' }, match])
    const [result] = await withRegistrationNameMatches([{ ...applicant, createdUserId: 'self' }])
    expect(result.exactNameMatches).toEqual([match])
  })
  it('groups complete names exactly, with no case, whitespace, or partial-name matching', async () => {
    mocks.users.mockResolvedValue([match, { ...match, id: 'lowercase', name: 'same exact name' }])
    const result = await withRegistrationNameMatches([
      applicant,
      { ...applicant, fullName: 'same exact name' },
      { ...applicant, fullName: 'Same Exact' },
      { ...applicant, fullName: 'Same Exact Name ' },
    ])
    expect(result.map(row => row.exactNameMatches.map(user => user.id))).toEqual([['existing'], ['lowercase'], [], []])
    expect(mocks.users).toHaveBeenCalledOnce()
  })
  it('does not query users for an empty page or a missing detail', async () => {
    expect(await withRegistrationNameMatches([])).toEqual([])
    mocks.submission.mockResolvedValue(null)
    expect((await detail(request(), params)).status).toBe(404)
    expect(mocks.users).not.toHaveBeenCalled()
  })
})
