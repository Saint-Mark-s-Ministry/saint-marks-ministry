import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { isValidLevel } from '@/lib/sunday-school-class'
import { notifyChildRegistrationSubmitted } from '@/lib/notifications'
import { RegistrationStatus, SundaySchoolChildGender, UserRole } from '@prisma/client'
import { normalizeOptionalEmail } from '@/lib/email'
import { findOwnDuplicate, normalizePhone, parseBirthDate } from '@/lib/parent-registration'

// POST /api/parent/children/register
// Auth: PARENT only. Creates a pending ChildRegistrationRequest — the real
// SundaySchoolChild row and the parent<->child guardian link are only
// created once a coordinator/admin reviews and approves the request.
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole([UserRole.PARENT])

    const body = await req.json()
    const {
      firstName,
      lastName,
      birthDate,
      gender,
      intendedLevel,
      guardianName,
      guardianPhone,
      guardianEmail,
      notes,
    } = body

    if (!firstName || !lastName || !birthDate || !intendedLevel) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    if (!isValidLevel(intendedLevel)) {
      return NextResponse.json(
        { error: 'Invalid intended level' },
        { status: 400 }
      )
    }
    if (gender && !Object.values(SundaySchoolChildGender).includes(gender)) {
      return NextResponse.json({ error: 'Invalid gender' }, { status: 400 })
    }

    const parsedBirthDate = parseBirthDate(birthDate)
    if (!parsedBirthDate) {
      return NextResponse.json(
        { error: "Enter a real birth date that isn't in the future." },
        { status: 400 }
      )
    }

    const phone = normalizePhone(guardianPhone)
    if (!phone) {
      return NextResponse.json(
        { error: 'Enter a guardian phone number with 7 to 15 digits.' },
        { status: 400 }
      )
    }

    const duplicate = await findOwnDuplicate(user.id, String(firstName), String(lastName), parsedBirthDate)
    if (duplicate) {
      return NextResponse.json(
        {
          error: duplicate === 'linked'
            ? 'This child is already linked to your family.'
            : 'A registration for this child is already waiting for review.',
          code: 'DUPLICATE_CHILD',
        },
        { status: 409 }
      )
    }

    const request = await prisma.childRegistrationRequest.create({
      data: {
        submittedByUserId: user.id,
        status: RegistrationStatus.PENDING,
        firstName,
        lastName,
        birthDate: parsedBirthDate,
        gender: gender || null,
        intendedLevel,
        guardianName: guardianName || user.name,
        guardianPhone: phone,
        guardianEmail: normalizeOptionalEmail(guardianEmail || user.email),
        notes: notes || null,
      },
    })

    notifyChildRegistrationSubmitted({
      childName: `${firstName} ${lastName}`,
      requestId: request.id,
      level: intendedLevel,
    }).catch(() => {})

    return NextResponse.json(
      {
        id: request.id,
        message: 'Registration request submitted successfully! It is now pending review.',
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
