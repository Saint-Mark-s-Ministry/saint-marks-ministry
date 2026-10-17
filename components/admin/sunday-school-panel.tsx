'use client'

import { StudentProfileLink } from '@/components/student-profile-link'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { ROTATION_LEVELS } from '@/lib/rotation-forms'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TableSkeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { RotationFormsReview } from '@/components/rotation-forms-review'
import { RotationProgressOverview } from '@/components/rotation-progress-overview'
import {
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  Users,
  ClipboardList,
  BarChart3,
  Loader2,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AcademicYear {
  id: string
  name: string
  isActive: boolean
}

type SundaySchoolGrade =
  | 'PRE_K'
  | 'KINDERGARTEN'
  | 'GRADE_1'
  | 'GRADE_2'
  | 'GRADE_3'
  | 'GRADE_4'
  | 'GRADE_5'
  | 'GRADE_6_PLUS'

const GRADE_DISPLAY_NAMES: Record<SundaySchoolGrade, string> = {
  PRE_K: 'Pre-K',
  KINDERGARTEN: 'Kindergarten',
  GRADE_1: '1st Grade',
  GRADE_2: '2nd Grade',
  GRADE_3: '3rd Grade',
  GRADE_4: '4th Grade',
  GRADE_5: '5th Grade',
  GRADE_6_PLUS: '6th Grade+',
}

const ALL_GRADES: SundaySchoolGrade[] = [
  'PRE_K',
  'KINDERGARTEN',
  'GRADE_1',
  'GRADE_2',
  'GRADE_3',
  'GRADE_4',
  'GRADE_5',
  'GRADE_6_PLUS',
]

interface AsyncStudent {
  id: string
  name: string
  email: string
}

interface SSAssignment {
  id: string
  studentId: string
  student: { id: string; name: string; email: string }
  grade: SundaySchoolGrade
  /** The Sunday School class served in; older rotations have only a grade. */
  classId?: string | null
  class?: { id: string; name: string; level?: string } | null
  academicYearId: string
  academicYear?: { id: string; name: string }
  startDate: string
  totalWeeks: number
  presentCount: number
  totalLogged: number
  isActive: boolean
  rotationForm?: { status: string } | null
  /** Attendance over the weeks that have started; null before week 1. */
  percentage: number | null
  yearLevel?: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gradeDisplayName(grade: SundaySchoolGrade): string {
  return GRADE_DISPLAY_NAMES[grade] ?? grade
}

/** A rotation's class name, or its grade for rotations made before classes were linked. */
function rotationPlace(a: { grade: SundaySchoolGrade; class?: { name: string } | null }): string {
  return a.class?.name ?? gradeDisplayName(a.grade)
}

function FormStatusBadge({ status }: { status?: string }) {
  switch (status) {
    case 'PENDING': return <Badge variant="secondary">Awaiting review</Badge>
    case 'REJECTED': return <Badge variant="destructive">Changes requested</Badge>
    case 'APPROVED': return <Badge className="bg-ok-tint text-ok">Approved</Badge>
    default: return <Badge variant="outline">Not submitted</Badge>
  }
}

function getSundayOfCurrentWeek(): string {
  const now = new Date()
  const day = now.getUTCDay()
  const diff = now.getUTCDate() - day
  const sunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff))
  return sunday.toISOString().split('T')[0]
}

// ---------------------------------------------------------------------------
// Main panel component
// ---------------------------------------------------------------------------

export function SundaySchoolPanel({ canManage, canManageAttendance, readOnly: _readOnly }: { canManage: boolean; canManageAttendance: boolean; readOnly: boolean }) {
  return (
    <Tabs defaultValue="attendance">
      <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:flex">
        <TabsTrigger value="assignments" className="gap-1 text-xs sm:text-sm">
          <Users className="h-3.5 w-3.5 hidden sm:block" />
          Assignments
        </TabsTrigger>
        <TabsTrigger value="attendance" className="gap-1 text-xs sm:text-sm">
          <ClipboardList className="h-3.5 w-3.5 hidden sm:block" />
          Rotation forms
        </TabsTrigger>
        <TabsTrigger value="progress" className="gap-1 text-xs sm:text-sm">
          <BarChart3 className="h-3.5 w-3.5 hidden sm:block" />
          Progress
        </TabsTrigger>
      </TabsList>

      <TabsContent value="assignments">
        <AssignmentsTab canManage={canManage} />
      </TabsContent>
      <TabsContent value="attendance">
        <RotationFormsReview canReview={canManageAttendance} />
      </TabsContent>
      <TabsContent value="progress">
        <RotationProgressOverview />
      </TabsContent>
    </Tabs>
  )
}

// ===========================================================================
// Tab 1: Assignments
// ===========================================================================

