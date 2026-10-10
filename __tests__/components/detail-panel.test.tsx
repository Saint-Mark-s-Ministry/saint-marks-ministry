import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DetailPanel, SplitView } from '@/components/ds/detail-panel'

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

  it.each([true, false])('uses only a content fade when keyed records change (wide: %s)', (wide) => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: wide,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))
    const example = (id: string | null) => (
      <SplitView>
        <div>Applicant list</div>
        {id && <DetailPanel key={id} recordKey={id} open onClose={() => {}} title={id}>
          <input aria-label="Review note" defaultValue="" />
        </DetailPanel>}
      </SplitView>
    )
    const role = wide ? 'complementary' : 'dialog'
    const enterClass = wide ? 'detail-panel-desktop' : 'animate-in'
    const { rerender } = render(example('First applicant'))
    expect(screen.getByRole(role)).toHaveClass(enterClass)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'First applicant note' } })

    rerender(example('Second applicant'))
    expect(screen.getByRole(role, { name: 'Second applicant' })).not.toHaveClass(enterClass)
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(screen.getByRole('textbox').closest('.detail-panel-record-content')).toBeInTheDocument()

    rerender(example('Third applicant'))
    expect(screen.getByRole(role)).not.toHaveClass(enterClass)
    rerender(example(null))
    expect(screen.queryByRole(role)).not.toBeInTheDocument()
    rerender(example('First applicant'))
    expect(screen.getByRole(role)).toHaveClass(enterClass)
  })

  it('preserves an unkeyed panel frame and refreshes only the selected content', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    const example = (id: string) => <SplitView><DetailPanel recordKey={id} open onClose={() => {}} title={id}><p>{id} details</p></DetailPanel></SplitView>
    const { rerender } = render(example('First'))
    const frame = screen.getByRole('complementary')
    const content = frame.querySelector('.detail-panel-record-content')
    rerender(example('Second'))
    expect(screen.getByRole('complementary')).toBe(frame)
    expect(frame.querySelector('.detail-panel-record-content')).not.toBe(content)
    expect(screen.getByText('Second details')).toBeInTheDocument()
  })

})
