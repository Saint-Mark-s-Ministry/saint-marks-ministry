import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SundaySchoolNameFlashcards } from '@/components/sunday-school-name-flashcards'

const children = [
  { id: 'mina', classId: 'class-a', firstName: 'Mina', lastName: 'Gerges', isActive: true, photoUrl: '/mina.jpg', user: null },
  { id: 'mary', classId: 'class-a', firstName: 'Mary', lastName: 'Hanna', isActive: true, photoUrl: null, user: { id: 'account', name: 'Mary Hanna', email: 'mary@example.com', profileImageUrl: '/mary.jpg' } },
  { id: 'no-photo', classId: 'class-a', firstName: 'No', lastName: 'Photo', isActive: true, photoUrl: null, user: null },
  { id: 'inactive', classId: 'class-a', firstName: 'Inactive', lastName: 'Child', isActive: false, photoUrl: '/inactive.jpg', user: null },
  { id: 'other', classId: 'class-b', firstName: 'Other', lastName: 'Class', isActive: true, photoUrl: '/other.jpg', user: null },
]

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function openCards(roster = children) {
  const user = userEvent.setup()
  const view = render(<SundaySchoolNameFlashcards children={roster} classId="class-a" className="St. Mary" />)
  await user.click(screen.getByRole('button', { name: 'Learn names' }))
  return { user, ...view }
}

