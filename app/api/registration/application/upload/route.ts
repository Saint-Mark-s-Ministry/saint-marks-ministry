import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { handleApprovalFormUpload } from '@/lib/approval-form-submission'

export async function POST(request: Request) {
  try { return await handleApprovalFormUpload(request, (await requireAuth()).id) }
  catch (error) { return handleApiError(error) }
}
