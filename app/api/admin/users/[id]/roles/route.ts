import { NextResponse } from 'next/server'
import { AuditEventResult, RoleGrantSource, RoleTag, UserRole } from '@prisma/client'
import { requireAuth } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { legacyRoleForTags, ROLE_TAG_VALUES } from '@/lib/role-tags'

function dependencyError(message: string) {
  return NextResponse.json({ error: message }, { status: 409 })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth()
    const { id } = await params

    if (actor.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ error: 'Only Super Admins can edit access tags' }, { status: 403 })
    }

    // Do not rely on a possibly stale JWT role alone. A revoked Super Admin
    // grant must stop authorizing role changes immediately.
    const actorGrant = await prisma.userRoleAssignment.findFirst({
      where: {
        userId: actor.id,
        tag: RoleTag.SUPER_ADMIN,
        revokedAt: null,
      },
      select: { id: true },
    })
    if (!actorGrant) {
      return NextResponse.json({ error: 'Only Super Admins can edit access tags' }, { status: 403 })
    }

    const body = await request.json() as { roleTags?: unknown; note?: unknown }
    if (!Array.isArray(body.roleTags)) {
      return NextResponse.json({ error: 'roleTags must be an array' }, { status: 400 })
    }

    const requestedTags = body.roleTags.map(String)
    if (requestedTags.some((tag) => !ROLE_TAG_VALUES.has(tag as RoleTag))) {
      return NextResponse.json({ error: 'One or more access tags are invalid' }, { status: 400 })
    }

    const desiredTags = Array.from(new Set(requestedTags as RoleTag[]))
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    if (note.length > 500) {
      return NextResponse.json({ error: 'Audit note must be 500 characters or fewer' }, { status: 400 })
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        roleAssignments: {
          where: { revokedAt: null },
          select: { id: true, tag: true, note: true },
        },
        enrollments: {
          where: { status: 'ACTIVE' },
          select: { id: true },
          take: 1,
        },
        linkedSundaySchoolChild: { select: { id: true } },
        guardianOfChildren: {
          where: { endedAt: null },
          select: { id: true },
          take: 1,
        },
        sundaySchoolServing: {
          where: { endedAt: null },
          select: { id: true },
          take: 1,
        },
        mentorAssignments: {
          where: {
            endedAt: null,
            studentEnrollment: { status: 'ACTIVE' },
          },
          select: { id: true },
          take: 1,
        },
      },
    })

    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const activeTags = new Set(target.roleAssignments.map((assignment) => assignment.tag))
    const desiredTagSet = new Set(desiredTags)
    const removedTags = new Set(Array.from(activeTags).filter((tag) => !desiredTagSet.has(tag)))

    if (id === actor.id && removedTags.has(RoleTag.SUPER_ADMIN)) {
      return NextResponse.json({ error: 'You cannot remove your own Super Admin access' }, { status: 400 })
    }

    if (removedTags.has(RoleTag.SERVANTS_PREP_STUDENT) && target.enrollments.length > 0) {
      return dependencyError('End the active Servants Prep enrollment before removing the Servants Prep Student tag')
    }
    if (removedTags.has(RoleTag.SUNDAY_SCHOOL_STUDENT) && target.linkedSundaySchoolChild) {
      return dependencyError('Unlink the Sunday School child account before removing the Sunday School Student tag')
    }
    if (removedTags.has(RoleTag.PARENT) && target.guardianOfChildren.length > 0) {
      return dependencyError('End active guardian relationships before removing the Parent tag')
    }
    if (removedTags.has(RoleTag.SUNDAY_SCHOOL_SERVANT) && target.sundaySchoolServing.length > 0) {
      return dependencyError('End active Sunday School assignments before removing the Sunday School Servant tag')
    }
    if (removedTags.has(RoleTag.SUPER_ADMIN)) {
      const otherSuperAdmins = await prisma.userRoleAssignment.count({
        where: {
          tag: RoleTag.SUPER_ADMIN,
          revokedAt: null,
          userId: { not: id },
        },
      })
      if (otherSuperAdmins === 0) {
        return NextResponse.json({ error: 'At least one active Super Admin is required' }, { status: 400 })
      }
    }

    if (desiredTags.length === 0 && target.mentorAssignments.length === 0) {
      return NextResponse.json(
        { error: 'Select at least one access tag. Mentor-only access requires an active mentor assignment.' },
        { status: 400 }
      )
    }

    const tagsToGrant = desiredTags.filter((tag) => !activeTags.has(tag))
    const assignmentsToRevoke = target.roleAssignments.filter((assignment) => removedTags.has(assignment.tag))
    const compatibilityRole = legacyRoleForTags(desiredTags, target.role, {
      hasActiveMentorAssignment: target.mentorAssignments.length > 0,
    })
    const now = new Date()

    const result = await prisma.$transaction(async (tx) => {
      for (const assignment of assignmentsToRevoke) {
        const auditNote = note ? `Revoked: ${note}` : 'Revoked by Super Admin'
        await tx.userRoleAssignment.update({
          where: { id: assignment.id },
          data: {
            revokedAt: now,
            revokedById: actor.id,
            note: [assignment.note, auditNote].filter(Boolean).join('\n'),
          },
        })
      }

      if (tagsToGrant.length > 0) {
        await tx.userRoleAssignment.createMany({
          data: tagsToGrant.map((tag) => ({
            userId: id,
            tag,
            source: RoleGrantSource.SUPER_ADMIN,
            grantedById: actor.id,
            note: note || 'Granted by Super Admin',
          })),
        })
      }

      if (compatibilityRole !== target.role) {
        await tx.user.update({ where: { id }, data: { role: compatibilityRole } })
      }

      await tx.auditEvent.create({
        data: {
          actorUserId: actor.id,
          action: 'user.role_tags.update',
          entityType: 'User',
          entityId: id,
          result: AuditEventResult.SUCCESS,
          reason: note || null,
          metadata: {
            previousTags: Array.from(activeTags),
            desiredTags,
            grantedTags: tagsToGrant,
            revokedTags: Array.from(removedTags),
            previousCompatibilityRole: target.role,
            compatibilityRole,
          },
        },
      })

      return tx.user.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          role: true,
          roleAssignments: {
            where: { revokedAt: null },
            select: { tag: true },
            orderBy: { grantedAt: 'asc' },
          },
        },
      })
    })

    return NextResponse.json({
      id: result.id,
      role: result.role,
      roleTags: result.roleAssignments.map((assignment) => assignment.tag),
    })
  } catch (error: unknown) {
    console.error('Failed to update user access tags:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update access tags' },
      { status: error instanceof Error && error.message === 'Forbidden' ? 403 : 500 }
    )
  }
}