describe('Sunday School name flashcards', () => {
  it('hides the answer from text and image labels until revealed, including keyboard use', async () => {
    const { user } = await openCards()
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.queryByText('Mina Gerges')).not.toBeInTheDocument()
    expect(dialog.getByRole('img')).toHaveAccessibleName('Whose face is this?')
    expect(dialog.getByRole('img')).toHaveAttribute('src', '/mina.jpg')
    const reveal = dialog.getByRole('button', { name: 'Reveal name' })
    reveal.focus()
    await user.keyboard('{Enter}')
    expect(dialog.getByText('Mina Gerges')).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Hide name' }))
    expect(dialog.queryByText('Mina Gerges')).not.toBeInTheDocument()
  })

  it('plays a round, scores recall, and reviews only the names that need practice', async () => {
    const { user } = await openCards()
    expect(screen.getByRole('status')).toHaveTextContent('Card 1 of 2')
    expect(screen.getByText('1 child has no photo yet and is skipped.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Got it!' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reveal name' }))
    await user.click(screen.getByRole('button', { name: 'Got it!' }))
    expect(screen.queryByText('Mina Gerges')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reveal name' })).toHaveFocus()
    expect(screen.getByRole('img')).toHaveAttribute('src', '/mary.jpg')
    expect(screen.queryByText('Mary Hanna')).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    await user.click(screen.getByRole('button', { name: 'Reveal name' }))
    expect(screen.getByText('Mary Hanna')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Practice again' }))
    expect(screen.getByRole('status')).toHaveTextContent('You remembered 1 of 2 names.')
    await user.click(screen.getByRole('button', { name: 'Practice 1 name again' }))
    expect(screen.getByRole('status')).toHaveTextContent('Round 2 · Card 1 of 1')
    expect(screen.getByRole('img')).toHaveAttribute('src', '/mary.jpg')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
    await user.click(screen.getByRole('button', { name: 'Reveal name' }))
    await user.click(screen.getByRole('button', { name: 'Got it!' }))
    expect(screen.getByRole('status')).toHaveTextContent('You remembered 1 of 1 names.')
    expect(screen.queryByRole('button', { name: 'Practice 1 name again' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Play again with everyone' }))
    expect(screen.getByRole('status')).toHaveTextContent('Round 3 · Card 1 of 2')
  })

  it('celebrates a completed round and counts a recall streak', async () => {
    const { user } = await openCards()
    for (let i = 0; i < 2; i++) {
      await user.click(screen.getByRole('button', { name: 'Reveal name' }))
      await user.click(screen.getByRole('button', { name: 'Got it!' }))
    }
    expect(screen.getByRole('status')).toHaveTextContent('You remembered 2 of 2 names.')
    expect(screen.getByText('Best streak: 2 in a row')).toBeInTheDocument()
    expect(screen.getByText('All names recalled.')).toBeInTheDocument()
  })

  it('shuffles without losing or duplicating cards and resets the answer', async () => {
    const { user } = await openCards()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    await user.click(screen.getByRole('button', { name: 'Reveal name' }))
    await user.click(screen.getByRole('button', { name: 'Shuffle' }))
    expect(screen.getByRole('status')).toHaveTextContent('Card 1 of 2')
    expect(screen.getByRole('button', { name: 'Reveal name' })).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAttribute('src', '/mary.jpg')
    await user.click(screen.getByRole('button', { name: 'Reveal name' }))
    await user.click(screen.getByRole('button', { name: 'Got it!' }))
    expect(screen.getByRole('img')).toHaveAttribute('src', '/mina.jpg')
  })

  it('starts fresh after closing and resets safely when roster data changes', async () => {
    const { user, rerender } = await openCards()
    await user.click(screen.getByRole('button', { name: 'Reveal name' }))
    await user.click(screen.getByRole('button', { name: 'Got it!' }))
    await user.click(screen.getByRole('button', { name: 'Reveal name' }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Learn names' }))
    expect(screen.getByRole('status')).toHaveTextContent('Card 1 of 2')
    expect(screen.queryByText('Mary Hanna')).not.toBeInTheDocument()
    rerender(<SundaySchoolNameFlashcards children={[children[1]]} classId="class-a" className="St. Mary" />)
    expect(screen.getByRole('status')).toHaveTextContent('Card 1 of 1')
    expect(screen.getByRole('button', { name: 'Shuffle' })).toBeDisabled()
    expect(screen.getByRole('img')).toHaveAttribute('src', '/mary.jpg')
    rerender(<SundaySchoolNameFlashcards children={children} classId="class-b" className="St. Mark" />)
    expect(screen.getByRole('img')).toHaveAttribute('src', '/other.jpg')
    expect(screen.queryByText('Mary Hanna')).not.toBeInTheDocument()
  })

  it('always changes the face on repeated shuffles even when randomness preserves the order', async () => {
    const { user } = await openCards()
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    for (const expectedPhoto of ['/mary.jpg', '/mina.jpg', '/mary.jpg']) {
      await user.click(screen.getByRole('button', { name: 'Reveal name' }))
      await user.click(screen.getByRole('button', { name: 'Shuffle' }))
      expect(screen.getByRole('img')).toHaveAttribute('src', expectedPhoto)
      expect(screen.getByRole('button', { name: 'Reveal name' })).toHaveFocus()
      expect(screen.getByRole('status')).toHaveTextContent('Card 1 of 2')
    }
  })

  it('fades out before changing the child and prevents interaction until the fade-in finishes', async () => {
    await openCards()
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
    let finishOut!: () => void
    let finishIn!: () => void
    const animate = vi.fn()
      .mockReturnValueOnce({ finished: new Promise<void>(resolve => { finishOut = resolve }), cancel: vi.fn() })
      .mockReturnValueOnce({ finished: new Promise<void>(resolve => { finishIn = resolve }), cancel: vi.fn() })
    const stage = screen.getByRole('img').closest('.name-game-stage')!
    Object.assign(stage, { animate })

    fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }))
    expect(screen.getByRole('img')).toHaveAttribute('src', '/mina.jpg')
    expect(screen.getByRole('button', { name: 'Shuffle' })).toBeDisabled()
    await act(async () => { finishOut() })
    expect(screen.getByRole('img')).toHaveAttribute('src', '/mary.jpg')
    expect(screen.getByRole('button', { name: 'Reveal name' })).toBeDisabled()
    await act(async () => { finishIn() })
    expect(screen.getByRole('button', { name: 'Reveal name' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Reveal name' })).toHaveFocus()
  })

  it('changes the child immediately when reduced motion is preferred', async () => {
    const { user } = await openCards()
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    const animate = vi.fn()
    Object.assign(screen.getByRole('img').closest('.name-game-stage')!, { animate })
    await user.click(screen.getByRole('button', { name: 'Shuffle' }))
    expect(screen.getByRole('img')).toHaveAttribute('src', '/mary.jpg')
    expect(animate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Reveal name' })).toBeEnabled()
  })

  it('preserves reviewed cards and scores when shuffling the remaining faces', async () => {
    const { user } = await openCards([
      children[0], children[1],
      { ...children[0], id: 'third', firstName: 'Third', photoUrl: '/third.jpg', user: null },
    ])
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    await user.click(screen.getByRole('button', { name: 'Reveal name' }))
    await user.click(screen.getByRole('button', { name: 'Got it!' }))
    await user.click(screen.getByRole('button', { name: 'Shuffle' }))
    expect(screen.getByRole('status')).toHaveTextContent('Card 2 of 3')
    expect(screen.getByText('1 remembered')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAttribute('src', '/third.jpg')
    await user.click(screen.getByRole('button', { name: 'Reveal name' }))
    await user.click(screen.getByRole('button', { name: 'Practice again' }))
    expect(screen.getByRole('img')).toHaveAttribute('src', '/mary.jpg')
    await user.click(screen.getByRole('button', { name: 'Reveal name' }))
    await user.click(screen.getByRole('button', { name: 'Got it!' }))
    expect(screen.getByRole('status')).toHaveTextContent('You remembered 2 of 3 names.')
    expect(screen.queryByText(/Best streak/)).not.toBeInTheDocument()
  })

  it('explains empty decks instead of showing initials that give away names', async () => {
    await openCards([children[2], children[3], children[4]])
    expect(screen.getByText(/No photos to practice yet/)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reveal name' })).not.toBeInTheDocument()
  })

  it('handles failed images and recovers on the next card', async () => {
    const { user } = await openCards()
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByText('Photo unavailable. Try the next card.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Skip this photo' }))
    expect(screen.getByRole('img')).toHaveAttribute('src', '/mary.jpg')
  })
})
