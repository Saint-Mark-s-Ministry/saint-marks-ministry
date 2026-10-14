import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn(),
}))

import { getToken } from 'next-auth/jwt'
import { proxy } from '@/proxy'

const mockGetToken = vi.mocked(getToken)

function makeRequest(pathname: string, method = 'GET') {
  return new NextRequest(`https://example.test${pathname}`, { method })
}

describe('proxy View as write barrier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows read requests while View as mode is active', async () => {
    mockGetToken.mockResolvedValue({ originalId: 'admin-1' } as never)

    const response = await proxy(makeRequest('/api/students/student-1/details'))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('blocks writes while View as mode is active', async () => {
    mockGetToken.mockResolvedValue({ originalId: 'admin-1' } as never)

    const response = await proxy(makeRequest('/api/attendance', 'POST'))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: 'ViewAsReadOnly' })
  })

  it('allows the session update used to switch or stop View as mode', async () => {
    mockGetToken.mockResolvedValue({ originalId: 'admin-1' } as never)

    const response = await proxy(makeRequest('/api/auth/session', 'POST'))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('allows sign-out while View as mode is active', async () => {
    mockGetToken.mockResolvedValue({ originalId: 'admin-1' } as never)

    const response = await proxy(makeRequest('/api/auth/signout', 'POST'))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('does not block normal authenticated writes', async () => {
    mockGetToken.mockResolvedValue({ id: 'admin-1' } as never)

    const response = await proxy(makeRequest('/api/attendance', 'POST'))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })
})

describe('public help during required password changes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetToken.mockResolvedValue({ id: 'user-1', mustChangePassword: true } as never)
  })

  it.each(['/app', '/support', '/privacy', '/terms'])('keeps %s accessible', async (path) => {
    const response = await proxy(makeRequest(path))

    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.get('location')).toBeNull()
  })

  it.each(['/application', '/supporting', '/dashboard'])('still gates %s', async (path) => {
    const response = await proxy(makeRequest(path))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://example.test/change-password')
  })

  it('continues blocking protected API requests', async () => {
    const response = await proxy(makeRequest('/api/users'))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: 'PasswordChangeRequired' })
  })
})
