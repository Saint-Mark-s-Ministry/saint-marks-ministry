'use client'

import { useEffect, useState } from 'react'
import { ContactLink } from '@/components/contact-link'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { canAssignMentors, canManageEnrollments, canSetAsyncStatus } from '@/lib/roles'
import { PageLoading } from '@/components/ui/page-loading'
import { AsyncBadge } from '@/components/async-badge'
import type { AcademicYear } from '@/lib/types'
import { withCurrentOption } from '@/lib/utils'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { KpiStrip } from '@/components/ds/kpi-strip'
import { SearchField } from '@/components/ds/search-field'
import { StatusBadge } from '@/components/ds/status-badge'
import { Initials, PersonCell } from '@/components/ds/person'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterSelect } from '@/components/ui/filter-select'

const inlineSelect =
  'h-11 w-full max-w-60 cursor-pointer rounded-md border border-line-strong bg-surface px-2 text-base text-ink disabled:cursor-not-allowed disabled:opacity-60 md:h-8 md:text-[13px]'
import { MentorFilterCombobox } from '@/components/admin/mentor-filter-combobox'

interface FatherOfConfession {
  id: string
  name: string
  phone: string | null
  church: string | null
  _count?: { students: number }
}

interface Enrollment {
  id: string
  yearLevel: string
  isActive: boolean
  isAsyncStudent: boolean
  status: 'ACTIVE' | 'GRADUATED' | 'WITHDRAWN'
  student: {
    id: string
    name: string
    email: string
  }
  mentor: {
    id: string
    name: string
  } | null
  fatherOfConfession: FatherOfConfession | null
  academicYear: AcademicYear | null
  graduatedAcademicYear: AcademicYear | null
}

interface Mentor {
  id: string
  name: string
  email: string
  profileImageUrl?: string | null
}

