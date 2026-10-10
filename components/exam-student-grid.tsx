'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { DigitalExamView } from '@/lib/digital-exam-types'
import { Panel } from '@/components/ds/panel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type StudentRow = NonNullable<DigitalExamView['roster']>[number]

function StudentTiles({ roster, select, fit = false }: { roster: StudentRow[]; select: (id: string) => void; fit?: boolean }) {
  const container = useRef<HTMLUListElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!fit || !container.current) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [fit])
  const columns = Math.max(1, Math.floor(size.width / 140))
  const rows = Math.max(1, Math.ceil(roster.length / columns))
  return <ul ref={container} aria-label="Student overview" className={`grid gap-2 ${fit ? 'min-h-0 flex-1 overflow-auto' : ''}`} style={{ gridTemplateColumns: fit && size.width ? `repeat(${columns}, minmax(0, 1fr))` : 'repeat(auto-fill, minmax(140px, 1fr))', ...(fit && size.height ? { gridAutoRows: `${Math.max(92, (size.height - (rows - 1) * 8) / rows)}px` } : {}) }}>
    {roster.map(row => {
      const attempt = row.attempt
      const waiting = !attempt || attempt.retakeReady
      const submitted = !waiting && attempt.state === 'SUBMITTED'
      const paused = !waiting && attempt.state === 'PAUSED'
      const stale = !waiting && !submitted && attempt.stale
      const status = waiting ? attempt?.retakeReady ? 'Retake ready' : 'Not started' : submitted ? 'Submitted' : paused ? 'Paused' : 'Answering'
      const color = paused ? 'border-bad bg-bad/20 ring-1 ring-bad/40' : stale ? 'border-warn/50 bg-warn/10' : submitted ? 'border-ok/40 bg-ok/10' : !waiting ? 'border-brand/40 bg-brand/5' : 'border-line bg-surface'
      const latestAnswer = attempt && !waiting ? [...attempt.events].filter(event => event.kind === 'ANSWER_SAVED').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).at(0) : undefined
      return <li key={row.student.id} className="min-w-0"><button type="button" aria-label={`View ${row.student.name}: ${status}${stale ? ', connection stale' : ''}`} onClick={() => select(row.student.id)} className={`flex h-full min-h-[92px] w-full flex-col justify-center gap-1 rounded-lg border p-2.5 text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${color}`}>
        <span className="line-clamp-2 text-sm font-semibold leading-tight" title={row.student.name}>{row.student.name}</span>
        <span className={`text-xs font-semibold ${paused ? 'text-bad' : ''}`}>{paused ? 'Needs unlock' : status}{stale ? ' · No contact' : ''}</span>
        <span className="text-xs tabular-nums text-ink-3">{waiting ? '0' : attempt.answeredCount}/50 answered</span>
        {latestAnswer && <span className="truncate text-[11px] text-ink-3">Q{latestAnswer.questionNumber}: chose {latestAnswer.answerChoice}</span>}
        {!row.eligible && <span className="text-[11px] text-ink-3">Historical attempt</span>}
      </button></li>
    })}
  </ul>
}

export function ExamStudentGrid({ roster, renderDetails }: { roster: StudentRow[]; renderDetails: (row: StudentRow) => ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  const opener = useRef<HTMLElement | null>(null)
  const overviewOpener = useRef<HTMLElement | null>(null)
  function select(id: string) {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setSelectedId(id)
  }
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Resolve from the live roster so an open detail view stays current after refresh.
  const selected = roster.find(row => row.student.id === selectedId)
  const details = <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelectedId(null) }}><DialogContent onCloseAutoFocus={event => { event.preventDefault(); opener.current?.focus() }} className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{selected?.student.name}</DialogTitle><DialogDescription>Live progress, connection status, and activity history.</DialogDescription></DialogHeader>{selected && renderDetails(selected)}</DialogContent></Dialog>
  return <>
    <Panel title={`Students · ${roster.length}`} description="Select a student for details and unlocking. Red means paused; amber means contact is stale." actions={<Button size="sm" variant="outline" onClick={() => { overviewOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setExpanded(true) }}>Fit to screen</Button>} bodyClassName="p-3">
      {roster.length ? <StudentTiles roster={roster} select={select} /> : <p className="text-sm text-ink-3">No eligible students.</p>}
    </Panel>
    <Dialog open={expanded} onOpenChange={setExpanded}><DialogContent onCloseAutoFocus={event => { event.preventDefault(); overviewOpener.current?.focus() }} className="flex h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-none flex-col p-4 sm:max-w-none"><DialogHeader className="pr-8"><DialogTitle>Student overview · {roster.length}</DialogTitle><DialogDescription>Select a student for details. Red: paused · Amber: stale contact · Green: submitted. Small screens and very large rosters may need scrolling.</DialogDescription></DialogHeader><StudentTiles roster={roster} select={select} fit />{expanded && details}</DialogContent></Dialog>
    {!expanded && details}
  </>
}
