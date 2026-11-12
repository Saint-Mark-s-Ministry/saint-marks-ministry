import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/hooks/useAdminGuard', () => ({ useAdminGuard: () => ({ status: 'authenticated', session: { user: { role: 'PARENT', sundaySchool: { hasAccess: false } } } }) }))
import { Guides } from '@/components/guides'
import { PASSKEY_GUIDE_HREF } from '@/lib/guides'

describe('shared account guide', () => {
  it('lets an account without Sunday School staff access reach passkey help and My account', () => {
    render(<Guides />)
    expect(screen.getByRole('link', { name: 'Open My account' })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('heading', { name: 'Create and use a passkey' }).closest('article')).toHaveAttribute('id', PASSKEY_GUIDE_HREF.split('#')[1])
    expect(screen.queryByRole('link', { name: 'Open Children' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open Lessons' })).not.toBeInTheDocument()
  })
})