export default function EnrollmentsPage() {
  const { session, status } = useAdminGuard(canAssignMentors)
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [mentors, setMentors] = useState<Mentor[]>([])
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
  const [fathersOfConfession, setFathersOfConfession] = useState<FatherOfConfession[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMentor, setFilterMentor] = useState<string>('all')
  const [filterYear, setFilterYear] = useState<string>('all')
  const [filterAcademicYear, setFilterAcademicYear] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('ACTIVE')

  // Father of Confession management
  const [showFathersListDialog, setShowFathersListDialog] = useState(false)
  const [showFatherDialog, setShowFatherDialog] = useState(false)
  const [editingFather, setEditingFather] = useState<FatherOfConfession | null>(null)
  const [fatherForm, setFatherForm] = useState({ name: '', phone: '', church: '' })
  const [savingFather, setSavingFather] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch all data in parallel
        const [enrollmentsRes, mentorsRes, yearsRes, fathersRes] = await Promise.all([
          fetch('/api/enrollments'),
          fetch('/api/mentor-options'),
          fetch('/api/academic-years'),
          fetch('/api/fathers-of-confession')
        ])

        if (!enrollmentsRes.ok) throw new Error('Failed to fetch enrollments')
        if (!mentorsRes.ok) throw new Error('Failed to fetch mentors')
        if (!yearsRes.ok) throw new Error('Failed to fetch academic years')

        const [enrollmentsData, mentorsData, yearsData, fathersData] = await Promise.all([
          enrollmentsRes.json(),
          mentorsRes.json(),
          yearsRes.json(),
          fathersRes.ok ? fathersRes.json() : []
        ])

        // Set all enrollments (filtering is done in UI)
        setEnrollments(Array.isArray(enrollmentsData) ? enrollmentsData : [])

        // Set academic years
        setAcademicYears(Array.isArray(yearsData) ? yearsData : [])

        // Set fathers of confession
        setFathersOfConfession(Array.isArray(fathersData) ? fathersData : [])

        setMentors(Array.isArray(mentorsData) ? mentorsData : [])
      } catch (error) {
        console.error('Failed to fetch data:', error)
        setEnrollments([])
        setMentors([])
        setAcademicYears([])
        setFathersOfConfession([])
      } finally {
        setLoading(false)
      }
    }

    if (session?.user) {
      fetchData()
    }
  }, [session])

  const handleMentorChange = async (enrollmentId: string, mentorId: string) => {
    try {
      const res = await fetch(`/api/enrollments/${enrollmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentorId })
      })

      if (res.ok) {
        const updated = await res.json()
        setEnrollments(enrollments.map(e =>
          e.id === enrollmentId ? updated : e
        ))
        toast.success('Mentor updated successfully!')
      } else {
        const errorData = await res.json()
        toast.error(errorData.error || 'Failed to update mentor')
      }
    } catch (error) {
      console.error('Failed to update mentor:', error)
      toast.error('Failed to update mentor')
    }
  }

  const handleFatherChange = async (enrollmentId: string, fatherOfConfessionId: string) => {
    try {
      const res = await fetch(`/api/enrollments/${enrollmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fatherOfConfessionId })
      })

      if (res.ok) {
        const updated = await res.json()
        setEnrollments(enrollments.map(e =>
          e.id === enrollmentId ? updated : e
        ))
        toast.success('Father of Confession updated!')
      } else {
        const errorData = await res.json()
        toast.error(errorData.error || 'Failed to update')
      }
    } catch (error) {
      console.error('Failed to update father of confession:', error)
      toast.error('Failed to update')
    }
  }

  const handleAsyncToggle = async (enrollmentId: string, isAsyncStudent: boolean) => {
    try {
      const res = await fetch(`/api/enrollments/${enrollmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAsyncStudent })
      })

      if (res.ok) {
        const updated = await res.json()
        setEnrollments(enrollments.map(e =>
          e.id === enrollmentId ? updated : e
        ))
        toast.success(isAsyncStudent ? 'Student marked as async' : 'Async status removed')
      } else {
        const errorData = await res.json()
        toast.error(errorData.error || 'Failed to update async status')
      }
    } catch (error) {
      console.error('Failed to update async status:', error)
      toast.error('Failed to update async status')
    }
  }

  const canToggleAsync = session?.user?.role && canSetAsyncStatus(session.user.role)

  const openAddFatherDialog = () => {
    setEditingFather(null)
    setFatherForm({ name: '', phone: '', church: '' })
    setShowFatherDialog(true)
  }

  const openEditFatherDialog = (father: FatherOfConfession) => {
    setEditingFather(father)
    setFatherForm({
      name: father.name,
      phone: father.phone || '',
      church: father.church || ''
    })
    setShowFatherDialog(true)
  }

  const handleSaveFather = async () => {
    if (!fatherForm.name.trim()) {
      toast.error('Name is required')
      return
    }

    setSavingFather(true)
    try {
      const url = editingFather
        ? `/api/fathers-of-confession/${editingFather.id}`
        : '/api/fathers-of-confession'
      const method = editingFather ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fatherForm)
      })

      if (res.ok) {
        const saved = await res.json()
        if (editingFather) {
          setFathersOfConfession(fathersOfConfession.map(f =>
            f.id === editingFather.id ? { ...saved, _count: f._count } : f
          ))
        } else {
          setFathersOfConfession([...fathersOfConfession, { ...saved, _count: { students: 0 } }])
        }
        setShowFatherDialog(false)
        toast.success(editingFather ? 'Updated successfully!' : 'Added successfully!')
      } else {
        const errorData = await res.json()
        toast.error(errorData.error || 'Failed to save')
      }
    } catch (error) {
      console.error('Failed to save father of confession:', error)
      toast.error('Failed to save')
    } finally {
      setSavingFather(false)
    }
  }

  const handleDeleteFather = async (father: FatherOfConfession) => {
    if (!confirm(`Are you sure you want to remove "${father.name}"? This will unassign them from all students.`)) {
      return
    }

    try {
      const res = await fetch(`/api/fathers-of-confession/${father.id}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        setFathersOfConfession(fathersOfConfession.filter(f => f.id !== father.id))
        // Also update enrollments to reflect the removal
        setEnrollments(enrollments.map(e =>
          e.fatherOfConfession?.id === father.id
            ? { ...e, fatherOfConfession: null }
            : e
        ))
        toast.success('Removed successfully!')
      } else {
        toast.error('Failed to remove')
      }
    } catch (error) {
      console.error('Failed to delete father of confession:', error)
      toast.error('Failed to remove')
    }
  }

  // PRIEST is read-only, only SUPER_ADMIN and SERVANT_PREP can manage enrollments
  const canEdit = session?.user?.role && canManageEnrollments(session.user.role)

  // A mentor's count covers every student they mentor, withdrawn and graduated
  // included, so picking one shows all statuses; clearing it goes back to Active.
  // A status the admin chose by hand is left alone.
  const selectMentor = (mentorId: string) => {
    setFilterMentor(mentorId)
    const isMentor = mentorId !== 'all' && mentorId !== 'unassigned'
    if (isMentor && filterStatus === 'ACTIVE') setFilterStatus('all')
    if (!isMentor && filterStatus === 'all') setFilterStatus('ACTIVE')
  }

  if (loading || status === 'loading') {
    return <PageLoading />
  }

  // Filter enrollments
  const filteredEnrollments = enrollments.filter(enrollment => {
    if (searchTerm && !enrollment.student.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !enrollment.student.email.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false
    }
    if (filterMentor !== 'all') {
      if (filterMentor === 'unassigned' && enrollment.mentor) return false
      if (filterMentor !== 'unassigned' && enrollment.mentor?.id !== filterMentor) return false
    }
    if (filterYear !== 'all' && enrollment.yearLevel !== filterYear) {
      return false
    }
    if (filterStatus !== 'all' && enrollment.status !== filterStatus) {
      return false
    }
    if (filterAcademicYear !== 'all') {
      // For graduated students, check graduatedAcademicYear; for others, check academicYear
      if (filterStatus === 'GRADUATED') {
        if (enrollment.graduatedAcademicYear?.id !== filterAcademicYear) return false
      } else {
        if (enrollment.academicYear?.id !== filterAcademicYear) return false
      }
    }
    return true
  })

  // Calculate workload per mentor
  const mentorWorkload = new Map<string, number>()
  if (Array.isArray(enrollments)) {
    enrollments.forEach(enrollment => {
      if (enrollment.mentor) {
        const count = mentorWorkload.get(enrollment.mentor.id) || 0
        mentorWorkload.set(enrollment.mentor.id, count + 1)
      }
    })
  }

  const activeYear = academicYears.find((y) => y.isActive)
  const activeCount = enrollments.filter((e) => e.status === 'ACTIVE').length
  const asyncCount = enrollments.filter((e) => e.status === 'ACTIVE' && e.isAsyncStudent).length
  const unassignedCount = enrollments.filter((e) => e.status === 'ACTIVE' && !e.mentor).length
  const filtersActive = searchTerm || filterMentor !== 'all' || filterYear !== 'all' || filterStatus !== 'ACTIVE' || filterAcademicYear !== 'all'
  const statusTone = { ACTIVE: 'ok', GRADUATED: 'accent', WITHDRAWN: 'neutral' } as const
  const statusLabel = { ACTIVE: 'Active', GRADUATED: 'Graduated', WITHDRAWN: 'Withdrawn' } as const
  const maxLoad = Math.max(1, ...mentors.map((m) => mentorWorkload.get(m.id) || 0))

  const mentorSelect = (enrollment: Enrollment) => (
    <select
      aria-label={`Mentor for ${enrollment.student.name}`}
      className={inlineSelect}
      value={enrollment.mentor?.id || ''}
      onChange={(e) => handleMentorChange(enrollment.id, e.target.value)}
      disabled={!canEdit}
    >
      <option value="">Unassigned</option>
      {withCurrentOption(mentors, enrollment.mentor).map((mentor) => (
        <option key={mentor.id} value={mentor.id}>{mentor.name}</option>
      ))}
    </select>
  )
  const fatherSelect = (enrollment: Enrollment) => (
    <select
      aria-label={`Father of confession for ${enrollment.student.name}`}
      className={inlineSelect}
      value={enrollment.fatherOfConfession?.id || ''}
      onChange={(e) => handleFatherChange(enrollment.id, e.target.value)}
      disabled={!canEdit}
    >
      <option value="">Unassigned</option>
      {withCurrentOption(fathersOfConfession, enrollment.fatherOfConfession).map((father) => (
        <option key={father.id} value={father.id}>{father.name}</option>
      ))}
    </select>
  )

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Student roster"
        meta={['Enrollment, mentors and fathers of confession', activeYear?.name.replace('-', '–')]}
        actions={
          <Button variant="outline" onClick={() => setShowFathersListDialog(true)}>
            Fathers of confession ({fathersOfConfession.length})
          </Button>
        }
      />

      <KpiStrip
        items={[
          { label: 'Enrolled', value: enrollments.length, hint: 'all years' },
          { label: 'Active', value: activeCount, hint: 'this academic year' },
          { label: 'Async', value: asyncCount, hint: 'slip-based attendance' },
          { label: 'Unassigned mentor', value: unassignedCount, hint: unassignedCount ? 'need a mentor' : 'everyone has one', tone: unassignedCount ? 'warn' : undefined },
        ]}
      />

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Panel
          toolbar={
            <>
              <SearchField value={searchTerm} onChange={setSearchTerm} placeholder="Search students" />
              <MentorFilterCombobox mentors={mentors} workload={mentorWorkload} value={filterMentor} onValueChange={selectMentor} />
              <FilterSelect
                aria-label="Year level"
                value={filterYear}
                onChange={setFilterYear}
                options={[{ value: 'all', label: 'All years' }, { value: 'YEAR_1', label: 'Year 1' }, { value: 'YEAR_2', label: 'Year 2' }]}
              />
              <FilterSelect
                aria-label="Status"
                value={filterStatus}
                onChange={setFilterStatus}
                options={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'ACTIVE', label: 'Active' },
                  { value: 'GRADUATED', label: 'Graduated' },
                  { value: 'WITHDRAWN', label: 'Withdrawn' },
                ]}
              />
              <FilterSelect
                aria-label="Academic year"
                value={filterAcademicYear}
                onChange={setFilterAcademicYear}
                options={[{ value: 'all', label: 'All academic years' }, ...academicYears.map((year) => ({ value: year.id, label: year.name.replace('-', '–') }))]}
              />
              {filtersActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('')
                    setFilterMentor('all')
                    setFilterYear('all')
                    setFilterStatus('ACTIVE')
                    setFilterAcademicYear('all')
                  }}
                >
                  <X />
                  Clear
                </Button>
              )}
            </>
          }
          footer={<span className="tabular">{filteredEnrollments.length} students</span>}
        >
          {filteredEnrollments.length === 0 ? (
            <EmptyState message="No students match these filters." />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-[13px] text-ink">
                  <thead className="bg-raised">
                    <tr className="border-b border-line text-left text-xs text-ink-3">
                      <th scope="col" className="h-9 px-3 font-medium">Student</th>
                      <th scope="col" className="w-20 px-3 font-medium">Year</th>
                      <th scope="col" className="w-28 px-3 font-medium">Status</th>
                      <th scope="col" className="px-3 font-medium">Mentor</th>
                      <th scope="col" className="px-3 font-medium">Father of confession</th>
                      <th scope="col" className="w-16 px-3 text-center font-medium">Async</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEnrollments.map((enrollment) => (
                      <tr key={enrollment.id} className="h-[52px] border-b border-line last:border-0 hover:bg-hover/60">
                        <td className="px-3">
                          <PersonCell
                            name={enrollment.student.name}
                            meta={
                              enrollment.status === 'GRADUATED' && enrollment.graduatedAcademicYear
                                ? `Graduated ${enrollment.graduatedAcademicYear.name}`
                                : enrollment.academicYear?.name ?? enrollment.student.email
                            }
                            href={`/dashboard/admin/students?student=${enrollment.student.id}`}
                          />
                        </td>
                        <td className="px-3 text-ink-2">{enrollment.yearLevel === 'YEAR_1' ? 'Year 1' : 'Year 2'}</td>
                        <td className="px-3">
                          <StatusBadge tone={statusTone[enrollment.status]}>{statusLabel[enrollment.status]}</StatusBadge>
                        </td>
                        <td className="px-3">{mentorSelect(enrollment)}</td>
                        <td className="px-3">{fatherSelect(enrollment)}</td>
                        <td className="px-3 text-center">
                          <input
                            type="checkbox"
                            aria-label={`${enrollment.student.name} is an async student`}
                            checked={enrollment.isAsyncStudent}
                            onChange={(e) => handleAsyncToggle(enrollment.id, e.target.checked)}
                            disabled={!canToggleAsync}
                            className="size-4 cursor-pointer accent-brand disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-line md:hidden">
                {filteredEnrollments.map((enrollment) => (
                  <li key={enrollment.id} className="flex flex-col gap-3 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <PersonCell
                        name={enrollment.student.name}
                        meta={`${enrollment.yearLevel === 'YEAR_1' ? 'Year 1' : 'Year 2'} · ${enrollment.academicYear?.name ?? '—'}`}
                        href={`/dashboard/admin/students?student=${enrollment.student.id}`}
                      />
                      <div className="flex shrink-0 gap-1.5">
                        {enrollment.isAsyncStudent && <AsyncBadge />}
                        <StatusBadge tone={statusTone[enrollment.status]}>{statusLabel[enrollment.status]}</StatusBadge>
                      </div>
                    </div>
                    <label className="flex flex-col gap-1 text-xs font-medium text-ink-3">
                      Mentor
                      {mentorSelect(enrollment)}
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-ink-3">
                      Father of confession
                      {fatherSelect(enrollment)}
                    </label>
                    <label className="flex min-h-11 items-center gap-2 text-[15px] text-ink-2">
                      <input
                        type="checkbox"
                        checked={enrollment.isAsyncStudent}
                        onChange={(e) => handleAsyncToggle(enrollment.id, e.target.checked)}
                        disabled={!canToggleAsync}
                        className="size-5 accent-brand"
                      />
                      Async student
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        <Panel title="Mentor workload" description="Select a mentor to filter the roster">
          <ul className="flex flex-col py-1.5">
            {[...mentors]
              .sort((a, b) => (mentorWorkload.get(b.id) || 0) - (mentorWorkload.get(a.id) || 0))
              .map((mentor) => {
                const count = mentorWorkload.get(mentor.id) || 0
                const active = filterMentor === mentor.id
                return (
                  <li key={mentor.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => selectMentor(active ? 'all' : mentor.id)}
                      className={`flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-4 py-1.5 text-left md:min-h-9 ${active ? 'bg-accent-tint' : 'hover:bg-hover/60'}`}
                    >
                      <Initials name={mentor.name} imageUrl={mentor.profileImageUrl} size={24} enlarge={false} />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{mentor.name}</span>
                      <span aria-hidden className="h-1.5 w-12 overflow-hidden rounded-[3px] bg-track">
                        <span className="block h-full rounded-[3px] bg-accent-ink" style={{ width: `${(count / maxLoad) * 100}%` }} />
                      </span>
                      <span className="tabular w-6 text-right text-[13px] font-medium text-ink">{count}</span>
                    </button>
                  </li>
                )
              })}
          </ul>
        </Panel>
      </div>

      {/* Fathers of Confession List Dialog */}
      <Dialog open={showFathersListDialog} onOpenChange={setShowFathersListDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="pr-8">
            <DialogTitle>Fathers of Confession</DialogTitle>
          </DialogHeader>
          {canEdit && (
            <div className="flex justify-end -mt-2 mb-2">
              <Button size="sm" onClick={openAddFatherDialog}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          )}
          <div className="py-4 max-h-[60vh] overflow-y-auto">
            {fathersOfConfession.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">
                No fathers of confession added yet.
              </p>
            ) : (
              <div className="space-y-2">
                {fathersOfConfession.map(father => (
                  <div key={father.id} className="p-3 border rounded-lg flex justify-between items-start hover:bg-gray-50">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm">{father.name}</div>
                      {father.church && <div className="text-xs text-gray-500">{father.church}</div>}
                      {father.phone && <div className="text-xs"><ContactLink kind="phone" value={father.phone} name={father.name} label="father of confession's phone number" /></div>}
                      <div className="text-xs text-maroon-600 mt-1">{father._count?.students || 0} students</div>
                    </div>
                    {canEdit && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => openEditFatherDialog(father)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteFather(father)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Father of Confession Dialog */}
      <Dialog open={showFatherDialog} onOpenChange={setShowFatherDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingFather ? 'Edit Father of Confession' : 'Add Father of Confession'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="father-name">Name *</Label>
              <Input
                id="father-name"
                placeholder="Fr. Name"
                value={fatherForm.name}
                onChange={(e) => setFatherForm({ ...fatherForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="father-church">Church</Label>
              <Input
                id="father-church"
                placeholder="St. Mary's Church"
                value={fatherForm.church}
                onChange={(e) => setFatherForm({ ...fatherForm, church: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="father-phone">Phone</Label>
              <Input
                id="father-phone"
                placeholder="(555) 123-4567"
                value={fatherForm.phone}
                onChange={(e) => setFatherForm({ ...fatherForm, phone: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFatherDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveFather} disabled={savingFather}>
              {savingFather ? 'Saving...' : (editingFather ? 'Update' : 'Add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
