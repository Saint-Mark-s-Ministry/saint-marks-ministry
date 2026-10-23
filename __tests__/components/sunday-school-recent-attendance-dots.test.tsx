import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecentAttendanceDots } from '@/components/sunday-school-recent-attendance-dots'

describe('RecentAttendanceDots', () => {
  it('summarizes the recent meetings for screen readers, counting unrecorded weeks', () => {
    render(<RecentAttendanceDots statuses={['PRESENT', 'ABSENT', 'ABSENT', null, 'LATE', 'ABSENT']} />)
    expect(screen.getByRole('img', { name: 'Last 6 meetings: 1 present, 3 absent, 1 not recorded, 1 late' })).toBeInTheDocument()
  })

  it('shows nothing before the class has any history', () => {
    const { container } = render(<RecentAttendanceDots statuses={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
