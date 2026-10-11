import { describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
import { MCP_INSPECTION_FIELDS } from '@/lib/mcp-inspection-catalog'
import { inspectionWhere } from '@/lib/mcp-inspection'

describe('MCP inspection allowlist', () => {
  it('only selects existing scalar fields and excludes private values', () => {
    for (const [entity, allowed] of Object.entries(MCP_INSPECTION_FIELDS)) {
      const model = Prisma.dmmf.datamodel.models.find(model => model.name === entity)
      expect(model, entity).toBeDefined()
      for (const name of allowed.split(' ')) {
        const field = model?.fields.find(field => field.name === name)
        expect(field, `${entity}.${name}`).toBeDefined()
        expect(field?.kind).not.toBe('object')
        expect(field?.type).not.toBe('Json')
        expect(name).not.toMatch(/^password$|tokenHash|sessionHash|answerKey|guardian(Name|Phone|Email)|phone|email/i)
      }
    }
    expect(MCP_INSPECTION_FIELDS).not.toHaveProperty('SundaySchoolPriestNote')
    expect(MCP_INSPECTION_FIELDS).not.toHaveProperty('Account')
    expect(MCP_INSPECTION_FIELDS).not.toHaveProperty('DigitalExamAttemptArchive')
  })
})

describe('typed inspection filters', () => {
  it('handles dates, numeric ranges, nullable values and list membership', () => {
    expect(inspectionWhere('Exam', [{ field: 'examDate', operator: 'gte', value: '2026-10-11' }]))
      .toEqual({ AND: [{ examDate: { gte: new Date('2026-10-11') } }] })
    expect(inspectionWhere('ExamScore', [{ field: 'percentage', operator: 'lte', value: 75 }]))
      .toEqual({ AND: [{ percentage: { lte: 75 } }] })
    expect(inspectionWhere('StudentEnrollment', [{ field: 'mentorId', operator: 'eq', value: null }]))
      .toEqual({ AND: [{ mentorId: { equals: null } }] })
    expect(inspectionWhere('SundaySchoolAgeGroup', [{ field: 'levels', operator: 'has', value: 'GRADE_1' }]))
      .toEqual({ AND: [{ levels: { has: 'GRADE_1' } }] })
  })

  it.each([
    ['Exam', 'examDate', 'gte', 'invalid date'],
    ['Exam', 'totalPoints', 'eq', 1.5],
    ['Exam', 'totalPoints', 'eq', '100'],
    ['Exam', 'totalPoints', 'eq', null],
    ['User', 'name', 'has', 'test'],
    ['User', 'name', 'gte', 'test'],
    ['SundaySchoolAgeGroup', 'levels', 'eq', 'GRADE_1'],
    ['SundaySchoolChild', 'guardianEmail', 'eq', 'private@example.com'],
  ] as const)('rejects invalid or private filter %s.%s', (entity, field, operator, value) => {
    expect(() => inspectionWhere(entity, [{ field, operator, value }])).toThrow()
  })
})
