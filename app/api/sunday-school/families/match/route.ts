import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { RoleTag } from '@prisma/client'
import { getAuthorizationContext } from '@/lib/authorization'
import { lockFamilyMatching, matchSundaySchoolFamilies } from '@/lib/sunday-school-family-matching'

// Ministry-wide repair for existing records. Ordinary roster edits reconcile
// only the connected component containing the child being saved.
export async function POST() {
  try {
    const user = await requireAuth()
    const access = await getAuthorizationContext(user.id)
    if (access.disabled || access.readOnly || (!access.roleTags.has(RoleTag.SUPER_ADMIN) && !access.roleTags.has(RoleTag.PRIEST))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const result = await prisma.$transaction(async tx => {
      await lockFamilyMatching(tx)
      return matchSundaySchoolFamilies(tx, { actorUserId: user.id })
    }, { timeout: 30_000 })
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
