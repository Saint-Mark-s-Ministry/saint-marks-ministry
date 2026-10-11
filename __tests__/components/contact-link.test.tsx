import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContactLink } from '@/components/contact-link'

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

function setUserAgent(userAgent: string, platform: string) {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent)
  vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ContactLink', () => {
  it('opens an iOS action sheet with call, message, and FaceTime links', () => {
    setUserAgent(IPHONE_UA, 'iPhone')
    render(<ContactLink kind="phone" value="(555) 123-4567" name="Mariam Girgis" label="mother's phone number" />)

    fireEvent.click(screen.getByRole('button', { name: "Contact options for mother's phone number (Mariam Girgis)" }))

    const sheet = screen.getByRole('dialog', { name: 'Mariam Girgis' })
    expect(sheet).toHaveTextContent('(555) 123-4567')
    expect(screen.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:5551234567')
    expect(screen.getByRole('link', { name: 'Message' })).toHaveAttribute('href', 'sms:5551234567')
    expect(screen.getByRole('link', { name: 'FaceTime' })).toHaveAttribute('href', 'facetime:5551234567')
    expect(screen.getByRole('button', { name: 'Copy Number' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('shows a dropdown on desktop with an email link', async () => {
    setUserAgent(WINDOWS_UA, 'Win32')
    const user = userEvent.setup()
    render(<ContactLink kind="email" value="mom@example.com" label="mother's email" />)

    await user.click(screen.getByRole('button', { name: "Contact options for mother's email" }))

    expect(await screen.findByRole('menuitem', { name: 'Send Email' })).toHaveAttribute('href', 'mailto:mom@example.com')
    expect(screen.getByRole('menuitem', { name: 'Copy Email' })).toBeInTheDocument()
  })
})
