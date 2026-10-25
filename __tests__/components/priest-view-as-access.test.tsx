import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'
const mocks = vi.hoisted(() => ({ role: 'PRIEST', allowed: false }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'priest', role: mocks.role, canUseViewAs: mocks.allowed }, impersonating: null }, update: vi.fn() }) }))
import { ViewAsMode } from '@/components/view-as-mode'
import { ViewAsAccessSwitch } from '@/components/view-as-access-switch'
beforeEach(() => {
  mocks.role = UserRole.PRIEST; mocks.allowed = false
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => { vi.unstubAllGlobals() })
describe('View as controls', () => {
  it('shows the read-only grant as a labeled checkbox', () => {
    const change = vi.fn()
    render(<ViewAsAccessSwitch checked={false} onChange={change} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Allow View as' }))
    expect(change).toHaveBeenCalledWith(true)
  })
  it.each([false, true])('opens the picker only for an enabled priest: %s', async enabled => {
    mocks.allowed = enabled
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
    render(<ViewAsMode />)
    fireEvent.keyDown(window, { ctrlKey: true, key: 'q' })
    if (enabled) await waitFor(() => expect(screen.getByRole('dialog', { name: 'View as another user' })).toBeInTheDocument())
    else expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it.each([UserRole.SERVANT_PREP, UserRole.MENTOR, UserRole.STUDENT, UserRole.SERVANT, UserRole.PARENT])('opens for an explicitly enabled %s', async role => {
    mocks.role = role; mocks.allowed = true
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
    render(<ViewAsMode />)
    fireEvent.keyDown(window, { ctrlKey: true, key: 'q' })
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'View as another user' })).toBeInTheDocument())
  })
  it('shows automatic Super Admin access without a redundant editable grant', () => {
    render(<ViewAsAccessSwitch checked={false} onChange={vi.fn()} hasAutomaticAccess />)
    expect(screen.getByRole('checkbox', { name: 'Allow View as' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Allow View as' })).toBeDisabled()
  })
})
