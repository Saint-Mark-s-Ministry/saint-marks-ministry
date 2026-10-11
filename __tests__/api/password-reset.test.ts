import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  updateMany: vi.fn(),
  hash: vi.fn(),
  recordAuditEvent: vi.fn(),
  emailPasswordReset: vi.fn(),
  emailPasswordChanged: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: mocks.findUnique, findUniqueOrThrow: mocks.findUniqueOrThrow, updateMany: mocks.updateMany } },
}))
vi.mock('bcryptjs', () => ({ default: { hash: mocks.hash } }))
vi.mock('@/lib/audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }))
vi.mock('@/lib/mail/notify', () => ({
  emailPasswordReset: mocks.emailPasswordReset,
  emailPasswordChanged: mocks.emailPasswordChanged,
}))

import { POST as FORGOT } from '@/app/api/auth/forgot-password/route'
import { POST as RESET } from '@/app/api/auth/reset-password/route'
import { createPasswordToken } from '@/lib/password-reset'

process.env.NEXTAUTH_SECRET ||= 'test-secret'

let ip = 0
const post = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    // A fresh client per request keeps the per-IP limiter out of unrelated tests.
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.0.0.${++ip}` },
    body: JSON.stringify(body),
  })

const account = { id: 'user-1', email: 'user@example.com', name: 'User One', authVersion: 4, isDisabled: false }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findUnique.mockResolvedValue(account)
  mocks.findUniqueOrThrow.mockResolvedValue({ email: account.email, name: account.name })
  mocks.updateMany.mockResolvedValue({ count: 1 })
  mocks.hash.mockResolvedValue('new-hash')
})

describe('POST /api/auth/forgot-password', () => {
  it('emails an existing account and answers generically', async () => {
    const response = await FORGOT(post('/api/auth/forgot-password', { email: ' User@Example.com ' }))
    expect(response.status).toBe(200)
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'user@example.com' } }))
    expect(mocks.emailPasswordReset).toHaveBeenCalledWith(account)
  })

  it('gives the same answer for unknown and disabled accounts without emailing', async () => {
    const known = await (await FORGOT(post('/api/auth/forgot-password', { email: 'a@example.com' }))).json()
    mocks.emailPasswordReset.mockClear()

    mocks.findUnique.mockResolvedValue(null)
    const unknown = await FORGOT(post('/api/auth/forgot-password', { email: 'nobody@example.com' }))
    mocks.findUnique.mockResolvedValue({ ...account, isDisabled: true })
    const disabled = await FORGOT(post('/api/auth/forgot-password', { email: 'disabled@example.com' }))

    expect(await unknown.json()).toEqual(known)
    expect(await disabled.json()).toEqual(known)
    expect(mocks.emailPasswordReset).not.toHaveBeenCalled()
  })

  it('rate-limits repeated requests for one address', async () => {
    const statuses = []
    for (let i = 0; i < 4; i++) statuses.push((await FORGOT(post('/api/auth/forgot-password', { email: 'limited@example.com' }))).status)
    expect(statuses).toEqual([200, 200, 200, 429])
  })

  it('requires an email', async () => {
    expect((await FORGOT(post('/api/auth/forgot-password', {}))).status).toBe(400)
  })
})

describe('POST /api/auth/reset-password', () => {
  it('sets the password only while the link matches the current authVersion', async () => {
    const token = createPasswordToken(account, 'reset')
    const response = await RESET(post('/api/auth/reset-password', { token, password: 'a-new-password' }))

    expect(response.status).toBe(200)
    expect(mocks.hash).toHaveBeenCalledWith('a-new-password', 10)
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', authVersion: 4, isDisabled: false },
      data: { password: 'new-hash', mustChangePassword: false },
    })
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_PASSWORD_RESET', result: 'SUCCESS' }))
    expect(mocks.emailPasswordChanged).toHaveBeenCalledWith({ email: account.email, name: account.name })
  })

  it('rejects a used or superseded link', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 })
    const token = createPasswordToken(account, 'reset')
    const response = await RESET(post('/api/auth/reset-password', { token, password: 'a-new-password' }))
    expect(response.status).toBe(400)
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled()
    expect(mocks.emailPasswordChanged).not.toHaveBeenCalled()
  })

  it('rejects tampered tokens and short passwords before touching the database', async () => {
    const token = createPasswordToken(account, 'reset')
    expect((await RESET(post('/api/auth/reset-password', { token: `${token}x`, password: 'a-new-password' }))).status).toBe(400)
    expect((await RESET(post('/api/auth/reset-password', { token, password: 'short' }))).status).toBe(400)
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })

  it('does not send a password-changed warning for a first-time setup link', async () => {
    const token = createPasswordToken(account, 'setup')
    expect((await RESET(post('/api/auth/reset-password', { token, password: 'a-new-password' }))).status).toBe(200)
    expect(mocks.emailPasswordChanged).not.toHaveBeenCalled()
  })
})
