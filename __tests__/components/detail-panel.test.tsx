import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DetailPanel } from '@/components/ds/detail-panel'

describe('DetailPanel', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('opens directly as desktop details and switches to a sheet at narrower widths', () => {
    let wide = true
    let notify = () => {}
    const onClose = vi.fn()
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      get matches() { return wide },
      addEventListener: (_event: string, listener: () => void) => { notify = listener },
      removeEventListener: vi.fn(),
    })))
    render(<DetailPanel open onClose={onClose} title="Application">Applicant details</DetailPanel>)
    expect(screen.getByRole('complementary', { name: 'Application' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body).not.toHaveAttribute('data-scroll-locked')

    act(() => { wide = false; notify() })
    expect(screen.getByRole('dialog', { name: 'Application' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
