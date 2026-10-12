import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SundaySchoolLevel } from '@prisma/client'
import type { RotationFormReview } from '@/types/rotation-forms'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), uploaded: vi.fn(), forms: [] as RotationFormReview[], refresh: vi.fn(), cacheRefresh: vi.fn() }))
vi.mock('@/lib/swr', () => ({ useSundaySchoolRotationForms: () => ({ data: mocks.forms, error: undefined, isLoading: false, mutate: mocks.refresh }) }))
vi.mock('swr', () => ({ mutate: mocks.cacheRefresh }))
import { RotationFormUpload } from '@/components/rotation-form-upload'
import { RotationFormsReview } from '@/components/rotation-forms-review'

const assignment = { assignmentId: 'rotation-1', startDate: '2026-09-06', totalWeeks: 4, isActive: true, rotationForm: null }
const form: RotationFormReview = {
  id: 'form-1', level: SundaySchoolLevel.GRADE_2, fileUrl: 'https://example.com/signed.pdf', filename: 'signed.pdf', version: 1,
  status: 'PENDING', reviewNotes: null, createdAt: '2026-10-01',
  assignment: { id: 'rotation-1', studentId: 'student-1', student: { id: 'student-1', name: 'Student' }, class: { id: 'second-2', name: '2nd Grade - 2', level: SundaySchoolLevel.GRADE_2 }, grade: 'GRADE_2', startDate: '2026-09-06', isActive: true },
}

describe('signed rotation form workflow UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.forms = [form]
    mocks.fetch.mockResolvedValue(Response.json({ status: 'PENDING' }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('requires a file and confirmation of four signed weeks, then uploads evidence for the current rotation', async () => {
    render(<RotationFormUpload assignment={assignment} onUploaded={mocks.uploaded} />)
    expect(screen.getByRole('button', { name: 'Upload rotation form' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Completed four-week form'), { target: { files: [new File(['signed'], 'signed.pdf', { type: 'application/pdf' })] } })
    expect(screen.getByRole('button', { name: 'Upload rotation form' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Upload rotation form' }))
    await waitFor(() => expect(mocks.uploaded).toHaveBeenCalledOnce())
    const data = mocks.fetch.mock.calls[0][1].body as FormData
    expect(data.get('assignmentId')).toBe('rotation-1')
    expect(data.get('completedWeeks')).toBe('4')
    expect(data.get('file')).toBeInstanceOf(File)
    expect(mocks.fetch.mock.calls[0][0]).toBe('/api/sunday-school/rotation-forms')
  })

  it('tells the student that a pending upload leaves them in their current class', () => {
    render(<RotationFormUpload assignment={{ ...assignment, rotationForm: form }} onUploaded={mocks.uploaded} />)
    expect(screen.getByText(/remain in this class until all four weeks are approved/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View submitted form' })).toHaveAttribute('href', form.fileUrl)
  })

  it('requires human verification and submits a versioned approval without letting the reviewer choose another grade', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ status: 'APPROVED', nextAssignment: { class: { name: '3rd Grade - 2' } } }))
    render(<RotationFormsReview canReview />)
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByRole('button', { name: 'Approve and advance' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Approve and advance' }))
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce())
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({ status: 'APPROVED', confirmedWeeks: 4, version: 1 })
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('shows forms to read-only reviewers without approval controls', () => {
    render(<RotationFormsReview canReview={false} />)
    expect(screen.getByRole('link', { name: 'View signed form' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument()
  })
})
