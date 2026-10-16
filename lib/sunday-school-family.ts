import type { Prisma } from '@prisma/client'
import { normalizeOptionalEmail } from './email'
import { normalizeHomeAddress } from './address'

export interface SundaySchoolFamilyDetails {
  name: string | null
  homeAddress: string | null
  motherName: string | null
  motherPhone: string | null
  motherEmail: string | null
  fatherName: string | null
  fatherPhone: string | null
  fatherEmail: string | null
}

export const sundaySchoolFamilyInclude = {
  children: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      level: true,
      classId: true,
      class: { select: { id: true, name: true, level: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  },
} satisfies Prisma.SundaySchoolFamilyInclude

const FAMILY_DETAIL_KEYS = [
  'name',
  'homeAddress',
  'motherName',
  'motherPhone',
  'motherEmail',
  'fatherName',
  'fatherPhone',
  'fatherEmail',
] as const

export function normalizeSundaySchoolFamilyDetails(
  value: unknown
): SundaySchoolFamilyDetails | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const input = value as Record<string, unknown>
  return Object.fromEntries(
    FAMILY_DETAIL_KEYS.map((key) => [
      key,
      key === 'homeAddress'
        ? normalizeHomeAddress(input[key])
        : key === 'motherEmail' || key === 'fatherEmail'
        ? normalizeOptionalEmail(input[key])
        : typeof input[key] === 'string'
          ? input[key].trim() || null
          : null,
    ])
  ) as unknown as SundaySchoolFamilyDetails
}

export function hasSundaySchoolFamilyDetails(details: SundaySchoolFamilyDetails | null) {
  return Boolean(details && Object.values(details).some(Boolean))
}
