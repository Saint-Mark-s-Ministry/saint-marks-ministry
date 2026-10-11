import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Initials } from '@/components/ds/person'

describe('Initials photo viewer', () => {
  it('opens a larger photo with the name, without triggering the row', () => {
    const rowClick = vi.fn()
    render(
      <div onClick={rowClick}>
        <Initials name="Mina Gerges" imageUrl="https://example.com/mina.jpg" />
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: "View Mina Gerges's photo" }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByAltText("Mina Gerges's photo")).toHaveAttribute('src', 'https://example.com/mina.jpg')
    expect(rowClick).not.toHaveBeenCalled()
  })

  it('stays a plain image inside other controls (enlarge={false})', () => {
    render(<Initials name="Mina Gerges" imageUrl="https://example.com/mina.jpg" enlarge={false} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is not clickable without a photo', () => {
    render(<Initials name="Mina Gerges" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('MG')).toBeInTheDocument()
  })
})
