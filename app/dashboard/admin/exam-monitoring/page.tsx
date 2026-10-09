'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { isAdmin, canManageExams } from '@/lib/roles'
import { useDigitalExams } from '@/lib/swr'
import type { DigitalExamList } from '@/lib/digital-exam-types'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { KpiStrip } from '@/components/ds/kpi-strip'
import { SearchField } from '@/components/ds/search-field'
import { StatusBadge, type Tone } from '@/components/ds/status-badge'
import { FilterSelect } from '@/components/ui/filter-select'
import { Button } from '@/components/ui/button'
import { formatDateUTC } from '@/lib/utils'

type Exam = DigitalExamList['exams'][number]
const states: Record<string, { label: string; tone: Tone; order: number }> = {
  OPEN: { label: 'Proctoring open', tone: 'ok', order: 0 },
  DRAFT: { label: 'Ready to open', tone: 'info', order: 1 },
  UNCONFIGURED: { label: 'Needs setup', tone: 'neutral', order: 2 },
  CLOSED: { label: 'Closed', tone: 'warn', order: 3 },
  RELEASED: { label: 'Results released', tone: 'neutral', order: 4 },
}
const examState = (exam: Exam) => exam.digitalSheet?.releasedAt ? 'RELEASED' : exam.digitalSheet?.state ?? 'UNCONFIGURED'
const yearLabels: Record<string, string> = { YEAR_1: 'Year 1', YEAR_2: 'Year 2', BOTH: 'Both years' }

export default function ExamMonitoringPage() {
  const { session, status } = useAdminGuard(isAdmin)
  const allowed = status === 'authenticated' && !!session && isAdmin(session.user.role)
  const { data, error, isLoading, mutate } = useDigitalExams(allowed)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  if (!allowed) return null
  const manage = canManageExams(session.user.role)
  const exams = data?.exams ?? []
  const visible = exams.filter(exam => (filter === 'all' || examState(exam) === filter)
    && `${exam.examSection.displayName} ${exam.academicYear.name} ${yearLabels[exam.yearLevel]}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => states[examState(a)].order - states[examState(b)].order || new Date(b.examDate).getTime() - new Date(a.examDate).getTime())
  return <div className="flex min-w-0 flex-col gap-5">
    <PageHeader title="Exam Monitoring" meta={['Servants Prep', 'Original multiple-choice exams']} actions={<Button variant="outline" asChild><Link href="/dashboard/admin/exams">{manage ? 'Manage exams' : 'View exams'}</Link></Button>} />
    <Panel title={manage ? 'Start proctoring' : 'View proctoring'} bodyClassName="p-4">
      <p className="text-sm">{manage ? 'Choose an exam, save its complete answer key, then select Open exam in its dashboard. You can open proctoring on any date. Opening makes the sheet available to all eligible students who have not submitted.' : 'Choose an exam to see student progress, pauses, connection status, and activity history. Exam leaders control opening, closing, and unlocking.'}</p>
      <p className="mt-2 text-sm text-ink-3">Students see answer sheets only while proctoring is open. Answer keys stay private; students receive released grades in My Progress. Makeup exams stay on paper.</p>
    </Panel>
    {error ? <Panel bodyClassName="p-4"><p role="alert">Could not load exams.</p><Button variant="outline" className="mt-3" onClick={() => void mutate()}>Try again</Button></Panel>
      : isLoading ? <p role="status">Loading exams…</p> : <>
        <KpiStrip items={[
          { label: 'Proctoring open', value: exams.filter(e => examState(e) === 'OPEN').length, tone: 'ok' },
          { label: 'Ready to open', value: exams.filter(e => examState(e) === 'DRAFT').length },
          { label: 'Needs setup', value: exams.filter(e => examState(e) === 'UNCONFIGURED').length },
          { label: 'Closed', value: exams.filter(e => ['CLOSED', 'RELEASED'].includes(examState(e))).length },
        ]} />
        <Panel title="Exam dashboards" description="Open exams appear first. Each dashboard shows student progress and departure alerts." toolbar={<>
          <SearchField value={search} onChange={setSearch} label="Search exams" placeholder="Search exam or academic year" />
          <FilterSelect aria-label="Proctoring status" value={filter} onChange={setFilter} placeholder="All statuses" options={Object.entries(states).map(([value, state]) => ({ value, label: state.label }))} />
        </>}>
          {visible.length === 0 && <p className="p-4 text-sm text-ink-3">{exams.length ? 'No exams match your filters.' : 'No exams have been created yet.'}</p>}
          <ul className="divide-y divide-line">{visible.map(exam => {
            const state = states[examState(exam)]
            return <li key={exam.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-medium">{exam.examSection.displayName}</h2><StatusBadge tone={state.tone}>{state.label}</StatusBadge></div><p className="mt-1 text-sm text-ink-3">{formatDateUTC(exam.examDate)} · {exam.academicYear.name} · {yearLabels[exam.yearLevel]}</p></div>
              <Button variant={examState(exam) === 'OPEN' ? 'default' : 'outline'} asChild><Link href={`/dashboard/admin/exams/${exam.id}/monitor`} aria-label={`${manage && !exam.digitalSheet ? 'Set up' : 'Monitor'} ${exam.examSection.displayName} exam`}>{manage && !exam.digitalSheet ? 'Set up answer sheet' : 'Open dashboard'}</Link></Button>
            </li>
          })}</ul>
        </Panel>
      </>}
  </div>
}
