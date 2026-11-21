import { NextRequest } from 'next/server'
import { loadPrepGuideAsset } from '@/lib/sp-guide-media'
import { requirePrepGuideViewer } from '@/lib/sp-guide-auth'
import { findPrepGuide } from '@/lib/sp-guides'
import { handleApiError } from '@/lib/api-utils'

export const runtime = 'nodejs'
type Context = { params: Promise<{ id: string; asset: string }> }
const assets: Record<string, { suffix: string; type: string }> = {
  video: { suffix: 'mp4', type: 'video/mp4' },
  poster: { suffix: 'jpg', type: 'image/jpeg' },
  captions: { suffix: 'vtt', type: 'text/vtt; charset=utf-8' },
}
async function serve(req: NextRequest, context: Context, head = false) {
  try {
    await requirePrepGuideViewer()
    const { id, asset } = await context.params
    if (!findPrepGuide(id) || !Object.hasOwn(assets, asset)) return new Response(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
    const format = assets[asset]
    const media = await loadPrepGuideAsset(id, format.suffix)
    if (!media) return new Response(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
    let start = 0, end = media.length - 1, status = 200
    const headers = new Headers({ 'Content-Type': format.type, 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' })
    const range = req.headers.get('range')
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${media.length}`, 'Cache-Control': 'private, no-store' } })
      start = match[1] ? Number(match[1]) : Math.max(0, media.length - Number(match[2]))
      end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= media.length) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${media.length}`, 'Cache-Control': 'private, no-store' } })
      status = 206; headers.set('Content-Range', `bytes ${start}-${end}/${media.length}`)
    }
    headers.set('Content-Length', String(end - start + 1))
    const body = head ? null : new Uint8Array(media.subarray(start, end + 1))
    return new Response(body, { status, headers })
  } catch (error: unknown) { const response = handleApiError(error); response.headers.set('Cache-Control', 'private, no-store'); return response }
}
export async function GET(req: NextRequest, context: Context) { return serve(req, context) }
export async function HEAD(req: NextRequest, context: Context) { return serve(req, context, true) }
