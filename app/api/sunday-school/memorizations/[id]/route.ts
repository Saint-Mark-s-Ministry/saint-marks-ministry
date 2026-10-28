import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { getAuthorizationContext, scopeAllows, canWriteBusinessData } from '@/lib/authorization'
import { validateMemorizationInput } from '@/lib/sunday-school-memorization'

async function loadAuthorized(id: string, user: Awaited<ReturnType<typeof requireAuth>>) {
  const memorization = await prisma.sundaySchoolMemorization.findUnique({
    where: { id },
    select: { id: true, classId: true, class: { select: { sundaySchoolYearId: true } } },
  })
  if (!memorization) return { error: NextResponse.json({ error: 'Memorization not found' }, { status: 404 }) }
  const access = await getAuthorizationContext(user.id, { sundaySchoolYearId: memorization.class.sundaySchoolYearId ?? undefined })
  if (!canWriteBusinessData(access) || !scopeAllows(access.sundaySchoolClassScope, memorization.classId)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { memorization }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const found = await loadAuthorized(id, user)
    if (found.error) return found.error
    const body = await request.json()
    const parsed = validateMemorizationInput(body)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const updated = await prisma.sundaySchoolMemorization.update({
      where: { id },
      data: parsed.value,
      include: { scores: true },
    })
    return NextResponse.json(updated)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

/** Archives rather than deletes, so recorded scores are kept. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const found = await loadAuthorized(id, user)
    if (found.error) return found.error
    await prisma.sundaySchoolMemorization.update({ where: { id }, data: { archivedAt: new Date() } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
