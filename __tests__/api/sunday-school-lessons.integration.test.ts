// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const auth = vi.hoisted(() => ({ user: null as { id: string; role: UserRole } | null }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: async () => { if (!auth.user) throw new Error('Unauthorized'); return auth.user } }))
import { prisma } from '@/lib/prisma'
import { PATCH } from '@/app/api/sunday-school/lessons/[id]/route'
import { GET } from '@/app/api/sunday-school/lessons/route'

const enabled = process.env.RUN_LESSON_SAVE_INTEGRATION === '1'
const prefix = `lesson-test-${randomUUID()}`
const ids = { servant: `${prefix}-servant`, teacher: `${prefix}-teacher`, outsider: `${prefix}-outsider`, class: `${prefix}-class`, lesson: `${prefix}-lesson` }
let created = false
const edit = (body: unknown) => PATCH(new Request('http://localhost/api/sunday-school/lessons/' + ids.lesson, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: ids.lesson }) })
const read = () => GET(new Request(`http://localhost/api/sunday-school/lessons?scope=year&classId=${ids.class}`))

describe.skipIf(!enabled)('lesson saves against isolated PostgreSQL', () => {
  beforeAll(async () => {
    const host = new URL(process.env.SP_DATABASE_URL ?? '').hostname
    if (process.env.GUIDES_TEST_BRANCH_ID !== 'br-misty-shadow-ademqx82' || host !== 'ep-wispy-sea-ad9k4oor-pooler.c-2.us-east-1.aws.neon.tech') throw new Error('These tests require the dedicated isolated lesson rehearsal branch')
    const year = await prisma.academicYear.findFirstOrThrow({ where: { isActive: true } })
    const sundayYear = await prisma.sundaySchoolYear.findFirstOrThrow({ where: { status: 'OPEN' }, orderBy: { startDate: 'desc' } })
    created = true
    for (const [id, role] of [[ids.servant, UserRole.SERVANT], [ids.teacher, UserRole.SERVANT], [ids.outsider, UserRole.SERVANT_PREP]] as const) {
      await prisma.user.create({ data: { id, email: `${id}@example.invalid`, name: 'Synthetic lesson tester', password: 'not-a-login-password', role, mustChangePassword: false } })
    }
    await prisma.sundaySchoolClass.create({ data: { id: ids.class, name: prefix, sectionName: prefix, level: 'GRADE_3', academicYearId: year.id, sundaySchoolYearId: sundayYear.id } })
    for (const userId of [ids.servant, ids.teacher]) await prisma.sundaySchoolServantAssignment.create({ data: { userId, classId: ids.class, academicYearId: year.id, sundaySchoolYearId: sundayYear.id, authority: 'SERVANT' } })
    await prisma.sundaySchoolWeeklyLesson.create({ data: { id: ids.lesson, classId: ids.class, sundayDate: new Date('2026-11-14T00:00:00Z'), ownerId: ids.teacher } })
  }, 30000)
  beforeEach(async () => {
    auth.user = { id: ids.servant, role: UserRole.SERVANT }
    await prisma.sundaySchoolWeeklyLesson.update({ where: { id: ids.lesson }, data: { title: 'Before', ownerId: ids.teacher, resources: { deleteMany: {} } } })
  })
  afterAll(async () => {
    if (!created) return
    await prisma.sundaySchoolWeeklyLesson.deleteMany({ where: { id: ids.lesson } })
    await prisma.sundaySchoolServantAssignment.deleteMany({ where: { classId: ids.class } })
    await prisma.sundaySchoolClass.deleteMany({ where: { id: ids.class } })
    await prisma.user.deleteMany({ where: { id: { in: [ids.servant, ids.teacher, ids.outsider] } } })
    await prisma.$disconnect()
  }, 30000)

  it('persists named links, reloads them in order, and allows a class servant who is not the teacher', async () => {
    const resources = [{ title: 'Slides', url: 'https://docs.google.com/presentation/d/demo/edit?usp=sharing' }, { title: 'Worksheet', url: 'https://example.com/worksheet.pdf' }]
    const saved = await edit({ title: 'Saved lesson', resources })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({ title: 'Saved lesson', status: 'READY' })
    const schedule = await read()
    expect(schedule.status).toBe(200)
    const { lessons } = await schedule.json()
    expect(lessons).toHaveLength(1)
    expect(lessons[0]).toMatchObject({ title: 'Saved lesson', ownerId: ids.teacher, canEdit: true, status: 'READY' })
    expect(lessons[0].resources.map((r: { title: string; url: string }) => ({ title: r.title, url: r.url }))).toEqual(resources)
    expect(await prisma.sundaySchoolWeeklyLessonResource.count({ where: { weeklyLessonId: ids.lesson } })).toBe(2)
  }, 30000)

  it('rejects incomplete and local-file links without deleting previously saved resources', async () => {
    await edit({ resources: [{ title: 'Keep me', url: 'https://example.com/keep' }] })
    for (const resources of [[{ title: '', url: 'https://example.com/worksheet' }], [{ title: 'Local file', url: 'file:///lesson.pptx' }], [{ title: 'Slides', url: 'docs.google.com/presentation/d/demo' }]]) {
      expect((await edit({ resources })).status).toBe(400)
      const saved = await prisma.sundaySchoolWeeklyLessonResource.findMany({ where: { weeklyLessonId: ids.lesson } })
      expect(saved.map(r => r.title)).toEqual(['Keep me'])
    }
  }, 30000)

  it('keeps resources on title-only edits and replaces them on a later confirmed resource save', async () => {
    await edit({ resources: [{ title: 'Original', url: 'https://example.com/original' }] })
    expect((await edit({ title: 'New title' })).status).toBe(200)
    expect(await prisma.sundaySchoolWeeklyLessonResource.count({ where: { weeklyLessonId: ids.lesson } })).toBe(1)
    await edit({ resources: [{ title: 'Replacement', url: 'https://example.com/replacement' }] })
    const { lessons } = await (await read()).json()
    expect(lessons[0].title).toBe('New title')
    expect(lessons[0].resources.map((r: { title: string }) => r.title)).toEqual(['Replacement'])
  }, 30000)

  it('denies an unassigned prep account and an unauthenticated request', async () => {
    auth.user = { id: ids.outsider, role: UserRole.SERVANT_PREP }
    expect((await edit({ title: 'Forbidden' })).status).toBe(403)
    auth.user = null
    expect((await edit({ title: 'Forbidden' })).status).toBe(401)
    expect((await prisma.sundaySchoolWeeklyLesson.findUniqueOrThrow({ where: { id: ids.lesson } })).title).toBe('Before')
  }, 30000)

  it('serializes simultaneous saves into one complete lesson, without mixed or duplicated resources', async () => {
    const changes = ['First', 'Second'].map(title => ({ title, resources: [{ title, url: `https://example.com/${title.toLowerCase()}` }] }))
    const responses = await Promise.all(changes.map(edit))
    expect(responses.map(response => response.status)).toEqual([200, 200])
    const saved = await prisma.sundaySchoolWeeklyLesson.findUniqueOrThrow({ where: { id: ids.lesson }, include: { resources: true } })
    expect(saved.resources).toHaveLength(1)
    expect(saved.resources[0].title).toBe(saved.title)
  }, 30000)
})
