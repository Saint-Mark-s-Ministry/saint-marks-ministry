import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ReplaceStudentAccountDialog } from '@/components/replace-student-account-dialog'

function showDialog(onConfirm = vi.fn().mockResolvedValue(true)) {
  render(<ReplaceStudentAccountDialog applicant={{ name: 'Nori', email: 'new@example.com' }} oldAccount={{ id: 'old', name: 'Nori', email: 'old@example.com' }} yearLevel="YEAR_2" busy={false} onConfirm={onConfirm} />)
  fireEvent.click(screen.getByRole('button', { name: 'Approve and replace old account' }))
  return onConfirm
}

describe('replacement account history prompt', () => {
  it('requires a deliberate choice and identifies the old and new accounts', () => {
    const confirm = showDialog()
    expect(screen.getByRole('alertdialog')).toHaveTextContent('new@example.com')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('old@example.com')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Year 2')
    expect(screen.getByRole('button', { name: 'Approve and transfer SP history' })).toBeDisabled()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('submits the transfer choice only when approval is confirmed', async () => {
    const confirm = showDialog()
    fireEvent.click(screen.getByRole('radio', { name: /Yes, transfer SP history/ }))
    expect(confirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Approve and transfer SP history' }))
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('old', true))
  })

  it('explains permanent deletion and submits the explicit fresh-record choice', async () => {
    const confirm = showDialog()
    fireEvent.click(screen.getByRole('radio', { name: /No, start with a fresh SP record/ }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('permanently deleted')
    fireEvent.click(screen.getByRole('button', { name: 'Approve and delete old records' }))
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('old', false))
  })

  it('retains the prompt and choice if approval fails', async () => {
    const confirm = showDialog(vi.fn().mockResolvedValue(false))
    fireEvent.click(screen.getByRole('radio', { name: /Yes, transfer SP history/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Approve and transfer SP history' }))
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce())
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Yes, transfer SP history/ })).toBeChecked()
  })
})
