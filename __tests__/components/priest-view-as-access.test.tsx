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
describe('priest View as controls', () => {
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
  it('never opens for another role even with a stale enabled flag', () => {
    mocks.role = UserRole.SERVANT_PREP; mocks.allowed = true
    render(<ViewAsMode />)
    fireEvent.keyDown(window, { ctrlKey: true, key: 'q' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
