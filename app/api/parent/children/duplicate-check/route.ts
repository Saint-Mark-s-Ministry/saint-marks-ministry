import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { findOwnDuplicate, parseBirthDate } from '@/lib/parent-registration'
import { UserRole } from '@prisma/client'

// GET /api/parent/children/duplicate-check?firstName=&lastName=&birthDate=YYYY-MM-DD
// Auth: PARENT only. Checks only this parent's own children and requests, so
// the answer never reveals another family's records. Returns the reason, not the record.
export async function GET(req: NextRequest) {
  try {
    const user = await requireRole([UserRole.PARENT])
    const { searchParams } = new URL(req.url)
    const firstName = searchParams.get('firstName')?.trim()
    const lastName = searchParams.get('lastName')?.trim()
    const birthDate = parseBirthDate(searchParams.get('birthDate'))

    if (!firstName || !lastName || !birthDate) {
      return NextResponse.json({ error: 'First name, last name and a valid birth date are required' }, { status: 400 })
    }

    const duplicate = await findOwnDuplicate(user.id, firstName, lastName, birthDate)
    return NextResponse.json({ duplicate })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
