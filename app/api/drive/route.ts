import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getDriveFiles } from "@/lib/drive"
import { isDriveId } from "@/lib/drive-folders"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const folderId = req.nextUrl.searchParams.get("folderId")
  const resourceKey = req.nextUrl.searchParams.get("resourceKey") ?? undefined

  // The ID is interpolated into a Drive query string, so only real-looking IDs pass.
  if (!isDriveId(folderId) || (resourceKey !== undefined && !/^[A-Za-z0-9_-]{1,200}$/.test(resourceKey))) {
    return NextResponse.json({ error: "Invalid folderId" }, { status: 400 })
  }

  const files = await getDriveFiles(folderId, resourceKey)
  if (!files) {
    // A Drive failure must not look like an empty folder.
    return NextResponse.json({ error: "Google Drive is unavailable right now" }, { status: 502 })
  }
  return NextResponse.json({ files })
}
