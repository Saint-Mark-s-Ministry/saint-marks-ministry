import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AttendanceSavedBy } from '@/components/attendance-saved-by'

describe('weekly attendance recorder', () => {
  it('shows the persisted recorder and exact save timestamp', () => {
    const { container, rerender } = render(<AttendanceSavedBy info={{ savedAt: '2026-10-11T12:30:00Z', recorder: { id: 'u1', name: 'Mina Mark' } }} />)
    expect(screen.getByText('Mina Mark')).toBeInTheDocument()
    expect(container.querySelector('time')).toHaveAttribute('datetime', '2026-10-11T12:30:00Z')
    rerender(<AttendanceSavedBy info={null} />)
    expect(screen.getByText('Attendance not saved yet.')).toBeInTheDocument()
    expect(screen.queryByText('Mina Mark')).not.toBeInTheDocument()
  })
  it('labels a missing recorder honestly', () => {
    render(<AttendanceSavedBy info={{ savedAt: '2026-10-11T12:30:00Z', recorder: null }} />)
    expect(screen.getByText('Unknown recorder')).toBeInTheDocument()
  })
})
