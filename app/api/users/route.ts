import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { RoleGrantSource, RoleTag, UserRole } from "@prisma/client"
import bcrypt from "bcryptjs"
import { isAdmin, canManageUsers, canServantPrepManageRole, SERVANT_PREP_MANAGEABLE_ROLES } from "@/lib/roles"
import { legacyRoleForTags, ROLE_TAG_VALUES, roleTagForLegacyRole } from "@/lib/role-tags"
import { normalizeEmail } from "@/lib/email"

// GET /api/users - List all users (Admin only, or MENTOR role can view students)
// Query params:
//   ?role=STUDENT - filter by role
//   ?page=1&limit=50 - pagination (default: all results for backwards compatibility)
//   ?search=john - search by name, email, or phone number
export async function GET(request: Request) {
  try {
    const user = await requireAuth()

    const { searchParams } = new URL(request.url)
    const roleFilter = searchParams.get('role')
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!) : null
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50
    const search = searchParams.get('search')?.trim()

    // MENTOR role can only view their assigned STUDENT mentees
    if (user.role === UserRole.MENTOR) {
      if (roleFilter && roleFilter !== UserRole.STUDENT) {
        return NextResponse.json(
          { error: "Forbidden: Mentors can only view students" },
          { status: 403 }
        )
      }
      // MENTOR can only see students assigned to them as mentees
    } else if (!isAdmin(user.role)) {
      // Non-admin, non-mentor roles are forbidden
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }

    // SERVANT_PREP can only see STUDENT and MENTOR users
    // MENTOR can only see their assigned STUDENT mentees
    let whereClause: Record<string, unknown> = {}

    if (roleFilter) {
      whereClause.role = roleFilter as UserRole
    }

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ]
    }

    if (user.role === UserRole.SERVANT_PREP) {
      // SERVANT_PREP can see the roles it manages, plus other SERVANT_PREP
      // users (for mentor assignment). A role filter can only narrow that
      // set — it can never be used to look at admins or priests.
      const visibleRoles = [...SERVANT_PREP_MANAGEABLE_ROLES, UserRole.SERVANT_PREP]
      if (roleFilter && !visibleRoles.includes(roleFilter as UserRole)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      whereClause = {
        ...whereClause,
        role: roleFilter ? (roleFilter as UserRole) : { in: visibleRoles }
      }
    } else if (user.role === UserRole.MENTOR) {
      // Filter to only students where this mentor is assigned
      whereClause = {
        ...whereClause,
        role: UserRole.STUDENT,
        enrollments: {
          some: {
            mentorId: user.id
          }
        }
      }
    }

    // Build query options
    const queryOptions: {
      where: Record<string, unknown>
      select: Record<string, unknown>
      orderBy: { name: 'asc' }
      skip?: number
      take?: number
    } = {
      where: whereClause,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        profileImageUrl: true,
        role: true,
        roleAssignments: {
          where: { revokedAt: null },
          select: { tag: true },
          orderBy: { grantedAt: 'asc' }
        },
        isDisabled: true,
        canAccessContactBook: true,
        createdAt: true,
        updatedAt: true,
        enrollments: {
          select: {
            id: true,
            yearLevel: true,
            isActive: true,
            status: true,
            notes: true,
            isAsyncStudent: true,
            mentor: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        sundaySchoolServing: {
          where: {
            academicYear: { isActive: true },
            endedAt: null,
          },
          select: {
            id: true,
            authority: true,
            classId: true,
            ageGroupId: true,
            class: { select: { id: true, name: true, level: true } },
            ageGroup: { select: { id: true, name: true, levels: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: {
            mentoredStudents: true,
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    }

    // Add pagination if requested
    if (page !== null) {
      queryOptions.skip = (page - 1) * limit
      queryOptions.take = limit
    }

    // If pagination requested, also get total count
    if (page !== null) {
      const [users, total] = await Promise.all([
        prisma.user.findMany(queryOptions),
        prisma.user.count({ where: whereClause })
      ])

      return NextResponse.json({
        data: users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      })
    }

    // No pagination - return all (backwards compatible)
    const users = await prisma.user.findMany(queryOptions)
    return NextResponse.json(users)
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch users" },
      { status: (error instanceof Error && error.message === "Forbidden") ? 403 : 500 }
    )
  }
}

// POST /api/users - Create a new user
// SUPER_ADMIN can create any user, SERVANT_PREP can only create STUDENT and MENTOR users
export async function POST(request: Request) {
  try {
    const currentUser = await requireAuth()

    // Check if user can manage users
    if (!canManageUsers(currentUser.role)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { email, name, phone, password, role } = body
    const normalizedEmail = normalizeEmail(email)

    if (!normalizedEmail || !name || !password || !role) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    const requestedTags = Array.isArray(body.roleTags) ? body.roleTags.map(String) : null
    if (requestedTags?.some((tag: string) => !ROLE_TAG_VALUES.has(tag as RoleTag))) {
      return NextResponse.json({ error: "One or more access tags are invalid" }, { status: 400 })
    }
    if (requestedTags && currentUser.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ error: "Only Super Admins can assign access tags" }, { status: 403 })
    }

    const defaultTag = roleTagForLegacyRole(role as UserRole)
    const desiredRoleTags = Array.from(new Set(
      requestedTags
        ? requestedTags as RoleTag[]
        : defaultTag
          ? [defaultTag]
          : []
    ))

    if (currentUser.role === UserRole.SUPER_ADMIN && desiredRoleTags.length === 0) {
      return NextResponse.json({ error: "Select at least one access tag" }, { status: 400 })
    }

    // SERVANT_PREP can only create Student, Mentor, and Sunday School Servant users
    if (currentUser.role === UserRole.SERVANT_PREP && !canServantPrepManageRole(role)) {
      return NextResponse.json(
        { error: "Servants Prep can only create Student, Mentor, and Sunday School Servant users" },
        { status: 403 }
      )
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    })

    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 }
      )
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create user
    const compatibilityRole = legacyRoleForTags(desiredRoleTags, role as UserRole)
    const newUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name,
        phone: phone || null,
        password: hashedPassword,
        role: compatibilityRole,
        roleAssignments: desiredRoleTags.length > 0 ? {
          create: desiredRoleTags.map((tag) => ({
            tag,
            source: currentUser.role === UserRole.SUPER_ADMIN
              ? RoleGrantSource.SUPER_ADMIN
              : RoleGrantSource.SYSTEM,
            grantedById: currentUser.id,
            note: 'Granted when account was created',
          }))
        } : undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        roleAssignments: {
          where: { revokedAt: null },
          select: { tag: true },
        },
        createdAt: true,
      }
    })

    return NextResponse.json(newUser, { status: 201 })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create user" },
      { status: (error instanceof Error && error.message === "Forbidden") ? 403 : 500 }
    )
  }
}
