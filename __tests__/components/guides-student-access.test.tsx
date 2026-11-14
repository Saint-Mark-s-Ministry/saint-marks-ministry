import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ status: 'authenticated', data: { user: { role: 'STUDENT', sundaySchool: { hasAccess: false } } } }) }))
import { Guides } from '@/components/guides'
import { canViewGuides } from '@/lib/roles'

describe('Guides for Servants Prep students', () => {
  it('denies the STUDENT role only', () => {
    expect(canViewGuides('STUDENT')).toBe(false)
    for (const role of ['SUPER_ADMIN', 'PRIEST', 'SERVANT_PREP', 'MENTOR', 'PARENT', 'SERVANT'] as const) expect(canViewGuides(role)).toBe(true)
  })

  it('redirects a student away without rendering any guide', () => {
    const { container } = render(<Guides />)
    expect(push).toHaveBeenCalledWith('/dashboard')
    expect(container.querySelector('article')).toBeNull()
    expect(container.textContent).not.toContain('Create and use a passkey')
  })
})
