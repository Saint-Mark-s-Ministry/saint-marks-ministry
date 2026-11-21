import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { canServeClass, getSundaySchoolAccess } from '@/lib/sunday-school-access'
import { recordAuditEvent } from '@/lib/audit'

// Sunday School mode: revoking one temporary roster sign-up link.

// DELETE /api/sunday-school/roster-links/[id]
// Closes a link immediately. Children already added through it stay on the
// roster — revoking withdraws the invitation, it does not undo sign-ups.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const link = await prisma.sundaySchoolRosterLink.findUnique({
      where: { id },
      select: {
        id: true,
        classId: true,
        revokedAt: true,
        contactUpdateOnly: true,
        class: { select: { academicYearId: true, name: true } },
      },
    })
    if (!link) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const access = await getSundaySchoolAccess(user, link.class.academicYearId)
    if (!canServeClass(access, link.classId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (link.revokedAt) {
      return NextResponse.json({ success: true, alreadyRevoked: true })
    }

    const revoked = await prisma.sundaySchoolRosterLink.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    if (!revoked.count) return NextResponse.json({ success: true, alreadyRevoked: true })

    await recordAuditEvent({
      actorUserId: user.id,
      action: link.contactUpdateOnly ? 'sunday_school.contact_update_qr.revoked' : 'SUNDAY_SCHOOL_ROSTER_LINK_REVOKED',
      entityType: 'SundaySchoolRosterLink',
      entityId: id,
      result: 'SUCCESS',
      metadata: { classId: link.classId, targetName: link.class.name, contactUpdateOnly: link.contactUpdateOnly },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
