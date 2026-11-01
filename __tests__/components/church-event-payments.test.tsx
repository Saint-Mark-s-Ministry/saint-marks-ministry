import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChurchEventPayments } from '@/components/church-event-payments'

describe('church event payments', () => {
  it('links directly to the church payment creator with safe new-tab behavior', () => {
    render(<ChurchEventPayments />)
    const link = screen.getByRole('link', { name: /create a payment link.*opens in a new tab/i })
    expect(link).toHaveAttribute('href', 'https://pray.saintmark.com/donate/create')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('heading', { name: 'Trip & event payments' })).toBeInTheDocument()
    expect(screen.getByText(/pay the church directly/)).toBeInTheDocument()
    expect(screen.getByText(/confirmation emails there/)).toBeInTheDocument()
  })
})
