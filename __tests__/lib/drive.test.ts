import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDriveFiles } from '@/lib/drive'

const file = (id: string) => ({ id, name: id, mimeType: 'application/pdf', webViewLink: '', iconLink: '', modifiedTime: '2026-09-01T00:00:00Z' })

describe('getDriveFiles', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('GOOGLE_API_KEY', 'test-key')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    fetchMock.mockReset()
  })

  it('follows nextPageToken so folders with more than one page are complete', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ files: [file('a'), file('b')], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(Response.json({ files: [file('c')] }))

    const files = await getDriveFiles('0ByflSbu6LLHWZVR1aDg2WjBHQ1E', 'rk')
    expect(files?.map((f) => f.id)).toEqual(['a', 'b', 'c'])

    const first = new URL(String(fetchMock.mock.calls[0][0]))
    const second = new URL(String(fetchMock.mock.calls[1][0]))
    expect(first.searchParams.get('pageSize')).toBe('1000')
    expect(first.searchParams.get('q')).toBe("'0ByflSbu6LLHWZVR1aDg2WjBHQ1E' in parents and trashed = false")
    expect(first.searchParams.get('pageToken')).toBeNull()
    expect(second.searchParams.get('pageToken')).toBe('p2')
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      'X-Goog-Drive-Resource-Keys': '0ByflSbu6LLHWZVR1aDg2WjBHQ1E/rk',
    })
  })

  it('returns null, not an empty folder, when Drive fails or is unreachable', async () => {
    fetchMock.mockResolvedValueOnce(new Response('quota', { status: 403 }))
    expect(await getDriveFiles('0ByflSbu6LLHWZVR1aDg2WjBHQ1E')).toBeNull()

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    expect(await getDriveFiles('0ByflSbu6LLHWZVR1aDg2WjBHQ1E')).toBeNull()
  })

  it('returns null when the API key is missing', async () => {
    vi.stubEnv('GOOGLE_API_KEY', '')
    expect(await getDriveFiles('0ByflSbu6LLHWZVR1aDg2WjBHQ1E')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps a genuinely empty folder empty', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ files: [] }))
    expect(await getDriveFiles('0ByflSbu6LLHWZVR1aDg2WjBHQ1E')).toEqual([])
  })
})
