import { describe, expect, it } from 'vitest'
import { SundaySchoolAuthority, SundaySchoolLevel } from '@prisma/client'
import { getSundaySchoolAssignmentLevels, getSundaySchoolResponsibilityLabels } from '@/lib/sunday-school-user-assignments'

describe('Sunday School user assignment levels', () => {
  it('combines direct class and age-group assignments in grade order', () => {
    expect(getSundaySchoolAssignmentLevels([
      {
        id: 'class-assignment',
        authority: SundaySchoolAuthority.SERVANT,
        classId: 'grade-10',
        ageGroupId: null,
        class: { id: 'grade-10', name: '10th Grade', level: SundaySchoolLevel.GRADE_10 },
        ageGroup: null,
      },
      {
        id: 'age-group-assignment',
        authority: SundaySchoolAuthority.COORDINATOR,
        classId: null,
        ageGroupId: 'middle-school',
        class: null,
        ageGroup: {
          id: 'middle-school',
          name: 'Middle School',
          levels: [
            SundaySchoolLevel.GRADE_7,
            SundaySchoolLevel.GRADE_6,
            SundaySchoolLevel.GRADE_8,
          ],
        },
      },
    ])).toEqual([
      SundaySchoolLevel.GRADE_6,
      SundaySchoolLevel.GRADE_7,
      SundaySchoolLevel.GRADE_8,
      SundaySchoolLevel.GRADE_10,
    ])
  })

  it('deduplicates a grade served through more than one assignment', () => {
    expect(getSundaySchoolAssignmentLevels([
      {
        id: 'special-needs-assignment',
        authority: SundaySchoolAuthority.SERVANT,
        classId: 'special-needs',
        ageGroupId: null,
        class: {
          id: 'special-needs',
          name: 'Special Needs',
          level: SundaySchoolLevel.SPECIAL_NEEDS,
        },
        ageGroup: null,
      },
      {
        id: 'elementary-assignment',
        authority: SundaySchoolAuthority.COORDINATOR,
        classId: null,
        ageGroupId: 'elementary',
        class: null,
        ageGroup: {
          id: 'elementary',
          name: 'Elementary School',
          levels: [SundaySchoolLevel.GRADE_5, SundaySchoolLevel.SPECIAL_NEEDS],
        },
      },
    ])).toEqual([
      SundaySchoolLevel.GRADE_5,
      SundaySchoolLevel.SPECIAL_NEEDS,
    ])
  })

  it('returns no grades for a user with only an access tag', () => {
    expect(getSundaySchoolAssignmentLevels(undefined)).toEqual([])
  })
})

describe('Sunday School responsibility labels', () => {
  it('distinguishes coordinator and servant duties and deduplicates overlapping scopes', () => {
    expect(getSundaySchoolResponsibilityLabels([
      { id: 'direct', authority: 'COORDINATOR', classId: '12', ageGroupId: null,
        class: { id: '12', name: 'St. Mary', level: 'GRADE_12' }, ageGroup: null },
      { id: 'band', authority: 'COORDINATOR', classId: null, ageGroupId: 'high', class: null,
        ageGroup: { id: 'high', name: 'High School', levels: ['GRADE_12', 'GRADE_11'] } },
      { id: 'serving', authority: 'SERVANT', classId: '11', ageGroupId: null,
        class: { id: '11', name: 'St. George', level: 'GRADE_11' }, ageGroup: null },
    ])).toEqual(['11th Grade Coordinator', '11th Grade Servant', '12th Grade Coordinator'])
  })

  it('does not infer responsibility from a role tag alone', () => {
    expect(getSundaySchoolResponsibilityLabels(undefined)).toEqual([])
    expect(getSundaySchoolResponsibilityLabels([])).toEqual([])
  })
})
