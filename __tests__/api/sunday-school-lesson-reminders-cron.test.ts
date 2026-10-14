import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('@/lib/sunday-school-lesson-reminders', () => ({ sendSundaySchoolLessonReminders: mocks.send }))
import { GET } from '@/app/api/cron/sunday-school-lesson-reminders/route'

describe('lesson reminder cron', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CRON_SECRET', 'secret')
    mocks.send.mockResolvedValue({ lessons: 2, sent: 1 })
  })
  it('rejects absent, wrong, and unconfigured secrets', async () => {
    expect((await GET(new Request('http://localhost'))).status).toBe(401)
    expect((await GET(new Request('http://localhost', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401)
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(new Request('http://localhost', { headers: { authorization: 'Bearer secret' } }))).status).toBe(401)
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('runs reminders for an authenticated invocation', async () => {
    const response = await GET(new Request('http://localhost', { headers: { authorization: 'Bearer secret' } }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, lessons: 2, sent: 1 })
  })
})
