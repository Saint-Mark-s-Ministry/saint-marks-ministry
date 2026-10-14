import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RegistrationNameMatchWarning } from '@/components/registration-name-match-warning'

describe('registration name match warning', () => {
  it('shows all matched accounts and flags disabled ones without declaring a confirmed duplicate', () => {
    render(<RegistrationNameMatchWarning matches={[
      { id: 'one', name: 'Same Name', email: 'first@example.com', isDisabled: false },
      { id: 'two', name: 'Same Name', email: 'second@example.com', isDisabled: true },
    ]} />)
    const warning = screen.getByRole('alert')
    expect(warning).toHaveTextContent('Possible duplicate registration — exact name match')
    expect(warning).toHaveTextContent('first@example.com')
    expect(warning).toHaveTextContent('second@example.com')
    expect(warning).toHaveTextContent('Disabled account')
    expect(warning).toHaveTextContent('Approval remains available')
  })
  it('renders no warning when there are no matches', () => {
    render(<RegistrationNameMatchWarning matches={[]} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('uses servant application wording for Sunday School reviews', () => {
    render(<RegistrationNameMatchWarning
      applicationType="servant application"
      matches={[{ id: 'one', name: 'Same Name', email: 'servant@example.com', isDisabled: false }]}
    />)
    expect(screen.getByRole('alert')).toHaveTextContent('Possible duplicate servant application — exact name match')
    expect(screen.getByRole('alert')).toHaveTextContent('servant@example.com')
  })
})
