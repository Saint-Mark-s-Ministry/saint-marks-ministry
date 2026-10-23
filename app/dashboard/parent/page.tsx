'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { isParent } from '@/lib/roles'
import { useParentChildren, useSundaySchoolHomework, useSundaySchoolLessons } from '@/lib/swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { StatusBadge } from '@/components/ds/status-badge'
import { Initials } from '@/components/ds/person'
import { ResourceLink } from '@/components/ds/resource-link'
import { LEVEL_ORDER, getLevelDisplayName, getSundaySchoolTodayDateInputValue } from '@/lib/sunday-school-class'
import { formatUTC } from '@/lib/utils'
import { SundaySchoolLevel } from '@prisma/client'
import { Loader2, Plus } from 'lucide-react'
import type { RegistrationStatus } from '@prisma/client'
import type { SundaySchoolWeeklyLesson, SundaySchoolWeeklyLessonsResponse } from '@/types/sunday-school'
import type { SundaySchoolHomeworkResponse } from '@/types/sunday-school'
import { HomeworkStatus } from '@/components/sunday-school-homework-cards'
import { TodayInChurch } from '@/components/liturgical/today-in-church'

interface FormData {
  firstName: string
  lastName: string
  birthDate: string
  gender: string
  intendedLevel: string
  guardianName: string
  guardianPhone: string
  guardianEmail: string
  notes: string
}

function statusBadge(status: RegistrationStatus) {
  if (status === 'PENDING') return <StatusBadge tone="warn">Pending</StatusBadge>
  if (status === 'APPROVED') return <StatusBadge tone="ok">Approved</StatusBadge>
  return <StatusBadge tone="bad">Rejected</StatusBadge>
}

export default function ParentDashboardPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ParentDashboardContent />
    </Suspense>
  )
}

