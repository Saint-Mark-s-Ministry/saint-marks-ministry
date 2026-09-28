import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AttendanceStatusButtons } from '@/components/attendance-status-buttons'

describe('AttendanceStatusButtons', () => {
  it('keeps all Servants Prep attendance choices by default', () => {
    render(
      <AttendanceStatusButtons
        currentStatus="PRESENT"
        onStatusChange={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Present' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Late' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Absent' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Excused (not counted)' })).toBeInTheDocument()
  })

  it('offers Not present without Excused and allows an unmarked state for Sunday School', async () => {
    const onStatusChange = vi.fn()
    const user = userEvent.setup()

    render(
      <AttendanceStatusButtons
        onStatusChange={onStatusChange}
        showExcused={false}
        absentLabel="Not present"
      />
    )

    expect(screen.queryByRole('button', { name: /excused/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Not present' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Present' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Late' })).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: 'Present' }))
    expect(onStatusChange).toHaveBeenCalledWith('PRESENT')
  })
})
