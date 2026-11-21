import { prepGuideMediaKey } from '@/lib/sp-guide-encryption'
import { requirePrepGuideViewer } from '@/lib/sp-guide-auth'
import { handleApiError } from '@/lib/api-utils'

export async function GET() {
  try {
    await requirePrepGuideViewer()
    prepGuideMediaKey()
    return Response.json({ allowed: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error: unknown) {
    const response = handleApiError(error)
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }
}
