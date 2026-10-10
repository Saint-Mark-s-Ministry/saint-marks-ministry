'use client'
import Link from 'next/link'
import { ANSWER_CHOICES } from '@/lib/digital-exams'
import { use, useState } from 'react'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { useExamScreenAwake } from '@/hooks/useExamScreenAwake'
import { useExamAttempt } from '@/hooks/useExamAttempt'
import { isStudent } from '@/lib/roles'
import { useDigitalExam } from '@/lib/swr'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export default function ExamAnswerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { session, status } = useAdminGuard(isStudent)
  const { data, error, mutate } = useDigitalExam(id, status === 'authenticated' && !!session && isStudent(session.user.role))
  const control = useExamAttempt(id, session?.user.id ?? '', data, mutate)
  const [confirmedNotice, setConfirmedNotice] = useState(false)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const screenAwake = useExamScreenAwake(status === 'authenticated' && !!session && isStudent(session.user.role) && !error && control.started && data?.sheet?.state === 'OPEN' && (control.attempt ?? data.attempt)?.state !== 'SUBMITTED')
  if (status !== 'authenticated' || !session || !isStudent(session.user.role)) return null
  if (error) return <Panel title="Exam unavailable" bodyClassName="p-5"><p>This answer sheet is available only while your proctor has the exam open. Released grades appear in My Progress.</p><Button variant="outline" asChild className="mt-4"><Link href="/dashboard/student">My Progress</Link></Button></Panel>
  if (!data) return <p>Loading exam…</p>
  const attempt = control.attempt ?? data.attempt
  const submitted = attempt?.state === 'SUBMITTED'
  const closed = data.sheet?.state !== 'OPEN'
  const answered = control.answers.filter(Boolean).length
  const disabled = control.busy || control.paused || control.offline || closed || submitted || !control.started
  return <div className="flex flex-col gap-5">
    <PageHeader title={data.exam.examSection.displayName} meta={['50 questions', 'Original exam']} back={{ href: '/dashboard/student/exams', label: 'Exam answer sheets' }} />
    {control.message && <p role="alert" className="rounded-lg border border-line p-4 text-bad">{control.message}</p>}
    {submitted ? <Panel title="Exam submitted" bodyClassName="p-5"><p>Your answers are final. This answer sheet cannot be reopened.</p><p className="mt-2 text-sm text-ink-3">{typeof attempt?.correctCount === 'number' ? `Result: ${attempt?.correctCount ?? 0}/50 (${attempt?.percentage ?? 0}%).` : 'Your result will appear after leaders release the grades.'}</p>{attempt?.submittedAt && <p className="mt-2 text-sm text-ink-3">Submitted {new Date(attempt.submittedAt).toLocaleString()}</p>}</Panel>
    : closed ? <Panel title="Exam closed" bodyClassName="p-5"><p>The proctor has closed this exam. Started attempts are finalized using their saved answers.</p></Panel>
    : !control.started ? <Panel title={attempt?.retakeReady ? 'Your retake is ready' : attempt ? 'Resume your answer sheet' : 'Before you start'} bodyClassName="p-5">
      <p className="mb-3 text-sm">Read the questions on your printed exam and select each answer here. Answers save automatically. Submission is final.</p>
      <p className="mb-4 text-sm">While your exam is active, your proctor can see your progress and browser activity. Leaving this tab or taking focus away from the exam pauses your answers and alerts your proctor. Connection loss also requires proctor clearance. Return to this page and ask your proctor to unlock it.</p>
      <p className="mb-4 text-sm text-ink-3">Turn on Do Not Disturb before starting to reduce notification interruptions. We’ll try to keep your screen awake during the exam. Locking your phone still pauses your answers and requires proctor clearance.</p>
      <label className="mb-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmedNotice} onChange={e => setConfirmedNotice(e.target.checked)} className="mt-1" />I understand the exam and monitoring rules.</label>
      <Button onClick={() => void control.start()} disabled={!confirmedNotice || control.busy}>{control.busy ? 'Opening…' : attempt?.retakeReady ? 'Start retake' : attempt ? 'Resume answer sheet' : 'Start exam'}</Button>
    </Panel>
    : <>
      {(control.paused || control.offline) && <div role="alert" className="rounded-lg border border-warn/30 bg-warn/10 p-4"><p className="font-semibold">{control.offline ? 'Connection lost' : 'Answer sheet paused'}</p><p className="mt-1 text-sm">Your answers are preserved. Stay on this tab, reconnect if needed, and ask your proctor to unlock your exam.</p></div>}
      <p role="status" className="text-sm text-ink-3">{screenAwake === 'active' ? 'Screen kept awake while this exam is open.' : screenAwake === 'pending' ? 'Keeping your screen awake…' : 'Automatic screen locking may still occur on this device. Keep your screen awake during the exam.'} Locking your phone, leaving this tab, or taking focus away from the exam requires proctor clearance.</p>
      <Panel title="Answer sheet" description={`${answered}/50 answered`} actions={<span role="status" className="text-xs text-ink-3">{control.pendingCount ? `${control.pendingCount} answer(s) waiting to save` : 'All answers saved'}</span>} bodyClassName="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
        {control.answers.map((answer, question) => <fieldset key={question} disabled={disabled} className="flex items-center justify-between gap-2 border-b border-line px-4 py-3"><legend className="sr-only">Question {question + 1}</legend><span aria-hidden className="w-7 text-sm font-semibold tabular-nums">{question + 1}</span><div className="flex flex-wrap gap-1.5">{ANSWER_CHOICES.slice(0, data.sheet?.choiceCounts[question] ?? 4).split('').map(choice => <label key={choice} className="cursor-pointer"><input className="peer sr-only" type="radio" name={`question-${question}`} aria-label={`Question ${question + 1}, answer ${choice}`} checked={answer === choice} onChange={() => control.choose(question, choice)} /><span className="flex size-9 items-center justify-center rounded-full border border-line text-sm peer-checked:border-brand peer-checked:bg-brand peer-checked:font-semibold peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-accent-ink peer-disabled:cursor-not-allowed peer-disabled:opacity-60">{choice}</span></label>)}</div><button type="button" aria-label={`Clear question ${question + 1}`} disabled={disabled || !answer} onClick={() => control.choose(question, '')} className="text-xs text-ink-3 disabled:opacity-30">Clear</button></fieldset>)}
      </Panel>
      <div className="flex items-center justify-end"><Button disabled={disabled || control.pendingCount > 0} onClick={() => setConfirmSubmit(true)}>Submit exam</Button></div>
    </>}
    <Dialog open={confirmSubmit} onOpenChange={setConfirmSubmit}><DialogContent><DialogHeader><DialogTitle>Submit your exam?</DialogTitle><DialogDescription>{answered === 50 ? 'All 50 questions are answered.' : `${50 - answered} question(s) are unanswered and will count as incorrect.`} Submission is final. You cannot change your answers afterward.</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirmSubmit(false)}>Keep reviewing</Button><Button disabled={disabled || control.pendingCount > 0} onClick={() => { setConfirmSubmit(false); void control.submit() }}>Submit final answers</Button></div></DialogContent></Dialog>
  </div>
}
