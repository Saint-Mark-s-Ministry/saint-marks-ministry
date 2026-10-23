'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Layers, Shuffle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { getChildFullName, getChildPhotoUrl } from '@/lib/sunday-school-class'
import type { SundaySchoolChild } from '@/types/sunday-school'

type FlashcardChild = Pick<SundaySchoolChild, 'id' | 'classId' | 'firstName' | 'lastName' | 'isActive' | 'photoUrl' | 'user'>
type Card = { id: string; name: string; photoUrl: string }

export function SundaySchoolNameFlashcards({ children, classId, className }: {
  children: FlashcardChild[]
  classId: string
  className: string
}) {
  const [open, setOpen] = useState(false)
  // Defensively scope even a cached roster to the currently selected class.
  const activeChildren = children.filter(child => child.isActive && child.classId === classId)
  const cards: Card[] = activeChildren.flatMap(child => {
    const photoUrl = getChildPhotoUrl(child)
    return photoUrl ? [{ id: child.id, name: getChildFullName(child), photoUrl }] : []
  })
  const missingPhotos = activeChildren.length - cards.length

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline"><Layers aria-hidden />Learn names</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Learn names</DialogTitle>
          <DialogDescription>
            {className} · Look at each face, recall their name, then reveal it.
          </DialogDescription>
        </DialogHeader>
        {cards.length > 0 ? (
          // Fresh session on reopening, class changes, or roster/photo updates.
          open && <FlashcardDeck key={JSON.stringify([classId, cards])} cards={cards} />
        ) : (
          <p className="py-8 text-center text-sm text-ink-2">
            No photos to practice yet. Add photos to active children on this class roster, then return to learn their names.
          </p>
        )}
        {missingPhotos > 0 && (
          <p className="text-center text-xs text-ink-3">
            {missingPhotos} {missingPhotos === 1 ? 'child has' : 'children have'} no photo yet and {missingPhotos === 1 ? 'is' : 'are'} skipped.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

function FlashcardDeck({ cards }: { cards: Card[] }) {
  const [order, setOrder] = useState(cards)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [failedPhoto, setFailedPhoto] = useState(false)
  const card = order[index]

  const move = (nextIndex: number) => {
    setIndex(nextIndex)
    setRevealed(false)
    setFailedPhoto(false)
  }

  const shuffle = () => {
    const shuffled = [...cards]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    setOrder(shuffled)
    move(0)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p role="status" className="text-sm text-ink-3">Card {index + 1} of {order.length}</p>
        <Button type="button" variant="ghost" onClick={shuffle} disabled={order.length < 2}>
          <Shuffle aria-hidden />Shuffle
        </Button>
      </div>
      <div className="flex flex-col items-center gap-4 rounded-xl border border-line bg-hover/40 p-4">
        {failedPhoto ? (
          <p className="flex h-[min(36dvh,18rem)] items-center text-sm text-ink-2">Photo unavailable. Try the next card.</p>
        ) : (
          // A neutral alt avoids giving away the answer before reveal.
          // eslint-disable-next-line @next/next/no-img-element
          <img key={card.id} src={card.photoUrl} alt="Whose face is this?" onError={() => setFailedPhoto(true)} className="h-[min(36dvh,18rem)] w-full rounded-lg object-contain" />
        )}
        <div aria-live="polite" aria-atomic="true" className="min-h-8 text-center text-xl font-semibold text-ink">
          {revealed ? card.name : 'What is their name?'}
        </div>
        <Button type="button" variant="outline" onClick={() => setRevealed(value => !value)}>
          {revealed ? 'Hide name' : 'Reveal name'}
        </Button>
      </div>
      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" disabled={index === 0} onClick={() => move(index - 1)}>
          <ChevronLeft aria-hidden />Previous
        </Button>
        <Button type="button" onClick={() => move(index === order.length - 1 ? 0 : index + 1)}>
          {index === order.length - 1 ? 'Start again' : 'Next'}<ChevronRight aria-hidden />
        </Button>
      </div>
    </div>
  )
}
