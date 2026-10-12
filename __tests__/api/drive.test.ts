import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ session: vi.fn(), files: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/drive', () => ({ getDriveFiles: mocks.files }))

import { GET } from '@/app/api/drive/route'

const request = (query: string) => new NextRequest(`http://localhost/api/drive?${query}`)

describe('GET /api/drive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.mockResolvedValue({ user: { id: 'u1' } })
    mocks.files.mockResolvedValue([])
  })

  it('requires a session', async () => {
    mocks.session.mockResolvedValue(null)
    expect((await GET(request('folderId=0ByflSbu6LLHWZVR1aDg2WjBHQ1E'))).status).toBe(401)
  })

  it('rejects folder IDs and resource keys that are not Drive-shaped', async () => {
    for (const query of ['', "folderId=x'%20or%20name%20contains%20'a", 'folderId=0ByflSbu6LLHWZVR1aDg2WjBHQ1E&resourceKey=a%0Ab']) {
      expect((await GET(request(query))).status).toBe(400)
    }
    expect(mocks.files).not.toHaveBeenCalled()
  })

  it('reports a Drive failure as 502 instead of an empty folder', async () => {
    mocks.files.mockResolvedValue(null)
    const response = await GET(request('folderId=0ByflSbu6LLHWZVR1aDg2WjBHQ1E'))
    expect(response.status).toBe(502)
  })

  it('returns the files', async () => {
    mocks.files.mockResolvedValue([{ id: 'a' }])
    const response = await GET(request('folderId=0ByflSbu6LLHWZVR1aDg2WjBHQ1E&resourceKey=0-CMdz-90PDFKBVc8EaqffCw'))
    expect(await response.json()).toEqual({ files: [{ id: 'a' }] })
    expect(mocks.files).toHaveBeenCalledWith('0ByflSbu6LLHWZVR1aDg2WjBHQ1E', '0-CMdz-90PDFKBVc8EaqffCw')
  })
})
