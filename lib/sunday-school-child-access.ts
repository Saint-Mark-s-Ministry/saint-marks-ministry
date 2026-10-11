import { prisma } from "@/lib/prisma"
import { canServeClass, canViewClass, type SundaySchoolAccess } from "@/lib/sunday-school-access"

/**
 * You may only touch children in classes your assignments cover. Returns the
 * child's current classId, or throws Forbidden / Not found.
 *
 * `write` distinguishes reading a child's record from changing it, so PRIEST
 * can look without being able to edit.
 */
export async function loadChildForUser(
  childId: string,
  access: SundaySchoolAccess,
  write: boolean
) {
  const child = await prisma.sundaySchoolChild.findUnique({
    where: { id: childId },
    select: {
      id: true,
      classId: true,
      familyId: true,
      level: true,
      enrollments: {
        where: { status: "ACTIVE" },
        take: 1,
        select: {
          id: true,
          sundaySchoolYearId: true,
          level: true,
        },
      },
    },
  })
  if (!child) {
    throw new Error("Not found")
  }

  if (!child.classId) {
    // A child with no class is admin-only
    if (!access.isAdmin && !(access.canRead && !write && access.visibleClassIds === "all")) {
      throw new Error("Forbidden")
    }
    return child
  }

  const allowed = write
    ? canServeClass(access, child.classId)
    : canViewClass(access, child.classId)
  if (!allowed) {
    throw new Error("Forbidden")
  }

  return child
}
