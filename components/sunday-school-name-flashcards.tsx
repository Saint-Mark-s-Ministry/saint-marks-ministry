'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, Flame, Layers, RotateCcw, Shuffle, Trophy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
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
        <Button type="button" variant="outline" className="min-h-11"><Layers aria-hidden />Learn names</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] min-w-0 gap-3 overflow-x-hidden overflow-y-auto p-4 sm:gap-4 sm:p-6">
        <DialogHeader className="min-w-0 px-8">
          <DialogTitle>Learn names</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">
            {className} · Recall the name, then reveal it.
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
        <DialogClose asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="Close" className="absolute top-1 right-1 size-11 sm:top-2 sm:right-2 md:size-11">
            <X aria-hidden />
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}

function shuffleCards(cards: Card[], avoidFirstId?: string) {
  const shuffled = [...cards]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  if (shuffled.length > 1 && shuffled[0].id === avoidFirstId) {
    const replacement = 1 + Math.floor(Math.random() * (shuffled.length - 1))
    ;[shuffled[0], shuffled[replacement]] = [shuffled[replacement], shuffled[0]]
  }
  return shuffled
}

function FlashcardDeck({ cards }: { cards: Card[] }) {
  const [order, setOrder] = useState(cards)
  const [index, setIndex] = useState(0)
  const [round, setRound] = useState(1)
  const [revealed, setRevealed] = useState(false)
  const [failedPhoto, setFailedPhoto] = useState(false)
  const [answers, setAnswers] = useState<Record<string, boolean>>({})
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [transition, setTransition] = useState(0)
  const [motion, setMotion] = useState<'deal' | 'shuffle'>('deal')
  const [shuffling, setShuffling] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const shuffleAnimation = useRef<Animation | null>(null)
  const shuffleRun = useRef(0)
  const nextActionRef = useRef<HTMLButtonElement>(null)
  const complete = index === order.length
  const card = order[index]
  const remembered = Object.values(answers).filter(Boolean).length

  useEffect(() => {
    if (transition > 0 && !shuffling) nextActionRef.current?.focus({ preventScroll: true })
  }, [transition, shuffling])

  useEffect(() => () => {
    shuffleRun.current++
    shuffleAnimation.current?.cancel()
  }, [])

  const advance = (gotIt: boolean) => {
    if (!card || (!revealed && !failedPhoto)) return
    setAnswers(previous => ({ ...previous, [card.id]: gotIt }))
    const nextStreak = gotIt ? streak + 1 : 0
    setStreak(nextStreak)
    setBestStreak(previous => Math.max(previous, nextStreak))
    setIndex(index + 1)
    setMotion('deal')
    setRevealed(false)
    setFailedPhoto(false)
    setTransition(previous => previous + 1)
  }

  const startRound = (nextCards: Card[]) => {
    setOrder(shuffleCards(nextCards, order[order.length - 1]?.id))
    setIndex(0)
    setRound(previous => previous + 1)
    setMotion('deal')
    setAnswers({})
    setStreak(0)
    setBestStreak(0)
    setRevealed(false)
    setFailedPhoto(false)
    setTransition(previous => previous + 1)
  }

  // Shuffle only the unreviewed cards, preserving progress and the score.
  const applyShuffle = () => {
    setOrder(previous => [
      ...previous.slice(0, index),
      ...shuffleCards(previous.slice(index), previous[index]?.id),
    ])
    setRevealed(false)
    setFailedPhoto(false)
    setMotion('shuffle')
    setTransition(previous => previous + 1)
  }

  const shuffle = async () => {
    if (shuffling || order.length - index < 2) return
    const stage = stageRef.current
    if (!stage?.animate || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      applyShuffle()
      return
    }

    const run = ++shuffleRun.current
    setShuffling(true)
    try {
      shuffleAnimation.current = stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'ease-out', fill: 'forwards' })
      await shuffleAnimation.current.finished
      if (run !== shuffleRun.current) return
      applyShuffle()
      shuffleAnimation.current.cancel()
      shuffleAnimation.current = stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-in', fill: 'forwards' })
      await shuffleAnimation.current.finished
    } catch {
      // Closing the dialog cancels an in-flight transition.
    } finally {
      if (run === shuffleRun.current) {
        shuffleAnimation.current?.cancel()
        shuffleAnimation.current = null
        setShuffling(false)
      }
    }
  }

  if (complete) {
    const practiceCards = order.filter(item => !answers[item.id])
    return (
      <div className="name-game-summary flex min-w-0 flex-col items-center gap-4 py-3 text-center sm:gap-5 sm:py-5">
        <div className="flex size-20 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          <Trophy className="size-10" aria-hidden />
        </div>
        <div role="status" className="space-y-2">
          <h3 className="text-2xl font-semibold text-ink">Round complete</h3>
          <p className="text-lg text-ink">You remembered {remembered} of {order.length} names.</p>
          <p className="text-sm text-ink-2">
            {practiceCards.length === 0 ? 'All names recalled.' : 'Review the remaining names in another round.'}
          </p>
          {bestStreak > 1 && <p className="text-sm font-medium text-accent-ink">Best streak: {bestStreak} in a row</p>}
        </div>
        <div className="flex w-full flex-col gap-2">
          {practiceCards.length > 0 && (
            <Button ref={nextActionRef} type="button" className="h-auto min-h-11 whitespace-normal py-2" onClick={() => startRound(practiceCards)}>
              <RotateCcw aria-hidden />Practice {practiceCards.length} {practiceCards.length === 1 ? 'name' : 'names'} again
            </Button>
          )}
          <Button ref={practiceCards.length ? undefined : nextActionRef} type="button" className="h-auto min-h-11 whitespace-normal py-2" variant={practiceCards.length ? 'outline' : 'default'} onClick={() => startRound(cards)}>
            <Shuffle aria-hidden />Play again with everyone
          </Button>
        </div>
        <p className="text-xs text-ink-3">Just for practice. Your results aren’t saved.</p>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-sm text-ink-3">Round {round} · Card {index + 1} of {order.length}</p>
        <Button type="button" variant="ghost" className="min-h-11" onClick={shuffle} disabled={shuffling || order.length - index < 2}>
          <Shuffle aria-hidden />Shuffle
        </Button>
      </div>
      <div className="space-y-2">
        <div role="progressbar" aria-label="Round progress" aria-valuemin={0} aria-valuemax={order.length} aria-valuenow={index} className="h-2 overflow-hidden rounded-full bg-hover">
          <div className="name-game-progress h-full rounded-full bg-brand" style={{ width: `${index / order.length * 100}%` }} />
        </div>
        <div className="flex min-h-5 flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-ink-3">
          <span>{remembered} remembered</span>
          {streak > 1 && <span className="flex items-center gap-1 font-medium text-accent-ink"><Flame className="size-3.5" aria-hidden />{streak} in a row</span>}
        </div>
      </div>
      <div ref={stageRef} className="name-game-stage min-w-0" data-motion={motion} aria-busy={shuffling}>
        <div key={`${card.id}-${transition}`} className="name-game-card flex min-w-0 flex-col items-center gap-3 rounded-xl border border-line bg-hover/40 p-3 sm:gap-4 sm:p-4">
          <div className="name-game-photo w-full" data-revealed={revealed}>
            {failedPhoto ? (
              <p className="flex h-[min(30dvh,16rem)] items-center justify-center text-sm text-ink-2">Photo unavailable. Try the next card.</p>
            ) : (
              // A neutral alt avoids giving away the answer before reveal.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.photoUrl} alt="Whose face is this?" onError={() => setFailedPhoto(true)} className="h-[min(30dvh,16rem)] w-full rounded-lg object-contain" />
            )}
          </div>
          <div aria-live="polite" aria-atomic="true" className={revealed ? "relative flex min-h-12 w-full items-center justify-center text-center" : "sr-only"}>
            {revealed && (
              <div className="name-game-reveal">
                <p className="px-1 text-xl font-semibold text-ink [overflow-wrap:anywhere] sm:px-6 sm:text-2xl">{card.name}</p>
              </div>
            )}
          </div>
          {revealed ? (
            <Button type="button" variant="ghost" className="min-h-11" disabled={shuffling} onClick={() => setRevealed(false)}>Hide name</Button>
          ) : (
            <Button ref={nextActionRef} type="button" disabled={shuffling} className="min-h-11 w-full" onClick={() => setRevealed(true)}>
              Reveal name
            </Button>
          )}
        </div>
      </div>
      {revealed ? (
        <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
          <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal px-3 py-2" disabled={shuffling} onClick={() => advance(false)}><RotateCcw aria-hidden />Practice again</Button>
          <Button type="button" className="h-auto min-h-11 whitespace-normal px-3 py-2" disabled={shuffling} onClick={() => advance(true)}><Check aria-hidden />Got it!</Button>
        </div>
      ) : failedPhoto ? (
        <Button type="button" variant="outline" className="min-h-11" disabled={shuffling} onClick={() => advance(false)}>Skip this photo<ChevronRight aria-hidden /></Button>
      ) : null}
    </div>
  )
}
