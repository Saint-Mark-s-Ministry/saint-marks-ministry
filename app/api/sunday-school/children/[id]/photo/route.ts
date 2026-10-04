import { NextResponse } from "next/server"
import { put, del } from "@vercel/blob"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { handleApiError } from "@/lib/api-utils"
import { getSundaySchoolAccess } from "@/lib/sunday-school-access"
import { loadChildForUser } from "@/lib/sunday-school-child-access"

// Sunday School mode: a child's photo, so servants can put names to faces.
// Same permission as editing the child: servants of the child's class, or admins.

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const MAX_BYTES = 4 * 1024 * 1024

async function removeBlob(url: string | null) {
  if (!url) return
  await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {})
}

// POST /api/sunday-school/children/[id]/photo  (multipart: file)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const access = await getSundaySchoolAccess(user)
    await loadChildForUser(id, access, true)

    const file = (await request.formData()).get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No photo provided" }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Use a JPG, PNG or WebP photo" }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Photo must be under 4 MB" }, { status: 400 })
    }

    const previous = await prisma.sundaySchoolChild.findUnique({ where: { id }, select: { photoUrl: true } })
    const blob = await put(`sunday-school-children/${id}.${file.type.split("/")[1]}`, file, {
      access: "public",
      addRandomSuffix: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
    const child = await prisma.sundaySchoolChild.update({
      where: { id },
      data: { photoUrl: blob.url },
      select: { id: true, photoUrl: true },
    })
    await removeBlob(previous?.photoUrl ?? null)
    return NextResponse.json(child)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

// DELETE /api/sunday-school/children/[id]/photo
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const access = await getSundaySchoolAccess(user)
    await loadChildForUser(id, access, true)

    const previous = await prisma.sundaySchoolChild.findUnique({ where: { id }, select: { photoUrl: true } })
    await prisma.sundaySchoolChild.update({ where: { id }, data: { photoUrl: null } })
    await removeBlob(previous?.photoUrl ?? null)
    return NextResponse.json({ id, photoUrl: null })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
