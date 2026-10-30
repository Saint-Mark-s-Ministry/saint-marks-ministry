import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), upload: vi.fn(), error: vi.fn(), success: vi.fn(),
  session: { user: { id: 'async-student', role: 'STUDENT', isAsyncStudent: true } },
}))
vi.mock('@/hooks/useAdminGuard', () => ({
  useAdminGuard: () => ({ session: mocks.session, status: 'authenticated' }),
}))
vi.mock('@vercel/blob/client', () => ({ put: mocks.upload }))
vi.mock('sonner', () => ({ toast: { error: mocks.error, success: mocks.success } }))
import ApplicationPage from '@/app/dashboard/student/application/page'

const mentorApplication = {
  application: {
    fatherOfConfessionName: null, approvalFormUrl: null, approvalFormFilename: null,
    mentorName: 'Existing Mentor', mentorPhone: '555-0100', mentorEmail: null,
  },
  complete: false, showChurchInformation: false, showApprovalForm: false,
  annualMentorRequired: true, academicYear: { id: 'year-1', name: '2026-2027' },
}

describe('Async student application', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', mocks.fetch)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('shows mentor confirmation without claiming a legacy registration was approved', async () => {
    mocks.fetch.mockResolvedValue(Response.json(mentorApplication))
    render(<ApplicationPage />)
    expect(await screen.findByLabelText("Mentor Servant's Name")).toHaveValue('Existing Mentor')
    expect(screen.queryByText('Registration approved')).not.toBeInTheDocument()
    expect(screen.queryByText('Approval Form')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm mentor information' })).toBeInTheDocument()
  })

  it('displays the real request error in a full-width card and allows retry', async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ error: 'Unable to load application' }, { status: 500 }))
    mocks.fetch.mockResolvedValueOnce(Response.json(mentorApplication))
    const { container } = render(<ApplicationPage />)
    expect(await screen.findByText('Unable to load application')).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('w-full', 'min-w-0')
    expect(screen.queryByText(/could not find an approved registration/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByLabelText("Mentor Servant's Name")).toHaveValue('Existing Mentor')
  })
})


const existingForm = {
  ...mentorApplication, showApprovalForm: true,
  application: { ...mentorApplication.application, approvalFormUrl: 'https://example.com/old.pdf', approvalFormFilename: 'old.pdf' },
}
const uploadPath = 'mentor-approval-forms/async-student/12345678-1234-1234-1234-123456789abc/scan.HEIC'

async function chooseFile(file = new File(['photo'], 'scan.HEIC', { type: 'image/heic' })) {
  const view = render(<ApplicationPage />)
  const input = await screen.findByLabelText('Replace form') as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
  return { ...view, input, file }
}

describe('Mentor approval form replacement', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.fetch.mockResolvedValueOnce(Response.json(existingForm))
    mocks.upload.mockResolvedValue({ pathname: uploadPath })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('accepts iPhone HEIC files and only replaces the saved link after server confirmation', async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ pathname: uploadPath, clientToken: 'scoped-token' }))
    mocks.fetch.mockResolvedValueOnce(Response.json({ url: 'https://example.com/new.HEIC?download=1', filename: 'scan.HEIC', complete: false }))
    const { input, file } = await chooseFile()
    expect(input).not.toHaveAttribute('accept')
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Approval form uploaded'))
    expect(mocks.upload).toHaveBeenCalledWith(uploadPath, file, expect.objectContaining({ token: 'scoped-token', contentType: 'application/octet-stream' }))
    expect(screen.getByRole('link', { name: 'View uploaded form' })).toHaveAttribute('href', 'https://example.com/new.HEIC?download=1')
    expect(mocks.fetch.mock.calls.slice(1).every(([, options]) => options.headers['Content-Type'] === 'application/json')).toBe(true)
  })

  it('uses multipart direct storage upload for files above the server-request limit', async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ pathname: uploadPath, clientToken: 'scoped-token' }))
    mocks.fetch.mockResolvedValueOnce(Response.json({ url: 'https://example.com/new.HEIC', filename: 'scan.HEIC', complete: false }))
    const file = new File([new Uint8Array(8 * 1024 * 1024)], 'scan.HEIC', { type: 'image/heic' })
    await chooseFile(file)
    await waitFor(() => expect(mocks.success).toHaveBeenCalledOnce())
    expect(mocks.upload).toHaveBeenCalledWith(uploadPath, file, expect.objectContaining({ multipart: true }))
  })

  it('handles a non-JSON hosting error without leaking Safari parse errors and permits retrying the same file', async () => {
    mocks.fetch.mockResolvedValueOnce(new Response('Request Entity Too Large', { status: 413 }))
    const { input, file } = await chooseFile()
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('100 MB')))
    expect(screen.getByRole('link', { name: 'View uploaded form' })).toHaveAttribute('href', 'https://example.com/old.pdf')
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(input).not.toBeDisabled()
    mocks.fetch.mockResolvedValueOnce(Response.json({ pathname: uploadPath, clientToken: 'scoped-token' }))
    mocks.fetch.mockResolvedValueOnce(Response.json({ url: 'https://example.com/new.HEIC', filename: 'scan.HEIC', complete: false }))
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(mocks.success).toHaveBeenCalledOnce())
  })

  it.each(['storage', 'confirmation', 'invalid-confirmation'])('keeps the existing form when %s fails', async (failure) => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ pathname: uploadPath, clientToken: 'scoped-token' }))
    if (failure === 'storage') mocks.upload.mockRejectedValue(new TypeError('Load failed'))
    else mocks.fetch.mockResolvedValueOnce(failure === 'confirmation'
      ? new Response('<html>temporarily unavailable</html>', { status: 503 })
      : Response.json({ complete: true }))
    const { input } = await chooseFile()
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
    expect(screen.getByRole('link', { name: 'View uploaded form' })).toHaveAttribute('href', 'https://example.com/old.pdf')
    expect(mocks.success).not.toHaveBeenCalled()
    expect(input).not.toBeDisabled()
    if (failure === 'storage') expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })

  it('rejects an empty file before requesting upload authorization', async () => {
    await chooseFile(new File([], 'empty.pdf', { type: 'application/pdf' }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('empty')))
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.upload).not.toHaveBeenCalled()
  })
})
