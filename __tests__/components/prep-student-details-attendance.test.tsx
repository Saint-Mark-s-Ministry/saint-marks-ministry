import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EditableStudent } from '@/components/student-program-editor'
vi.mock('@/components/student-program-editor', () => ({ StudentProgramEditor: () => null }))
vi.mock('@/components/admin/confession-tracker', () => ({ ConfessionTracker: () => null }))
vi.mock('@/components/admin/attendance-slips-panel', () => ({ AttendanceSlipsPanel: () => null }))
import { StudentDetailsModal } from '@/components/student-details-modal'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })))
})

const student: EditableStudent = {
  id: 'student', name: 'Async Student', email: '', phone: null, profileImageUrl: null, role: 'STUDENT', isDisabled: false,
  enrollments: [{ id: 'enrollment', studentId: 'student', yearLevel: null, status: 'ACTIVE', academicYearId: null,
    attendanceStartDate: null, enrolledAt: '2026-10-01', mentorId: null, fatherOfConfessionId: null,
    isAsyncStudent: true, asyncReason: null }],
}

describe('Async student admin attendance tab', () => {
  it('explains the rotation exemption instead of showing stale absences or a lesson rate', async () => {
    const user = userEvent.setup()
    render(<StudentDetailsModal studentId="student" studentName="Async Student" student={student}
      loading={false} examScores={[]} attendanceRecords={[{
        id: 'legacy', status: 'ABSENT', lesson: { id: 'lesson', title: 'October 2 lesson', scheduledDate: '2026-10-02',
          examSection: { id: 'section', name: 'BIBLE_STUDIES', displayName: 'Bible Studies', yearLevel: 'YEAR_1' } },
      }]} onClose={vi.fn()} onRefresh={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Attendance' }))
    expect(screen.getByText(/Attendance is based solely on rotation weeks/)).toBeInTheDocument()
    expect(screen.queryByText('Overall Attendance')).not.toBeInTheDocument()
    expect(screen.queryByText('October 2 lesson')).not.toBeInTheDocument()
  })
})
