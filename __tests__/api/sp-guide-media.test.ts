// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
const mock = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn() }))
vi.mock('@/lib/sp-guide-auth', () => ({ requirePrepGuideViewer: mock.auth }))
vi.mock('@/lib/sp-guide-media', () => ({ loadPrepGuideAsset: mock.load }))
vi.mock('@/lib/api-utils', () => ({ handleApiError: (e: Error) => NextResponse.json({ error: e.message }, { status: e.message === 'Unauthorized' ? 401 : 403 }) }))
import { GET, HEAD } from '@/app/api/guides/servants-prep/[id]/[asset]/route'
const ctx = (id = 'attendance', asset = 'video') => ({ params: Promise.resolve({ id, asset }) })
const req = (range?: string) => new NextRequest('https://example.test/api/guides/servants-prep/attendance/video', { headers: range ? { range } : {} })
beforeEach(() => { vi.resetAllMocks(); mock.auth.mockResolvedValue({}); mock.load.mockResolvedValue(Buffer.from('0123456789')) })
describe('protected SP media', () => {
  it.each(['video', 'poster', 'captions'])('denies anonymous %s without inspecting a file', async asset => {
    mock.auth.mockRejectedValue(new Error('Unauthorized'))
    const response = await GET(req(), ctx('attendance', asset))
    expect(response.status).toBe(401); expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(mock.load).not.toHaveBeenCalled()
  })
  it('denies an authenticated unauthorized viewer on HEAD too', async () => {
    mock.auth.mockRejectedValue(new Error('Forbidden')); expect((await HEAD(req(), ctx())).status).toBe(403); expect(mock.load).not.toHaveBeenCalled()
  })
  it.each([['../attendance', 'video'], ['attendance', '../poster'], ['attendance', 'constructor']])('rejects unlisted paths %s/%s', async (id, asset) => {
    expect((await GET(req(), ctx(id, asset))).status).toBe(404); expect(mock.load).not.toHaveBeenCalled()
  })
  it('streams only an authorized byte range without public caching', async () => {
    const response = await GET(req('bytes=2-5'), ctx())
    expect(response.status).toBe(206); expect(response.headers.get('content-range')).toBe('bytes 2-5/10'); expect(response.headers.get('content-length')).toBe('4'); expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(mock.load).toHaveBeenCalledWith('attendance', 'mp4'); expect(await response.text()).toBe('2345')
  })
  it('supports suffix ranges and HEAD without opening the stream', async () => {
    const response = await HEAD(req('bytes=-3'), ctx()); expect(response.status).toBe(206); expect(response.headers.get('content-range')).toBe('bytes 7-9/10'); expect(await response.text()).toBe('')
  })
  it.each(['bytes=20-30', 'bytes=7-3', 'bytes=-0', 'bytes=0-2,4-6', 'garbage'])('rejects invalid range %s', async range => {
    const response = await GET(req(range), ctx()); expect(response.status).toBe(416); expect(response.headers.get('content-range')).toBe('bytes */10')
  })
})
