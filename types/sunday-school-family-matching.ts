export interface FamilyMatchingEvent {
  at: string
  actorUserId: string | null
  childIds: string[]
  previousFamilyIds: Record<string, string | null>
  origin?: { type: 'roster-import'; importId: string; rowNumber: number }
  sources: Array<{ familyId: string; details: Record<string, string | null> }>
  filled: Array<{ field: string; sourceFamilyId: string }>
  conflicts: Array<{ field: string; values: string[] }>
}

export interface FamilyMatchingHistory {
  events: FamilyMatchingEvent[]
}

export const FAMILY_FIELD_LABELS: Record<string, string> = {
  name: 'Family name', homeAddress: 'Home address',
  motherName: 'Mother’s name', motherPhone: 'Mother’s phone', motherEmail: 'Mother’s email',
  fatherName: 'Father’s name', fatherPhone: 'Father’s phone', fatherEmail: 'Father’s email',
}
