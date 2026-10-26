// @vitest-environment node
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { fillImportedFamilyDetails, lockFamilyMatching, matchSundaySchoolFamilies, readFamilyMatchingHistory } from '@/lib/sunday-school-family-matching'

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: async () => ({ id: 'matching-test-admin', role: 'SUPER_ADMIN' }) }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: async () => ({ isAdmin: true, canRead: true, readOnly: false }),
  visibleClassFilter: () => undefined,
  canServeClass: () => true,
  canCoordinateClass: () => true,
}))
import { POST as createChild } from '@/app/api/sunday-school/children/route'
import { PATCH as updateChild } from '@/app/api/sunday-school/children/[id]/route'
import { withSundaySchoolFamilyDetails } from '@/lib/sunday-school-family'
import { prisma } from '@/lib/prisma'

const enabled = process.env.RUN_FAMILY_MATCHING_DB_TESTS === '1'
describe.skipIf(!enabled)('family matching database and roster API', () => {
  let db: PrismaClient
  beforeAll(() => {
    const value = process.env.FAMILY_MATCHING_TEST_DATABASE_URL
    if (!value || value !== process.env.SP_DATABASE_URL) throw new Error('Use the same isolated URL for FAMILY_MATCHING_TEST_DATABASE_URL and SP_DATABASE_URL')
    const url = new URL(value)
    if (url.hostname !== '127.0.0.1' || url.searchParams.get('schema') !== 'family_matching_test') throw new Error('These fixtures require the isolated local family_matching_test schema')
    db = new PrismaClient()
  })
  beforeEach(async () => {
    await db.sundaySchoolChildGuardian.deleteMany()
    await db.sundaySchoolGuardianProfile.deleteMany()
    await db.user.deleteMany({ where: { id: 'family-matching-parent' } })
    await db.sundaySchoolChild.deleteMany()
    await db.sundaySchoolFamily.deleteMany()
  })
  afterAll(async () => { await db?.$disconnect(); await prisma.$disconnect() })
  const family = (id: string, data: Record<string, string>) => db.sundaySchoolFamily.create({ data: { id, ...data } })
  const child = (id: string, familyId: string | null, guardianPhone: string | null = null) => db.sundaySchoolChild.create({ data: {
    id, firstName: id, lastName: 'Test', level: 'GRADE_1', familyId, guardianPhone, notes: 'Child-specific note',
  } })
  const match = (childIds?: string[]) => db.$transaction(async tx => {
    await lockFamilyMatching(tx)
    return matchSundaySchoolFamilies(tx, { childIds, actorUserId: 'test-admin' })
  }, { timeout: 30_000 })

  it('applies the committed additive migration without changing existing family data', async () => {
    await family('existing', { homeAddress: '1 Main St' })
    await db.$executeRawUnsafe('ALTER TABLE "SundaySchoolFamily" DROP COLUMN "matchingHistory"')
    await db.$executeRawUnsafe('ALTER TABLE "SundaySchoolFamily" DROP COLUMN "matchingPhones"')
    await db.$executeRawUnsafe('ALTER TABLE "SundaySchoolChild" DROP COLUMN "familyDetailsOverrides"')
    const migration = readFileSync('prisma/migrations/20261023020000_family_matching_history/migration.sql', 'utf8')
    for (const statement of migration.split(';').map(sql => sql.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement)
    expect(await db.sundaySchoolFamily.findUnique({ where: { id: 'existing' } })).toMatchObject({ homeAddress: '1 Main St', matchingHistory: null })
  })
  it('connects siblings, fills the shared address, retains provenance and becomes a no-op on retry', async () => {
    await family('a', { motherPhone: '2015550123' })
    await family('b', { motherPhone: '+1 (201) 555-0123', homeAddress: '1 Main St' })
    await child('Johnny', 'a'); await child('Henry', 'b')
    expect(await match()).toMatchObject({ linkedChildren: 1, filledFields: 1 })
    const children = await db.sundaySchoolChild.findMany({ include: { family: true } })
    expect(new Set(children.map(c => c.familyId)).size).toBe(1)
    expect(children.every(c => c.family?.homeAddress === '1 Main St' && c.notes === 'Child-specific note')).toBe(true)
    expect(readFamilyMatchingHistory(children[0].family!.matchingHistory).events[0]).toMatchObject({
      actorUserId: 'test-admin', filled: [{ field: 'homeAddress', sourceFamilyId: 'b' }],
    })
    expect(await match()).toEqual({ matchedFamilies: 0, linkedChildren: 0, filledFields: 0, conflicts: 0 })
    expect(await db.sundaySchoolChildGuardian.count()).toBe(0)
  })
  it('keeps conflicting addresses and spelling variants in permanent family history', async () => {
    await family('a', { fatherPhone: '2015550123', fatherName: 'Mark', homeAddress: '1 Main St' })
    await family('b', { fatherPhone: '2015550123', fatherName: 'Marc', homeAddress: '2 Main St' })
    await child('one', 'a'); await child('two', 'b')
    expect(await match()).toMatchObject({ linkedChildren: 1, conflicts: 2 })
    const canonical = await db.sundaySchoolFamily.findUniqueOrThrow({ where: { id: 'a' } })
    expect(canonical.homeAddress).toBe('1 Main St')
    expect(readFamilyMatchingHistory(canonical.matchingHistory).events[0].conflicts).toContainEqual({ field: 'homeAddress', values: ['1 Main St', '2 Main St'] })
    expect(await db.sundaySchoolFamily.findUnique({ where: { id: 'b' } })).toMatchObject({ homeAddress: '2 Main St' })
    const second = await db.sundaySchoolChild.findUniqueOrThrow({ where: { id: 'two' }, include: { family: true } })
    expect(withSundaySchoolFamilyDetails(second).family).toMatchObject({ homeAddress: '2 Main St', fatherName: 'Marc' })
  })
  it('matches legacy guardian phones to stored parent phones across family records', async () => {
    await family('a', { motherPhone: '2015550123', homeAddress: '1 Main St' })
    await child('one', 'a'); await child('two', null, '2015550123')
    await match(['two'])
    expect(await db.sundaySchoolChild.findUnique({ where: { id: 'two' } })).toMatchObject({ familyId: 'a', guardianPhone: '2015550123' })
  })
  it('matches existing families before a roster edit returns without reconciling unrelated families', async () => {
    await family('existing', { motherPhone: '2015550123', homeAddress: '1 Main St' })
    await child('existing-child', 'existing')
    await child('edited-child', null)
    await family('unrelated-a', { motherPhone: '3055550123' })
    await family('unrelated-b', { motherPhone: '3055550123' })
    await child('unrelated-one', 'unrelated-a'); await child('unrelated-two', 'unrelated-b')

    const response = await updateChild(new Request('http://localhost/api/sunday-school/children/edited-child', {
      method: 'PATCH', body: JSON.stringify({ guardianPhone: '+1 (201) 555-0123' }),
    }), { params: Promise.resolve({ id: 'edited-child' }) })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ familyId: 'existing', family: { homeAddress: '1 Main St' } })
    expect((await db.sundaySchoolChild.findUniqueOrThrow({ where: { id: 'unrelated-two' } })).familyId).toBe('unrelated-b')
    expect(await db.sundaySchoolChildGuardian.count()).toBe(0)
    const matched = await db.sundaySchoolFamily.findUniqueOrThrow({ where: { id: 'existing' } })
    const events = readFamilyMatchingHistory(matched.matchingHistory).events
    expect(events).toHaveLength(1)

    // Saving the same roster entry again must not duplicate the matching event.
    const repeated = await updateChild(new Request('http://localhost', {
      method: 'PATCH', body: JSON.stringify({ notes: 'Updated roster note' }),
    }), { params: Promise.resolve({ id: 'edited-child' }) })
    expect(repeated.status).toBe(200)
    expect(readFamilyMatchingHistory((await db.sundaySchoolFamily.findUniqueOrThrow({ where: { id: 'existing' } })).matchingHistory).events).toHaveLength(1)
  })
  it('keeps additional parent phones available when another sibling arrives later', async () => {
    await family('a', { motherPhone: '2015550123', fatherPhone: '2015550124' })
    await family('b', { motherPhone: '2015550123', fatherPhone: '2015550125' })
    await child('one', 'a'); await child('two', 'b')
    await match()
    expect((await db.sundaySchoolFamily.findUniqueOrThrow({ where: { id: 'a' } })).matchingPhones).toEqual(['12015550125'])
    await family('c', { fatherPhone: '2015550125' }); await child('three', 'c')
    await match(['three'])
    expect((await db.sundaySchoolChild.findUniqueOrThrow({ where: { id: 'three' } })).familyId).toBe('a')
  })

  it('uses active guardian profiles, ignores ended links and grants no additional child access', async () => {
    await family('a', { fatherPhone: '2015550123' })
    await child('one', 'a'); await child('two', null); await child('three', null)
    await db.user.create({ data: { id: 'family-matching-parent', name: 'Parent', email: 'family-matching@example.test', password: 'test-only', role: 'SERVANT' } })
    const profile = await db.sundaySchoolGuardianProfile.create({ data: { userId: 'family-matching-parent', firstName: 'Parent', lastName: 'Test', phone: '+1 (201) 555-0123' } })
    await db.sundaySchoolChildGuardian.createMany({ data: [
      { parentId: 'family-matching-parent', childId: 'two', guardianProfileId: profile.id },
      { parentId: 'family-matching-parent', childId: 'three', guardianProfileId: profile.id, endedAt: new Date() },
    ] })
    await match()
    expect((await db.sundaySchoolChild.findUniqueOrThrow({ where: { id: 'two' } })).familyId).toBe('a')
    expect((await db.sundaySchoolChild.findUniqueOrThrow({ where: { id: 'three' } })).familyId).toBeNull()
    expect(await db.sundaySchoolChildGuardian.count()).toBe(2)
    expect(await db.sundaySchoolChildGuardian.count({ where: { childId: 'one' } })).toBe(0)
  })

  it('serializes simultaneous family creation and matching', async () => {
    const save = (id: string) => db.$transaction(async tx => {
      await lockFamilyMatching(tx)
      await tx.sundaySchoolFamily.create({ data: { id, motherPhone: '2015550123' } })
      await tx.sundaySchoolChild.create({ data: { id, firstName: id, lastName: 'Test', level: 'GRADE_1', familyId: id } })
      await matchSundaySchoolFamilies(tx, { childIds: [id] })
    }, { timeout: 30_000 })
    await Promise.all([save('one'), save('two')])
    expect(new Set((await db.sundaySchoolChild.findMany()).map(c => c.familyId)).size).toBe(1)
  })
  it('rolls back family consolidation together with its caller', async () => {
    await family('a', { motherPhone: '2015550123' }); await family('b', { motherPhone: '2015550123' })
    await child('one', 'a'); await child('two', 'b')
    await expect(db.$transaction(async tx => {
      await lockFamilyMatching(tx); await matchSundaySchoolFamilies(tx); throw new Error('Rollback')
    })).rejects.toThrow('Rollback')
    expect((await db.sundaySchoolChild.findUniqueOrThrow({ where: { id: 'two' } })).familyId).toBe('b')
    expect((await db.sundaySchoolFamily.findUniqueOrThrow({ where: { id: 'a' } })).matchingHistory).toBeNull()
  })
  it('CSV enrichment fills only blanks and records the conflicting submitted values', async () => {
    await family('a', { homeAddress: '1 Main St' })
    await db.$transaction(async tx => {
      await lockFamilyMatching(tx)
      await fillImportedFamilyDetails(tx, 'a', { homeAddress: '2 Main St', motherEmail: 'mother@example.test' }, 'admin')
    })
    const result = await db.sundaySchoolFamily.findUniqueOrThrow({ where: { id: 'a' } })
    expect(result).toMatchObject({ homeAddress: '1 Main St', motherEmail: 'mother@example.test' })
    expect(readFamilyMatchingHistory(result.matchingHistory).events[0].conflicts).toEqual([{ field: 'homeAddress', values: ['1 Main St', '2 Main St'] }])
  })
  it('returns the linked family and inherited address immediately from actual roster POST and PATCH', async () => {
    const request = (name: string, details: Record<string, string>) => new Request('http://localhost/api/sunday-school/children', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        firstName: name, lastName: 'Test', level: 'GRADE_1', family: details,
      }),
    })
    const first = await createChild(request('Johnny', { motherPhone: '2015550123', homeAddress: '1 Main St' }))
    expect(first.status).toBe(201)
    const johnny = await first.json()
    const second = await createChild(request('Henry', { motherPhone: '+1 2015550123' }))
    expect(second.status).toBe(201)
    const henry = await second.json()
    expect(henry.familyId).toBe(johnny.familyId)
    expect(henry.family.homeAddress).toBe('1 Main St')
    const third = await createChild(request('Joseph', { motherPhone: '2015550123', homeAddress: '2 Main St' }))
    expect(third.status).toBe(201)
    const joseph = await third.json()
    expect(joseph.familyId).toBe(johnny.familyId)
    expect(joseph.family.homeAddress).toBe('2 Main St')
    expect(joseph).not.toHaveProperty('familyDetailsOverrides')
    const patched = await updateChild(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ family: { fatherName: 'Mark' } }) }), { params: Promise.resolve({ id: henry.id }) })
    expect(patched.status).toBe(200)
    expect((await patched.json()).family).toMatchObject({ homeAddress: '1 Main St', motherPhone: '2015550123', fatherName: 'Mark' })
    const notesOnly = await updateChild(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ notes: 'Henry and Joseph remain distinct' }) }), { params: Promise.resolve({ id: joseph.id }) })
    expect(notesOnly.status).toBe(200)
    expect(await notesOnly.json()).toMatchObject({ familyId: johnny.familyId, family: { homeAddress: '2 Main St', fatherName: 'Mark' } })
  })
})
