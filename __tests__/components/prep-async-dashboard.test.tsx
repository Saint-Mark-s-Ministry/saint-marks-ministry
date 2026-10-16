import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ isAsync: true, assigned: false, updateRequired: true }))
vi.mock('@/hooks/useAdminGuard', () => ({ useAdminGuard: () => ({
  status: 'authenticated', session: { user: { id: 'student', name: 'Test Student' } },
}) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/liturgical/today-in-church', () => ({ TodayInChurch: () => null }))
import StudentDashboard from '@/app/dashboard/student/page'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => url === '/api/academic-years' ? [] : {
      mentorUpdateRequired: mocks.updateRequired,
      enrollment: { mentor: mocks.assigned ? { id: 'assigned', name: 'Assigned Mentor', email: 'assigned@example.invalid', phone: null } : null, mentorContact: { name: 'Submitted Mentor', email: 'submitted@example.invalid', phone: '555' }, isAsyncStudent: mocks.isAsync, yearLevel: mocks.isAsync ? null : 'YEAR_2', student: { name: 'Test Student' } },
      attendance: { percentage: 75, met: true, effectivePresent: 3, totalLessons: 4, allLessons: 4, required: 75, presentCount: 3, lateCount: 0, absentCount: 1, excusedCount: 0 },
      exams: { overallAverage: null, examsTaken: 0, totalApplicableExams: 0, requiredAverage: 75, sectionAverages: [], missingExams: [], overallAverageMet: true },
      graduation: { eligible: false, attendanceMet: true, overallAverageMet: true, allSectionsPassing: true, sundaySchoolMet: false },
      sundaySchool: { assignments: [], needsRotation: false },
    },
  })))
})

describe('Prep student dashboard attendance labels', () => {
  it('shows rotation attendance and guidance for async students', async () => {
    mocks.isAsync = true
    render(<StudentDashboard />)
    expect(await screen.findByText('3.0 of 4 rotation weeks')).toBeInTheDocument()
    expect(screen.getByText('Your attendance is based solely on rotation weeks.')).toBeInTheDocument()
    expect(screen.getByText('All ten four-week rotations approved')).toBeInTheDocument()
    expect(screen.queryByText(/absence.*buffer remaining/)).not.toBeInTheDocument()
    expect(screen.queryByText('3.0 of 4 lessons')).not.toBeInTheDocument()
  })

  it('keeps lesson attendance for in-person students', async () => {
    mocks.isAsync = false
    render(<StudentDashboard />)
    expect(await screen.findByText('3.0 of 4 lessons')).toBeInTheDocument()
    expect(screen.queryByText('Your attendance is based solely on rotation weeks.')).not.toBeInTheDocument()
  })
  it('shows Not assigned even when mentor contact details were submitted', async () => {
    mocks.assigned = false
    mocks.updateRequired = true
    render(<StudentDashboard />)
    expect(await screen.findByText('Not assigned')).toBeInTheDocument()
    expect(screen.queryByText('Submitted Mentor')).not.toBeInTheDocument()
    expect(screen.getByText('Update Required')).toBeInTheDocument()
  })

  it('shows only the assigned account and removes the badge after review', async () => {
    mocks.assigned = true
    mocks.updateRequired = false
    render(<StudentDashboard />)
    expect(await screen.findByText('Assigned Mentor')).toBeInTheDocument()
    expect(screen.queryByText('Submitted Mentor')).not.toBeInTheDocument()
    expect(screen.queryByText('Update Required')).not.toBeInTheDocument()
  })

})
