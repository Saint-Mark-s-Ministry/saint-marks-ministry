// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getSundaySchoolAccess: vi.fn(),
  loadChildForUser: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/sunday-school-access', () => ({ getSundaySchoolAccess: mocks.getSundaySchoolAccess }))
vi.mock('@/lib/sunday-school-child-access', () => ({ loadChildForUser: mocks.loadChildForUser }))
vi.mock('@/lib/prisma', () => ({ prisma: { sundaySchoolChild: { findUnique: mocks.findUnique, update: mocks.update } } }))
vi.mock('@vercel/blob', () => ({ put: mocks.put, del: mocks.del }))

import { DELETE, POST } from '@/app/api/sunday-school/children/[id]/photo/route'

const params = { params: Promise.resolve({ id: 'child-1' }) }
const upload = (file?: File) => {
  const body = new FormData()
  if (file) body.append('file', file)
  return new Request('http://localhost/api/sunday-school/children/child-1/photo', { method: 'POST', body })
}
const jpeg = (bytes = 10) => new File([new Uint8Array(bytes)], 'photo.jpg', { type: 'image/jpeg' })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAuth.mockResolvedValue({ id: 'servant-1', role: 'SERVANT' })
  mocks.getSundaySchoolAccess.mockResolvedValue({ isAdmin: false })
  mocks.loadChildForUser.mockResolvedValue({ id: 'child-1', classId: 'class-1' })
  mocks.findUnique.mockResolvedValue({ photoUrl: 'https://blob.example/old.jpg' })
  mocks.put.mockResolvedValue({ url: 'https://blob.example/new.jpg' })
  mocks.update.mockImplementation(async ({ data }) => ({ id: 'child-1', ...data }))
  mocks.del.mockResolvedValue(undefined)
})

describe('child photo route', () => {
  it('checks write access to the child, saves the photo and removes the old one', async () => {
    const res = await POST(upload(jpeg()), params)
    expect(res.status).toBe(200)
    expect(mocks.loadChildForUser).toHaveBeenCalledWith('child-1', { isAdmin: false }, true)
    expect(mocks.put).toHaveBeenCalledWith(expect.stringMatching(/^sunday-school-children\/child-1\./), expect.any(File), expect.objectContaining({ addRandomSuffix: true }))
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { photoUrl: 'https://blob.example/new.jpg' } }))
    expect(mocks.del).toHaveBeenCalledWith('https://blob.example/old.jpg', expect.anything())
    expect(await res.json()).toEqual({ id: 'child-1', photoUrl: 'https://blob.example/new.jpg' })
  })

  it('refuses servants outside the child\'s class', async () => {
    mocks.loadChildForUser.mockRejectedValue(new Error('Forbidden'))
    const res = await POST(upload(jpeg()), params)
    expect(res.status).toBe(403)
    expect(mocks.put).not.toHaveBeenCalled()
  })

  it('rejects missing, non-image and oversized files', async () => {
    expect((await POST(upload(), params)).status).toBe(400)
    expect((await POST(upload(new File(['x'], 'a.pdf', { type: 'application/pdf' })), params)).status).toBe(400)
    expect((await POST(upload(jpeg(4 * 1024 * 1024 + 1)), params)).status).toBe(400)
    expect(mocks.put).not.toHaveBeenCalled()
  })

  it('removes a photo', async () => {
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), params)
    expect(res.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'child-1' }, data: { photoUrl: null } })
    expect(mocks.del).toHaveBeenCalledWith('https://blob.example/old.jpg', expect.anything())
  })
})
