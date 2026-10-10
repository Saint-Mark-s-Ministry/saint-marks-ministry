import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ pathname: '/dashboard/admin', router: { push: vi.fn() } }))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => mocks.router,
}))

import { NavigationTransition } from '@/components/navigation-transition'

function Example() {
  return <><NavigationTransition /><a href="/dashboard/servants">Sunday School</a></>
}

describe('navigation transitions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.pathname = '/dashboard/admin'
    mocks.router.push.mockClear()
    window.history.replaceState({}, '', mocks.pathname)
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('navigates immediately without hiding the current page or showing a floating status', () => {
    const { rerender } = render(<Example />)
    fireEvent.click(screen.getByRole('link'))
    expect(document.documentElement).not.toHaveClass('page-transition-out')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(mocks.router.push).toHaveBeenCalledWith('/dashboard/servants')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    mocks.pathname = '/dashboard/servants'
    rerender(<Example />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(document.documentElement).not.toHaveClass('page-transition-out')
    expect(document.documentElement).toHaveClass('page-transition-in')
    act(() => { vi.advanceTimersByTime(200) })
    expect(document.documentElement).not.toHaveClass('page-transition-in')
  })

  it('keeps the current screen visible throughout a slow navigation', () => {
    render(<Example />)
    fireEvent.click(screen.getByRole('link'))
    act(() => { vi.advanceTimersByTime(2120) })
    expect(document.documentElement).not.toHaveClass('page-transition-out')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not intercept modified clicks', () => {
    render(<Example />)
    fireEvent.click(screen.getByRole('link'), { ctrlKey: true })
    expect(document.documentElement).not.toHaveClass('page-transition-out')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(mocks.router.push).not.toHaveBeenCalled()
  })
})
