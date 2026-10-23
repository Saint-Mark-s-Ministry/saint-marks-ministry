import { createRef, type Ref } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ observe: vi.fn(), stop: vi.fn() }))
vi.mock('@/lib/animate-element-size', () => ({ observeAnimatedSize: mocks.observe }))
import { useAnimatedSize } from '@/hooks/use-animated-size'

function Box({ forwardedRef, text = 'Content' }: { forwardedRef: Ref<HTMLDivElement>; text?: string }) {
  return <div ref={useAnimatedSize(forwardedRef)}>{text}</div>
}
beforeEach(() => { vi.clearAllMocks(); mocks.observe.mockReturnValue(mocks.stop) })

it('preserves object refs, keeps observation stable on re-render, and cleans up on unmount', () => {
  const ref = createRef<HTMLDivElement>()
  const { rerender, unmount } = render(<Box forwardedRef={ref} />)
  expect(ref.current).toBe(screen.getByText('Content'))
  expect(mocks.observe).toHaveBeenCalledWith(ref.current)
  rerender(<Box forwardedRef={ref} text="Expanded content" />)
  expect(mocks.observe).toHaveBeenCalledOnce()
  unmount()
  expect(ref.current).toBeNull()
  expect(mocks.stop).toHaveBeenCalledOnce()
})

it('preserves React 19 callback-ref cleanup', () => {
  const release = vi.fn()
  const ref = vi.fn(() => release)
  const { unmount } = render(<Box forwardedRef={ref} />)
  expect(ref).toHaveBeenCalledWith(screen.getByText('Content'))
  unmount()
  expect(release).toHaveBeenCalledOnce()
  expect(mocks.stop).toHaveBeenCalledOnce()
})
