import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({
  trigger: vi.fn(), reset: vi.fn(), hook: vi.fn(),
  data: undefined as { feedUrl: string; className: string } | undefined,
}))
vi.mock('@/lib/swr', () => ({
  useLessonCalendarSubscription: (classId: string) => {
    mocks.hook(classId)
    return { trigger: mocks.trigger, reset: mocks.reset, data: mocks.data, isMutating: false, error: undefined }
  },
}))
import { COPTIC_CALENDAR_FEED_URL, calendarSubscriptionLinks } from '@/lib/liturgical'
import { SundaySchoolLessonSubscribe } from '@/components/sunday-school-lesson-subscribe'

const classes = [{ id: 'class-1', name: '10th Grade' }, { id: 'class-2', name: '11th Grade' }]
beforeEach(() => { vi.clearAllMocks(); mocks.data = undefined; mocks.trigger.mockResolvedValue({}) })

describe('class lesson calendar subscription', () => {
  it('uses the selected class and waits for an explicit request before creating a link', async () => {
    render(<SundaySchoolLessonSubscribe classes={classes} selectedClassId="class-1" />)
    expect(mocks.trigger).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Add lessons to calendar' }))
    expect(screen.getByRole('combobox', { name: 'Class' })).toHaveValue('class-1')
    await userEvent.click(screen.getByRole('button', { name: 'Get subscription link' }))
    expect(mocks.trigger).toHaveBeenCalledOnce()
  })
  it('requires choosing a class when viewing all classes and clears the previous link on change', async () => {
    render(<SundaySchoolLessonSubscribe classes={classes} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add lessons to calendar' }))
    expect(screen.getByRole('button', { name: 'Get subscription link' })).toBeDisabled()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Class' }), 'class-2')
    expect(mocks.hook).toHaveBeenLastCalledWith('class-2')
    expect(mocks.reset).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Get subscription link' })).toBeEnabled()
  })
  it('offers Apple and Google subscription links for the published feed', async () => {
    mocks.data = { feedUrl: 'https://stmarkministry.app/api/public/lesson-calendar/test.ics', className: '10th Grade' }
    render(<SundaySchoolLessonSubscribe classes={classes} selectedClassId="class-1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Add lessons to calendar' }))
    expect(screen.getByRole('link', { name: 'Open Apple Calendar / Outlook' })).toHaveAttribute('href', 'webcal://stmarkministry.app/api/public/lesson-calendar/test.ics')
    expect(screen.getByRole('link', { name: 'Open Google Calendar' })).toHaveAttribute('target', '_blank')
    expect(screen.getByText(/Keep this personal link private/)).toBeInTheDocument()
  })
  it('explains local previews without offering an unusable phone-calendar action', async () => {
    mocks.data = { feedUrl: 'http://localhost:3000/api/public/lesson-calendar/test.ics', className: '10th Grade' }
    render(<SundaySchoolLessonSubscribe classes={classes} selectedClassId="class-1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Add lessons to calendar' }))
    expect(screen.getByRole('status')).toHaveTextContent('after this update is published')
    expect(screen.queryByRole('link', { name: 'Open Apple Calendar / Outlook' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy calendar link' })).toBeEnabled()
  })
  it('disables personal calendar link creation while viewing as another user', () => {
    render(<SundaySchoolLessonSubscribe classes={classes} viewingAs />)
    expect(screen.getByRole('button', { name: 'Add lessons to calendar' })).toBeDisabled()
    expect(mocks.trigger).not.toHaveBeenCalled()
  })
})


describe('optional Coptic calendar subscription', () => {
  it('starts unchecked and reveals a public church subscription independently of the lesson link', async () => {
    render(<SundaySchoolLessonSubscribe classes={classes} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add lessons to calendar' }))
    const option = screen.getByRole('checkbox', { name: 'Also add the Coptic Orthodox calendar' })
    expect(option).not.toBeChecked()
    expect(screen.queryByRole('region', { name: 'Coptic Orthodox calendar subscription' })).not.toBeInTheDocument()
    await userEvent.click(option)
    const church = within(screen.getByRole('region', { name: 'Coptic Orthodox calendar subscription' }))
    const links = calendarSubscriptionLinks()
    expect(church.getByRole('link', { name: 'Apple Calendar / Outlook' })).toHaveAttribute('href', links.webcal)
    expect(church.getByRole('link', { name: 'Google Calendar' })).toHaveAttribute('href', links.google)
    expect(church.getByRole('link', { name: 'Outlook.com' })).toHaveAttribute('href', links.outlookWeb)
    expect(church.getByText(/second calendar/)).toBeInTheDocument()
    expect(mocks.trigger).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Get subscription link' })).toBeDisabled()
  })

  it('keeps the personal lesson URL out of every Coptic calendar link', async () => {
    mocks.data = { feedUrl: 'https://stmarkministry.app/api/public/lesson-calendar/personal-secret.ics', className: '10th Grade' }
    render(<SundaySchoolLessonSubscribe classes={classes} selectedClassId="class-1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Add lessons to calendar' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Also add the Coptic Orthodox calendar' }))
    const church = within(screen.getByRole('region', { name: 'Coptic Orthodox calendar subscription' }))
    for (const link of church.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toContain('personal-secret')
      expect(link.getAttribute('href')).not.toContain('stmarkministry.app')
    }
    expect(screen.getByRole('link', { name: 'Open Apple Calendar / Outlook' })).toHaveAttribute('href', 'webcal://stmarkministry.app/api/public/lesson-calendar/personal-secret.ics')
  })

  it('copies the church feed while the lesson feed is only available on localhost', async () => {
    const user = userEvent.setup()
    const copy = vi.spyOn(navigator.clipboard, 'writeText')
    mocks.data = { feedUrl: 'http://localhost:3000/api/public/lesson-calendar/local.ics', className: '10th Grade' }
    render(<SundaySchoolLessonSubscribe classes={classes} selectedClassId="class-1" />)
    await user.click(screen.getByRole('button', { name: 'Add lessons to calendar' }))
    await user.click(screen.getByRole('checkbox', { name: 'Also add the Coptic Orthodox calendar' }))
    await user.click(screen.getByRole('button', { name: 'Copy Coptic calendar link' }))
    expect(copy).toHaveBeenCalledWith(COPTIC_CALENDAR_FEED_URL)
    expect(screen.getByRole('link', { name: 'Google Calendar' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open Google Calendar' })).not.toBeInTheDocument()
  })

  it('hides the extra actions when unchecked and resets the opt-in when the dialog closes', async () => {
    const user = userEvent.setup()
    render(<SundaySchoolLessonSubscribe classes={classes} selectedClassId="class-1" />)
    await user.click(screen.getByRole('button', { name: 'Add lessons to calendar' }))
    const option = screen.getByRole('checkbox', { name: 'Also add the Coptic Orthodox calendar' })
    await user.click(option)
    await user.click(option)
    expect(screen.queryByRole('region', { name: 'Coptic Orthodox calendar subscription' })).not.toBeInTheDocument()
    await user.click(option)
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Add lessons to calendar' }))
    expect(screen.getByRole('checkbox', { name: 'Also add the Coptic Orthodox calendar' })).not.toBeChecked()
    expect(mocks.reset).toHaveBeenCalled()
  })
})
