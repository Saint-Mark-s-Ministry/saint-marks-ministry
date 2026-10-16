'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Trash2, Upload } from 'lucide-react'
import { Panel } from '@/components/ds/panel'
import { Initials } from '@/components/ds/person'
import { StatusBadge } from '@/components/ds/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TableSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateUTC, formatToastTimestamp } from '@/lib/utils'
import { fetcher, defaultSWRConfig, staticDataConfig } from '@/lib/swr'
import type { AcademicYear } from '@/lib/types'
import { uploadSlip, deleteSlip, isPdf, useSlips } from '@/lib/slips-client'

export interface SlipEnrollment {
  studentId: string
  isAsyncStudent: boolean
  asyncReason: string | null
  student: { id: string; name: string }
}

interface Lesson {
  id: string
  title: string
  lessonNumber: number
  scheduledDate: string
}

interface AttendanceSlip {
  id: string
  studentId: string
  imageUrl: string
  createdAt: string
  uploader: { name: string } | null
  attendanceRecords: { lesson: Lesson }[]
}

/**
 * Async students' signed attendance slips. Uploading a slip marks the lessons it
 * covers Present. Pass `enrollment` to show just that student (student details
 * modal); otherwise all active students are loaded.
 */
export function AttendanceSlipsPanel({ enrollment, canEdit, onChange }: {
  enrollment?: SlipEnrollment
  canEdit: boolean
  onChange?: () => void
}) {
  const { data: fetched, error } = useSWR<SlipEnrollment[]>(
    enrollment ? null : '/api/enrollments?status=ACTIVE',
    fetcher,
    defaultSWRConfig
  )
  const { data: slips = [], mutate: mutateSlips } = useSlips<AttendanceSlip>('ATTENDANCE', enrollment?.studentId)

  const [uploadFor, setUploadFor] = useState<SlipEnrollment | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [pickedId, setPickedId] = useState<string | null>(null)

  // Lessons are only needed once the upload dialog is open
  const { data: years = [] } = useSWR<AcademicYear[]>('/api/academic-years', fetcher, staticDataConfig)
  const activeYearId = years.find(y => y.isActive)?.id
  const { data: lessons = [] } = useSWR<Lesson[]>(
    uploadFor && activeYearId ? `/api/lessons?forAttendance=true&academicYearId=${activeYearId}` : null,
    fetcher,
    defaultSWRConfig
  )

  const slipsByStudent = useMemo(() => {
    const map = new Map<string, AttendanceSlip[]>()
    for (const slip of slips) map.set(slip.studentId, [...(map.get(slip.studentId) ?? []), slip])
    return map
  }, [slips])

  // Students who stopped being async still show if they have slips, so those can be removed
  const students = useMemo(() => (enrollment ? [enrollment] : fetched ?? [])
    .filter(e => e.isAsyncStudent || slipsByStudent.has(e.studentId))
    .sort((a, b) => a.student.name.localeCompare(b.student.name)),
  [enrollment, fetched, slipsByStudent])

  // Only lessons that have already happened can be on a signed slip
  const pastLessons = useMemo(
    () => lessons.filter(l => new Date(l.scheduledDate) <= new Date()).reverse(),
    [lessons]
  )

  const coveredLessonIds = useMemo(() => new Set(
    (uploadFor ? slipsByStudent.get(uploadFor.studentId) ?? [] : []).flatMap(s => s.attendanceRecords.map(r => r.lesson.id))
  ), [slipsByStudent, uploadFor])

  const openUpload = (student: SlipEnrollment) => {
    setUploadFor(student)
    setFile(null)
    setSelected(new Set())
  }

  const toggleLesson = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const handleSave = async () => {
    if (!uploadFor || !file || selected.size === 0) return
    setSaving(true)
    try {
      const { marked, skipped } = await uploadSlip(file, {
        studentId: uploadFor.studentId,
        type: 'ATTENDANCE',
        lessonIds: JSON.stringify([...selected]),
      })
      toast.success(`Marked ${marked} lesson${marked === 1 ? '' : 's'} Present`, {
        description: `${uploadFor.student.name}${skipped ? ` · ${skipped} already counted, left as is` : ''}`,
      })
      setUploadFor(null)
      await mutateSlips()
      onChange?.()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (slip: AttendanceSlip) => {
    if (!confirm('Remove this slip? The lessons it covers will go back to Absent.')) return
    try {
      await deleteSlip(slip.id)
      toast.success('Attendance slip removed')
      await mutateSlips()
      onChange?.()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove slip')
    }
  }

  if (error) return <EmptyState message="Failed to load attendance slips" />
  if (!enrollment && !fetched) return <TableSkeleton />
  // In a student's modal, stay out of the way unless they're async or have slips
  if (enrollment && students.length === 0) return null

  const renderStudent = (student: SlipEnrollment) => {
    const studentSlips = slipsByStudent.get(student.studentId) ?? []
    return (
      <Panel
        key={student.studentId}
        title={enrollment ? 'Attendance slips' : `Attendance slips · ${student.student.name}`}
        description={
          !student.isAsyncStudent ? (
            <span className="text-warn">No longer async — remove slips uploaded in error</span>
          ) : (
            student.asyncReason ?? 'Each slip marks the lessons it covers Present'
          )
        }
        actions={
          canEdit &&
          student.isAsyncStudent && (
            <Button size="sm" onClick={() => openUpload(student)}>
              <Upload />
              Upload slip
            </Button>
          )
        }
      >
        {studentSlips.length === 0 ? (
          <EmptyState message={canEdit && student.isAsyncStudent ? 'No slips yet. Upload a photo of a signed slip to mark lessons present.' : 'No slips uploaded yet.'} />
        ) : (
          <ul className="divide-y divide-line">
            {studentSlips.map((slip) => (
              <li key={slip.id} className="flex items-start gap-3 px-4 py-3">
                <a href={slip.imageUrl} target="_blank" rel="noopener noreferrer" className="shrink-0" aria-label="Open slip">
                  {isPdf(slip.imageUrl) ? (
                    <span className="flex size-14 items-center justify-center rounded-md bg-hover text-xs font-medium text-ink-2">PDF</span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- user-uploaded Vercel Blob URL
                    <img src={slip.imageUrl} alt="Signed attendance slip" className="size-14 rounded-md border border-line object-cover" />
                  )}
                </a>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-1.5">
                    {slip.attendanceRecords.map(({ lesson }) => (
                      <StatusBadge key={lesson.id} tone="ok">
                        Lesson {lesson.lessonNumber} · {lesson.title}
                      </StatusBadge>
                    ))}
                    {slip.attendanceRecords.length === 0 && <span className="text-xs text-ink-3">No lessons linked</span>}
                  </div>
                  <p className="mt-1 text-xs text-ink-3">
                    Uploaded {formatToastTimestamp(new Date(slip.createdAt))}
                    {slip.uploader && ` by ${slip.uploader.name}`}
                  </p>
                </div>
                {canEdit && (
                  <Button size="icon-sm" variant="ghost" onClick={() => handleRemove(slip)} className="hover:text-bad" aria-label="Remove slip">
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    )
  }

  const picked = students.find((st) => st.studentId === pickedId) ?? students[0]

  return (
    <div className="flex flex-col gap-4">
      {!enrollment && (
        <p className="text-[13px] text-ink-3">
          Async students print an attendance slip from their portal and get each lesson signed. Upload a photo of the signed slip
          to mark those lessons Present.
        </p>
      )}

      {enrollment ? (
        students.map(renderStudent)
      ) : students.length === 0 ? (
        <Panel>
          <EmptyState message="No async students. Mark a student as async from Students → Edit → Profile, or from the Roster." />
        </Panel>
      ) : (
        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Panel title="Async students" actions={<span className="tabular text-[13px] text-ink-3">{students.length}</span>}>
            <ul className="py-1">
              {students.map((student) => {
                const count = slipsByStudent.get(student.studentId)?.length ?? 0
                const active = picked?.studentId === student.studentId
                return (
                  <li key={student.studentId}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setPickedId(student.studentId)}
                      className={`flex min-h-12 w-full cursor-pointer items-center gap-2.5 px-4 py-2 text-left ${active ? 'bg-accent-tint' : 'hover:bg-hover/60'}`}
                    >
                      <Initials name={student.student.name} />
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate text-[13.5px] font-medium text-ink">{student.student.name}</span>
                        <span className="text-xs text-ink-3">
                          {!student.isAsyncStudent ? 'No longer async' : count === 0 ? 'No slips yet' : `${count} slip${count === 1 ? '' : 's'}`}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Panel>
          {picked && renderStudent(picked)}
        </div>
      )}

      <Dialog open={!!uploadFor} onOpenChange={(open) => !open && setUploadFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload attendance slip</DialogTitle>
            <DialogDescription>
              {uploadFor?.student.name} — the lessons you check will be marked Present.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="attendance-slip-file">Photo of the signed slip</Label>
              <Input
                id="attendance-slip-file"
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-2">
              <Label>Lessons on this slip ({selected.size} selected)</Label>
              {pastLessons.length === 0 ? (
                <p className="text-sm text-gray-500">No past lessons in the active academic year.</p>
              ) : (
                <div className="max-h-72 divide-y divide-line overflow-y-auto rounded-md border border-line">
                  {pastLessons.map(lesson => (
                    <label key={lesson.id} className="flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-[13px] hover:bg-hover/60 has-[:disabled]:cursor-default has-[:disabled]:opacity-60 md:min-h-9">
                      <input
                        type="checkbox"
                        checked={selected.has(lesson.id)}
                        disabled={coveredLessonIds.has(lesson.id)}
                        onChange={() => toggleLesson(lesson.id)}
                        className="h-4 w-4 rounded shrink-0"
                      />
                      <span className="flex-1 min-w-0 truncate">#{lesson.lessonNumber} {lesson.title}</span>
                      {coveredLessonIds.has(lesson.id) && (
                        <StatusBadge tone="ok">On a slip</StatusBadge>
                      )}
                      <span className="text-xs text-gray-500 shrink-0">
                        {formatDateUTC(lesson.scheduledDate, { weekday: undefined, year: undefined })}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadFor(null)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !file || selected.size === 0}>
              {saving ? 'Uploading…' : `Mark ${selected.size} Present`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