function AssignmentsTab({ canManage }: { canManage: boolean }) {
  const [assignments, setAssignments] = useState<SSAssignment[]>([])
  const [sortBy, setSortBy] = useState('name')
  const sortedAssignments = useMemo(() => {
    const gradeRank = (assignment: SSAssignment) => {
      const rank = ROTATION_LEVELS.findIndex(level => level === (assignment.class?.level ?? assignment.grade))
      if (rank >= 0) return rank
      return !assignment.class?.level && assignment.grade === 'GRADE_6_PLUS' ? 7 : Number.MAX_SAFE_INTEGER
    }
    return [...assignments].sort((a, b) => {
      if (sortBy === 'grade') {
        const gradeOrder = gradeRank(a) - gradeRank(b)
        if (gradeOrder) return gradeOrder
      }
      return a.student.name.localeCompare(b.student.name, 'en', { sensitivity: 'base', numeric: true })
        || Number(b.isActive) - Number(a.isActive)
        || rotationPlace(a).localeCompare(rotationPlace(b), 'en', { numeric: true })
    })
  }, [assignments, sortBy])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<SSAssignment | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Form state
  const [asyncStudents, setAsyncStudents] = useState<AsyncStudent[]>([])
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
  const [formStudentId, setFormStudentId] = useState('')
  const [formGrade, setFormGrade] = useState<SundaySchoolGrade>('PRE_K')
  const [formClassId, setFormClassId] = useState('')
  const [classOptions, setClassOptions] = useState<Array<{ id: string; name: string }>>([])
  const [formYearId, setFormYearId] = useState('')
  const [formStartDate, setFormStartDate] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchAssignments = useCallback(async () => {
    try {
      const res = await fetch('/api/sunday-school/assignments')
      if (res.ok) {
        const data = await res.json()
        setAssignments(Array.isArray(data) ? data : [])
      } else {
        toast.error('Failed to load assignments')
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load assignments')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const refresh = () => void fetchAssignments()
    const timer = window.setInterval(refresh, 15000)
    window.addEventListener('rotation-updated', refresh)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('rotation-updated', refresh); window.removeEventListener('focus', refresh) }
  }, [fetchAssignments])

  const fetchFormData = useCallback(async () => {
    try {
      const [studentsRes, yearsRes, classesRes] = await Promise.all([
        fetch('/api/sunday-school/assignments?unassigned=true'),
        fetch('/api/academic-years'),
        fetch('/api/sunday-school/assignments?classOptions=true'),
      ])
      if (classesRes.ok) {
        const data = await classesRes.json()
        setClassOptions(Array.isArray(data) ? data : [])
      }
      if (studentsRes.ok) {
        const data = await studentsRes.json()
        setAsyncStudents(Array.isArray(data) ? data : [])
      }
      if (yearsRes.ok) {
        const data = await yearsRes.json()
        const years = Array.isArray(data) ? data : []
        setAcademicYears(years)
        const active = years.find((y: AcademicYear) => y.isActive)
        if (active && !formYearId) setFormYearId(active.id)
      }
    } catch {
      // silently fail -- the user will see empty dropdowns
    }
  }, [formYearId])

  useEffect(() => {
    fetchAssignments()
    fetchFormData()
  }, [fetchAssignments, fetchFormData])

  const openCreateDialog = () => {
    setEditingAssignment(null)
    setFormStudentId('')
    setFormGrade('PRE_K')
    setFormClassId('')
    setFormStartDate(getSundayOfCurrentWeek())
    setDialogOpen(true)
  }

  const openEditDialog = (a: SSAssignment) => {
    setEditingAssignment(a)
    setFormStudentId(a.studentId)
    setFormGrade(a.grade)
    setFormClassId(a.classId ?? '')
    setFormYearId(a.academicYearId)
    setFormStartDate(a.startDate ? a.startDate.split('T')[0] : '')
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formStudentId && !editingAssignment) {
      toast.error('Please select a student')
      return
    }
    if (!formYearId) {
      toast.error('Please select an academic year')
      return
    }

    setSaving(true)
    try {
      if (classOptions.length > 0 && !formClassId) {
        toast.error('Please select a Sunday School class')
        setSaving(false)
        return
      }
      const payload = {
        studentId: formStudentId,
        // The class sets the grade on the server; the grade list is only a fallback
        ...(formClassId ? { classId: formClassId } : { grade: formGrade }),
        academicYearId: formYearId,
        startDate: formStartDate,
        totalWeeks: 4,
      }

      const url = editingAssignment
        ? `/api/sunday-school/assignments/${editingAssignment.id}`
        : '/api/sunday-school/assignments'

      const method = editingAssignment ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save assignment')
      }

      const now = new Date()
      toast.success(editingAssignment ? 'Assignment updated' : 'Assignment created', {
        description: now.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }),
      })
      setDialogOpen(false)
      fetchAssignments()
      fetchFormData()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save assignment')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/sunday-school/assignments/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete assignment')
      }
      toast.success('Assignment deleted')
      fetchAssignments()
      fetchFormData()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete assignment')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return <TableSkeleton rows={4} columns={canManage ? 5 : 4} />
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <CardTitle className="text-lg">
              SS Assignments ({assignments.length})
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="assignment-sort">Sort by</Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger id="assignment-sort" className="w-[210px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Student name (A–Z)</SelectItem>
                  <SelectItem value="grade">Grade (Pre-K to 8th)</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={fetchAssignments} className="gap-1">
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              {canManage && (
                <Button size="sm" onClick={openCreateDialog} className="gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  Assign Student
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              No Sunday School assignments yet.
              {canManage && ' Click "Assign Student" to get started.'}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Student</th>
                      <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Class</th>
                      <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Year</th>
                      <th className="text-center p-3 font-medium text-gray-700 dark:text-gray-300">Form status</th>
                      {canManage && (
                        <th className="text-center p-3 font-medium text-gray-700 dark:text-gray-300">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAssignments.map((a) => {
                      return (
                        <tr key={a.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-900">
                          <td className="p-3">
                            <StudentProfileLink studentId={a.studentId}>{a.student.name}</StudentProfileLink>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{a.student.email}</div>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1"><Badge variant="outline">{rotationPlace(a)}</Badge><Badge variant="outline">{a.isActive ? 'Current' : 'Past'}</Badge></div>
                          </td>
                          <td className="p-3">
                            <span className="text-sm dark:text-gray-300">
                              {a.academicYear?.name ?? '---'}
                            </span>
                          </td>
                          <td className="p-3 text-center dark:text-gray-300">
                            <FormStatusBadge status={a.rotationForm?.status} />
                          </td>
                          {canManage && (
                            <td className="p-3 text-center">
                              <div className="flex justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditDialog(a)}
                                  title="Edit assignment"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(a.id)}
                                  disabled={deletingId === a.id || a.totalLogged > 0 || Boolean(a.rotationForm)}
                                  title="Delete assignment"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                                >
                                  {deletingId === a.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {sortedAssignments.map((a) => {
                  return (
                    <Card key={a.id}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm dark:text-white truncate">
                              <StudentProfileLink studentId={a.studentId}>{a.student.name}</StudentProfileLink>
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {rotationPlace(a)}
                              </Badge>
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <FormStatusBadge status={a.rotationForm?.status} />
                          </div>
                        </div>
                        {canManage && (
                          <div className="flex gap-1 mt-2 pt-2 border-t">
                            <Button variant="outline" size="sm" className="flex-1 text-xs gap-1" onClick={() => openEditDialog(a)}>
                              <Pencil className="h-3 w-3" /> Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950"
                              onClick={() => handleDelete(a.id)}
                              disabled={deletingId === a.id || a.totalLogged > 0 || Boolean(a.rotationForm)}
                            >
                              {deletingId === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                              Delete
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAssignment ? 'Edit Assignment' : 'Assign Student'}</DialogTitle>
            <DialogDescription>
              {editingAssignment
                ? 'Update the Sunday School assignment details.'
                : 'Assign an async student to a Sunday School grade.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Student selector (only for create) */}
            {!editingAssignment && (
              <div className="space-y-2">
                <Label>Student</Label>
                <Select value={formStudentId} onValueChange={setFormStudentId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a student" />
                  </SelectTrigger>
                  <SelectContent>
                    {asyncStudents.length === 0 ? (
                      <SelectItem value="_none" disabled>
                        No unassigned async students
                      </SelectItem>
                    ) : (
                      asyncStudents.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Class selector (Sunday School classes); grades only when no classes exist */}
            {classOptions.length > 0 ? (
              <div className="space-y-2">
                <Label>Sunday School class</Label>
                <Select value={formClassId} onValueChange={setFormClassId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>SS Grade</Label>
                <Select value={formGrade} onValueChange={(v) => setFormGrade(v as SundaySchoolGrade)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select grade" />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_GRADES.map((g) => (
                      <SelectItem key={g} value={g}>
                        {gradeDisplayName(g)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Academic year selector */}
            <div className="space-y-2">
              <Label>Academic Year</Label>
              <Select value={formYearId} onValueChange={setFormYearId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {academicYears.map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.name}{y.isActive ? ' (Active)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Start date */}
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
              />
            </div>

            <p className="text-sm text-ink-2">Each rotation is four weeks. Approving the completed form automatically assigns the next grade.</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingAssignment ? 'Update' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
