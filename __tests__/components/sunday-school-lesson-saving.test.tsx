import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({
  lessons: [] as Array<Record<string, unknown>>,
  mutate: vi.fn(),
}))
vi.mock('@/hooks/useSundaySchoolGuard', () => ({ useSundaySchoolGuard: () => ({ status: 'authenticated', session: { user: { id: 'servant-1' } } }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => '/dashboard/servants/lessons', useSearchParams: () => new URLSearchParams('view=list') }))
vi.mock('@/lib/swr', () => ({
  useSundaySchoolLessons: () => ({ data: { lessons: mocks.lessons }, isLoading: false, mutate: mocks.mutate }),
  useSundaySchoolAgeGroups: () => ({ data: [] }),
  useLiturgicalCalendar: () => ({ data: undefined }),
}))
vi.mock('@/components/sunday-school-lesson-subscribe', () => ({ SundaySchoolLessonSubscribe: () => null }))
vi.mock('@/components/sunday-school-lesson-import', () => ({ SundaySchoolLessonImport: () => null }))
import LessonsPage from '@/app/dashboard/servants/lessons/page'

const initial = () => ({ id: 'lesson-1', classId: 'class-1', sundayDate: '2099-11-15T00:00:00Z', title: 'Original title', ownerId: 'servant-1', owner: { id: 'servant-1', name: 'Demo Servant' }, class: { id: 'class-1', name: 'Grade 3', level: 'GRADE_3' }, resources: [{ id: 'link-1', title: 'Slides', url: 'https://example.com/slides' }], status: 'READY', canEdit: true, canAssignOwner: false, eligibleOwners: [] })
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
async function openEditor() {
  const user = userEvent.setup()
  render(<LessonsPage />)
  await user.click(screen.getByRole('button', { name: 'Edit lesson' }))
  return user
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.lessons = [initial()]
  mocks.mutate.mockImplementation(async (update?: (current: { lessons: typeof mocks.lessons }) => { lessons: typeof mocks.lessons }) => {
    if (!update) throw new Error('Schedule refresh unavailable')
    mocks.lessons = update({ lessons: mocks.lessons }).lessons
  })
})

describe('servant lesson saves', () => {
  it('shows a confirmed save without depending on a second schedule request', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => response({ ...initial(), ...JSON.parse(String(init.body)) })))
    const user = await openEditor()
    await user.clear(screen.getByLabelText('Lesson title'))
    await user.type(screen.getByLabelText('Lesson title'), 'Saved title')
    await user.click(screen.getByRole('button', { name: 'Save lesson' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Saved title')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit lesson' }))
    expect(screen.getByLabelText('Lesson title')).toHaveValue('Saved title')
  })

  it('ignores an unused blank link row while preserving the entered resource', async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      if (body.resources.some((r: { title: string; url: string }) => !r.title || !r.url)) return response({ error: 'Each resource needs a title and URL' }, 400)
      return response({ ...initial(), ...body })
    })
    vi.stubGlobal('fetch', fetcher)
    const user = await openEditor()
    await user.click(screen.getByRole('button', { name: 'Add link' }))
    await user.click(screen.getByRole('button', { name: 'Save lesson' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: /Slides/ })).toHaveAttribute('href', 'https://example.com/slides')
  })

  it('identifies an incomplete resource before sending a save and retains the draft', async () => {
    const fetcher = vi.fn(async () => response({ error: 'Each resource needs a title and URL' }, 400))
    vi.stubGlobal('fetch', fetcher)
    const user = await openEditor()
    await user.click(screen.getByRole('button', { name: 'Add link' }))
    await user.type(screen.getByLabelText('Link 2 URL'), 'https://example.com/worksheet')
    await user.click(screen.getByRole('button', { name: 'Save lesson' }))
    expect(fetcher).not.toHaveBeenCalled()
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent(/name.*link 2/i)
    expect(screen.getByLabelText('Link 2 URL')).toHaveValue('https://example.com/worksheet')
  })

  it('does not discard or replace a draft while the save request is in flight', async () => {
    let complete: ((response: Response) => void) | undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { complete = resolve })))
    const user = await openEditor()
    await user.click(screen.getByRole('button', { name: 'Save lesson' }))
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await act(async () => complete?.(response(initial())))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps edits after a connection failure and allows a successful retry', async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementationOnce(async (_url: string, init: RequestInit) => response({ ...initial(), ...JSON.parse(String(init.body)) }))
    vi.stubGlobal('fetch', fetcher)
    const user = await openEditor()
    await user.clear(screen.getByLabelText('Lesson title'))
    await user.type(screen.getByLabelText('Lesson title'), 'Retained draft')
    await user.click(screen.getByRole('button', { name: 'Save lesson' }))
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Your changes are still here')
    expect(screen.getByLabelText('Lesson title')).toHaveValue('Retained draft')
    await user.click(screen.getByRole('button', { name: 'Save lesson' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Retained draft')).toBeInTheDocument()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