function ParentDashboardContent() {
  const { session, status } = useAdminGuard(isParent)
  const { data, mutate } = useParentChildren()
  const { data: lessonData } = useSundaySchoolLessons()
  const { data: homeworkData } = useSundaySchoolHomework()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()

  // The sidebar's "Register a child" links here with ?register=1.
  useEffect(() => {
    if (searchParams.get('register') === '1') setIsDialogOpen(true)
  }, [searchParams])

  const setDialog = (open: boolean) => {
    setIsDialogOpen(open)
    if (!open && searchParams.get('register')) router.replace('/dashboard/parent', { scroll: false })
  }

  if (status === 'loading' || !session) return <PageLoading />

  const children = data?.children ?? []
  const pendingRequests = data?.pendingRequests ?? []
  const lessons = (lessonData as SundaySchoolWeeklyLessonsResponse | undefined)?.lessons ?? []

  return (
    <div className="content-reveal flex min-w-0 flex-col gap-5">
      <PageHeader
        title="My children"
        meta={['This week’s lessons and homework for each child']}
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus />
                Register a child
              </Button>
            </DialogTrigger>
            <RegisterChildDialog
              onSuccess={() => {
                mutate()
                setDialog(false)
              }}
            />
          </Dialog>
        }
      />

      {children.length === 0 ? (
        <Panel>
          <EmptyState title="No children linked yet" message="Register a child and a coordinator will place them in a class." />
        </Panel>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {children.map((child: ParentChild) => (
            <ChildCard
              key={child.id}
              child={child}
              lessons={lessons.filter((lesson) => child.class && lesson.classId === child.class.id)}
              homework={homeworkData as SundaySchoolHomeworkResponse | undefined}
            />
          ))}
        </div>
      )}

      <Panel title="Requests" description="Registration requests you’ve submitted">
        {pendingRequests.length === 0 ? (
          <EmptyState message="No requests submitted yet." />
        ) : (
          <ul className="divide-y divide-line">
            {pendingRequests.map((request: { id: string; firstName: string; lastName: string; intendedLevel: SundaySchoolLevel; status: RegistrationStatus }) => (
              <li key={request.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13.5px] font-medium text-ink">
                    {request.firstName} {request.lastName}
                  </span>
                  <span className="text-xs text-ink-3">{getLevelDisplayName(request.intendedLevel)}</span>
                </span>
                {statusBadge(request.status)}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <TodayInChurch />
    </div>
  )
}

interface ParentChild {
  id: string
  firstName: string
  lastName: string
  isActive: boolean
  class: { id: string; name: string; level: SundaySchoolLevel } | null
}

const dayLabel = (date: string) => formatUTC(date, { weekday: 'short', month: 'short', day: 'numeric' })

/** Everything a parent needs about one child, in one place: this week's lesson, homework, and what's next. */
function ChildCard({ child, lessons, homework }: { child: ParentChild; lessons: SundaySchoolWeeklyLesson[]; homework?: SundaySchoolHomeworkResponse }) {
  const today = getSundaySchoolTodayDateInputValue()
  const upcoming = lessons.filter((lesson) => lesson.sundayDate.slice(0, 10) >= today)
  const next = upcoming[0]
  const later = upcoming.slice(1, 4)
  const week = homework?.weeks.find((w) => w.homework && child.class && w.class.id === child.class.id)
  const homeworkStatus = week?.homework?.completions.find((completion) => completion.childId === child.id)?.status ?? 'NOT_RECORDED'
  const name = `${child.firstName} ${child.lastName}`
  return (
    <Panel as="div" bodyClassName="flex flex-col">
      <div className="flex items-center gap-3 border-b border-line p-4">
        <Initials name={name} size={44} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[16px] font-semibold text-ink">{name}</span>
          <span className="truncate text-xs text-ink-3">
            {child.class ? `${getLevelDisplayName(child.class.level)} · ${child.class.name}` : 'Class not assigned yet'}
          </span>
        </div>
        {!child.isActive && <StatusBadge tone="neutral">Inactive</StatusBadge>}
      </div>

      <section className="flex flex-col gap-2 border-b border-line p-4" aria-label={`Next class for ${child.firstName}`}>
        <p className="text-xs font-medium tracking-[0.06em] text-ink-3 uppercase">
          {next ? `Next class · ${dayLabel(next.sundayDate)}` : 'Next class'}
        </p>
        {next ? (
          <>
            <span className="font-display text-[20px] leading-tight font-medium text-ink">{next.title || 'Lesson to be announced'}</span>
            {next.resources.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {next.resources.map((resource) => (
                  <ResourceLink key={resource.id} title={resource.title} url={resource.url} compact />
                ))}
              </div>
            ) : (
              <span className="text-[13px] text-ink-3">The servants will share slides and links before class.</span>
            )}
          </>
        ) : (
          <span className="text-[13px] text-ink-3">{child.class ? 'No upcoming lessons scheduled yet.' : 'A coordinator will place your child in a class.'}</span>
        )}
      </section>

      {week?.homework && (
        <section className="flex flex-col gap-2 border-b border-line p-4" aria-label={`Homework for ${child.firstName}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium tracking-[0.06em] text-ink-3 uppercase">Homework · due {dayLabel(week.dueDate)}</p>
            <HomeworkStatus status={homeworkStatus} />
          </div>
          <span className="text-[15px] font-medium text-ink">{week.homework.title}</span>
          {week.homework.instructions && <p className="text-[13px] whitespace-pre-wrap text-ink-2">{week.homework.instructions}</p>}
          {week.homework.resources.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {week.homework.resources.map((resource) => (
                <ResourceLink key={resource.id} title={resource.title} url={resource.url} compact />
              ))}
            </div>
          )}
        </section>
      )}

      {later.length > 0 && (
        <section className="p-4" aria-label={`Coming up for ${child.firstName}`}>
          <p className="mb-2 text-xs font-medium tracking-[0.06em] text-ink-3 uppercase">Coming up</p>
          <ul className="flex flex-col gap-1.5">
            {later.map((lesson) => (
              <li key={lesson.id} className="flex items-baseline gap-3 text-[13px]">
                <span className="tabular w-20 shrink-0 text-ink-3">{dayLabel(lesson.sundayDate)}</span>
                <span className="min-w-0 truncate text-ink">{lesson.title || 'To be announced'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Panel>
  )
}

function RegisterChildDialog({ onSuccess }: { onSuccess: () => void }) {
  const { data: session } = useSession()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    birthDate: '',
    gender: '',
    intendedLevel: '',
    guardianName: session?.user?.name ?? '',
    guardianPhone: '',
    guardianEmail: session?.user?.email ?? '',
    notes: '',
  })

  const handleSubmit = async () => {
    if (!formData.firstName || !formData.lastName || !formData.birthDate || !formData.intendedLevel) {
      toast.error('Please fill in all required fields')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/parent/children/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Submission failed')
      }

      toast.success('Registration request submitted! It is now pending review.')
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit request')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Register a Child</DialogTitle>
        <DialogDescription>
          Submit a request to register your child for Sunday School. A coordinator will review
          it and place your child into a class.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name *</Label>
            <Input
              id="firstName"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name *</Label>
            <Input
              id="lastName"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="birthDate">Birth Date *</Label>
          <Input
            id="birthDate"
            type="date"
            value={formData.birthDate}
            onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gender">Gender</Label>
          <Select
            value={formData.gender || 'UNSPECIFIED'}
            onValueChange={(value) => setFormData({
              ...formData,
              gender: value === 'UNSPECIFIED' ? '' : value,
            })}
          >
            <SelectTrigger id="gender">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UNSPECIFIED">Prefer not to specify</SelectItem>
              <SelectItem value="MALE">Boy</SelectItem>
              <SelectItem value="FEMALE">Girl</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="intendedLevel">Grade Level *</Label>
          <Select
            value={formData.intendedLevel}
            onValueChange={(value) => setFormData({ ...formData, intendedLevel: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select grade level..." />
            </SelectTrigger>
            <SelectContent>
              {LEVEL_ORDER.map((level) => (
                <SelectItem key={level} value={level}>
                  {getLevelDisplayName(level)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="border-t pt-4 space-y-4">
          <p className="text-sm font-medium text-gray-700">Guardian Contact</p>
          <div className="space-y-2">
            <Label htmlFor="guardianName">Guardian Name</Label>
            <Input
              id="guardianName"
              value={formData.guardianName}
              onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="guardianPhone">Guardian Phone</Label>
              <Input
                id="guardianPhone"
                type="tel"
                value={formData.guardianPhone}
                onChange={(e) => setFormData({ ...formData, guardianPhone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guardianEmail">Guardian Email</Label>
              <Input
                id="guardianEmail"
                type="email"
                value={formData.guardianEmail}
                onChange={(e) => setFormData({ ...formData, guardianEmail: e.target.value })}
              />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            rows={3}
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-maroon-600 hover:bg-maroon-700">
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              Submitting...
            </>
          ) : (
            'Submit Request'
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
