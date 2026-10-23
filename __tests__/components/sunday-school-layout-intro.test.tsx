import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  session: { user: { id: 'servant-1' } } as Record<string, unknown>,
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: mocks.session, status: 'authenticated' }),
}))

import { SundaySchoolLayoutIntro } from '@/components/sunday-school-layout-intro'

describe('Sunday School layout intro', () => {
  beforeEach(() => {
    window.localStorage.clear()
    mocks.session = { user: { id: 'servant-1' } }
  })

  it('explains the five places once, then stays dismissed for that person', async () => {
    const { unmount } = render(<SundaySchoolLayoutIntro />)
    expect(await screen.findByRole('heading', { name: 'Sunday School has a simpler layout' })).toBeInTheDocument()
    for (const place of ['Home', 'Attendance', 'Children', 'Care', 'Lessons']) {
      expect(screen.getByText(place)).toBeInTheDocument()
    }

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('heading', { name: 'Sunday School has a simpler layout' })).not.toBeInTheDocument()

    unmount()
    render(<SundaySchoolLayoutIntro />)
    expect(screen.queryByRole('heading', { name: 'Sunday School has a simpler layout' })).not.toBeInTheDocument()
  })

  it('still shows for another person on the same device', async () => {
    window.localStorage.setItem('sunday-school-layout-intro-dismissed:servant-1', 'true')
    mocks.session = { user: { id: 'servant-2' } }
    render(<SundaySchoolLayoutIntro />)
    expect(await screen.findByRole('heading', { name: 'Sunday School has a simpler layout' })).toBeInTheDocument()
  })

  it('never dismisses it for the person an admin is viewing as', async () => {
    mocks.session = { user: { id: 'servant-1' }, impersonating: true }
    render(<SundaySchoolLayoutIntro />)
    fireEvent.click(await screen.findByRole('button', { name: 'Got it' }))
    expect(window.localStorage.getItem('sunday-school-layout-intro-dismissed:servant-1')).toBeNull()
  })
})
