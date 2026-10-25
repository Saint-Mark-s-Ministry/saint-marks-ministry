import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SundaySchoolRosterLinkDialog } from '@/components/sunday-school-roster-link-dialog'

const fetchMock = vi.fn()
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockImplementation(async (_url, options) => ({
    ok: true, json: async () => options?.method === 'POST' ? { token: 'test-contact-token' } : [],
  }))
})

describe('contact QR dialog', () => {
  it('offers only a contact QR and creates a temporary link for the selected class and purpose', async () => {
    render(<SundaySchoolRosterLinkDialog contactUpdateOnly classId="class-10-a" className="10th Grade A" onSuccess={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Sign-up QR' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Contact update QR' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('10th Grade A')
    expect(screen.getByText('This QR code expires after two hours.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Expires in')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Submission limit')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/sunday-school/roster-links?classId=class-10-a&contactUpdateOnly=true')
    await userEvent.click(screen.getByRole('button', { name: 'Create contact update link' }))
    const post = fetchMock.mock.calls.find(call => call[1]?.method === 'POST')
    expect(JSON.parse(post![1].body)).toEqual({ classId: 'class-10-a', contactUpdateOnly: true, label: '' })
    expect(await screen.findByText(/Anyone with the link and a child’s name and birth date/)).toBeInTheDocument()
    expect(screen.getByText('10th Grade A', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeEnabled()
  })

  it('closes the exact existing contact link and refreshes the class-scoped list', async () => {
    const link = { id: 'link-a', label: 'Sunday contacts', state: 'ACTIVE', expiresAt: new Date(Date.now() + 3600000).toISOString(), maxUses: 40, useCount: 2, childCount: 0, createdBy: { name: 'Class servant' } }
    fetchMock.mockImplementation(async (_url, options) => ({ ok: true, json: async () => options?.method === 'DELETE' ? { success: true } : [link] }))
    render(<SundaySchoolRosterLinkDialog contactUpdateOnly classId="class-10-a" className="10th Grade A" onSuccess={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Contact update QR' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Close link' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/sunday-school/roster-links/link-a', { method: 'DELETE' })
    expect(screen.queryByText(/joined/)).not.toBeInTheDocument()
  })
})
