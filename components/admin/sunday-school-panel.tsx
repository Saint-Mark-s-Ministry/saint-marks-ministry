'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
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
import {
  Plus,
  Printer,
  RefreshCw,
  Pencil,
  Trash2,
  Check,
  X,
  Shield,
  Users,
  QrCode,
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
  class?: { id: string; name: string } | null
  academicYearId: string
  academicYear?: { id: string; name: string }
  startDate: string
  totalWeeks: number
  presentCount: number
  totalLogged: number
  /** Attendance over the weeks that have started; null before week 1. */
  percentage: number | null
  yearLevel?: string
}

interface SSCode {
  id: string
  grade: SundaySchoolGrade
  code: string
  weekOf: string
  validUntil: string
  usedByCount: number
  isActive: boolean
}

interface SSLogEntry {
  id: string
  weekNumber: number
  weekOf: string
  status: 'PENDING' | 'APPROVED' | 'EXCUSED' | 'REJECTED'
  code?: string
  notes?: string
  reviewedBy?: { name: string }
  createdAt: string
}

interface SSProgress {
  studentId: string
  studentName: string
  grade: SundaySchoolGrade
  yearLevel?: string
  presentCount: number
  totalWeeks: number
  percentage: number
  met: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gradeDisplayName(grade: SundaySchoolGrade): string {
  return GRADE_DISPLAY_NAMES[grade] ?? grade
}

/** A rotation's class name, or its grade for rotations made before classes were linked. */
function rotationPlace(a: { grade: SundaySchoolGrade; class?: { name: string } | null }): string {
  return a.class?.name ?? rotationPlace(a)
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
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
    <Tabs defaultValue="assignments">
      <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:flex">
        <TabsTrigger value="assignments" className="gap-1 text-xs sm:text-sm">
          <Users className="h-3.5 w-3.5 hidden sm:block" />
          Assignments
        </TabsTrigger>
        <TabsTrigger value="codes" className="gap-1 text-xs sm:text-sm">
          <QrCode className="h-3.5 w-3.5 hidden sm:block" />
          Codes
        </TabsTrigger>
        <TabsTrigger value="attendance" className="gap-1 text-xs sm:text-sm">
          <ClipboardList className="h-3.5 w-3.5 hidden sm:block" />
          Attendance
        </TabsTrigger>
        <TabsTrigger value="progress" className="gap-1 text-xs sm:text-sm">
          <BarChart3 className="h-3.5 w-3.5 hidden sm:block" />
          Progress
        </TabsTrigger>
      </TabsList>

      <TabsContent value="assignments">
        <AssignmentsTab canManage={canManage} />
      </TabsContent>
      <TabsContent value="codes">
        <CodesTab canManage={canManage} />
      </TabsContent>
      <TabsContent value="attendance">
        <AttendanceTab canManageAttendance={canManageAttendance} />
      </TabsContent>
      <TabsContent value="progress">
        <ProgressTab />
      </TabsContent>
    </Tabs>
  )
}

// ===========================================================================
// Tab 1: Assignments
// ===========================================================================

function AssignmentsTab({ canManage }: { canManage: boolean }) {
  const [assignments, setAssignments] = useState<SSAssignment[]>([])
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
  const [formTotalWeeks, setFormTotalWeeks] = useState(6)
  const [saving, setSaving] = useState(false)

  const fetchAssignments = useCallback(async () => {
    setLoading(true)
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
    setFormTotalWeeks(6)
    setDialogOpen(true)
  }

  const openEditDialog = (a: SSAssignment) => {
    setEditingAssignment(a)
    setFormStudentId(a.studentId)
    setFormGrade(a.grade)
    setFormClassId(a.classId ?? '')
    setFormYearId(a.academicYearId)
    setFormStartDate(a.startDate ? a.startDate.split('T')[0] : '')
    setFormTotalWeeks(a.totalWeeks)
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
        totalWeeks: formTotalWeeks,
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
    return <TableSkeleton rows={4} columns={6} />
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <CardTitle className="text-lg">
              SS Assignments ({assignments.length})
            </CardTitle>
            <div className="flex gap-2">
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
                      <th className="text-center p-3 font-medium text-gray-700 dark:text-gray-300">Progress</th>
                      <th className="text-center p-3 font-medium text-gray-700 dark:text-gray-300">Percentage</th>
                      {canManage && (
                        <th className="text-center p-3 font-medium text-gray-700 dark:text-gray-300">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((a) => {
                      const pct = Math.round(a.percentage ?? 0) // weeks so far; computed by the API
                      const pctColor = pct >= 75 ? 'text-green-700 dark:text-green-400' : pct >= 50 ? 'text-yellow-700 dark:text-yellow-400' : 'text-red-700 dark:text-red-400'
                      return (
                        <tr key={a.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-900">
                          <td className="p-3">
                            <div className="font-medium dark:text-white">{a.student.name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{a.student.email}</div>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline">{rotationPlace(a)}</Badge>
                          </td>
                          <td className="p-3">
                            <span className="text-sm dark:text-gray-300">
                              {a.academicYear?.name ?? '---'}
                            </span>
                            {a.yearLevel && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                {a.yearLevel === 'YEAR_1' ? 'Y1' : 'Y2'}
                              </Badge>
                            )}
                          </td>
                          <td className="p-3 text-center dark:text-gray-300">
                            {a.presentCount}/{a.totalWeeks}
                          </td>
                          <td className={`p-3 text-center font-semibold ${pctColor}`}>
                            {pct}%
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
                                  disabled={deletingId === a.id}
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
                {assignments.map((a) => {
                  const pct = Math.round(a.percentage ?? 0) // weeks so far; computed by the API
                  const pctColor = pct >= 75 ? 'text-green-700 dark:text-green-400' : pct >= 50 ? 'text-yellow-700 dark:text-yellow-400' : 'text-red-700 dark:text-red-400'
                  return (
                    <Card key={a.id}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm dark:text-white truncate">
                              {a.student.name}
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {rotationPlace(a)}
                              </Badge>
                              {a.yearLevel && (
                                <Badge variant="outline" className="text-xs">
                                  {a.yearLevel === 'YEAR_1' ? 'Y1' : 'Y2'}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <div className={`text-sm font-semibold ${pctColor}`}>{pct}%</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {a.presentCount}/{a.totalWeeks}
                            </div>
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
                              disabled={deletingId === a.id}
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

            {/* Total weeks */}
            <div className="space-y-2">
              <Label>Total Weeks</Label>
              <Input
                type="number"
                min={1}
                max={52}
                value={formTotalWeeks}
                onChange={(e) => setFormTotalWeeks(parseInt(e.target.value) || 6)}
              />
            </div>
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

// ===========================================================================
// Tab 2: Codes
// ===========================================================================

function CodesTab({ canManage }: { canManage: boolean }) {
  const [codes, setCodes] = useState<SSCode[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [weekOf, setWeekOf] = useState(getSundayOfCurrentWeek())

  const fetchCodes = useCallback(async (w?: string) => {
    setLoading(true)
    try {
      const target = w || weekOf
      const res = await fetch(`/api/sunday-school/codes?weekOf=${target}`)
      if (res.ok) {
        const data = await res.json()
        setCodes(Array.isArray(data) ? data : [])
      } else {
        setCodes([])
      }
    } catch {
      setCodes([])
    } finally {
      setLoading(false)
    }
  }, [weekOf])

  useEffect(() => {
    fetchCodes()
  }, [fetchCodes])

  const handleGenerate = async () => {
    if (!weekOf) {
      toast.error('Please select a week date')
      return
    }
    setGenerating(true)
    try {
      const res = await fetch('/api/sunday-school/codes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekOf }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to generate codes')
      }
      toast.success('Codes generated successfully', {
        description: `Codes for week of ${formatDate(weekOf)}`,
      })
      fetchCodes(weekOf)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate codes')
    } finally {
      setGenerating(false)
    }
  }

  const handlePrint = () => {
    const printContent = codes
      .map(
        (c) =>
          `<tr>
            <td style="padding:8px;border:1px solid #ddd;">${gradeDisplayName(c.grade)}</td>
            <td style="padding:8px;border:1px solid #ddd;font-family:monospace;font-size:18px;font-weight:bold;letter-spacing:2px;">${c.code}</td>
            <td style="padding:8px;border:1px solid #ddd;">${formatDate(c.validUntil)}</td>
          </tr>`
      )
      .join('')

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sunday School Codes - Week of ${formatDate(weekOf)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          h2 { font-size: 14px; color: #666; margin-top: 0; }
          table { border-collapse: collapse; width: 100%; margin-top: 16px; }
          th { background: #f5f5f5; padding: 10px; border: 1px solid #ddd; text-align: left; font-size: 13px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>Sunday School Attendance Codes</h1>
        <h2>Week of ${formatDate(weekOf)}</h2>
        <table>
          <thead><tr><th>Grade</th><th>Code</th><th>Valid Until</th></tr></thead>
          <tbody>${printContent}</tbody>
        </table>
      </body>
      </html>
    `

    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
      win.focus()
      win.print()
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <CardTitle className="text-lg">Attendance Codes</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                value={weekOf}
                onChange={(e) => setWeekOf(e.target.value)}
                className="w-40 h-9 text-sm"
              />
              <Button variant="outline" size="sm" onClick={() => fetchCodes(weekOf)} className="gap-1">
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Load</span>
              </Button>
              {canManage && (
                <Button size="sm" onClick={handleGenerate} disabled={generating} className="gap-1">
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Generate Codes
                </Button>
              )}
              {codes.length > 0 && (
                <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1">
                  <Printer className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Print</span>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={4} columns={5} />
          ) : codes.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              No codes found for week of {formatDate(weekOf)}.
              {canManage && ' Click "Generate Codes" to create them.'}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Grade</th>
                      <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Code</th>
                      <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Valid Until</th>
                      <th className="text-center p-3 font-medium text-gray-700 dark:text-gray-300">Used By</th>
                      <th className="text-center p-3 font-medium text-gray-700 dark:text-gray-300">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {codes.map((c) => (
                      <tr key={c.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-900">
                        <td className="p-3 dark:text-gray-300">{gradeDisplayName(c.grade)}</td>
                        <td className="p-3">
                          <code className="font-mono text-base font-bold tracking-widest bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded dark:text-white">
                            {c.code}
                          </code>
                        </td>
                        <td className="p-3 text-gray-600 dark:text-gray-400">{formatDate(c.validUntil)}</td>
                        <td className="p-3 text-center dark:text-gray-300">{c.usedByCount}</td>
                        <td className="p-3 text-center">
                          {c.isActive ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-gray-500 dark:text-gray-400">
                              Expired
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {codes.map((c) => (
                  <Card key={c.id}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium dark:text-white">{gradeDisplayName(c.grade)}</div>
                          <code className="font-mono text-lg font-bold tracking-widest mt-1 block dark:text-white">
                            {c.code}
                          </code>
                        </div>
                        <div className="text-right">
                          {c.isActive ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-gray-500 dark:text-gray-400">
                              Expired
                            </Badge>
                          )}
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {c.usedByCount} used
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Valid until {formatDate(c.validUntil)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ===========================================================================
// Tab 3: Attendance
// ===========================================================================

function AttendanceTab({ canManageAttendance }: { canManageAttendance: boolean }) {
  const [assignments, setAssignments] = useState<SSAssignment[]>([])
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('')
  const [logs, setLogs] = useState<SSLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [logsLoading, setLogsLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [notesDialogOpen, setNotesDialogOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<{
    assignmentId: string
    weekNumber: number
    status: string
  } | null>(null)
  const [adminNotes, setAdminNotes] = useState('')

  const fetchAssignments = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sunday-school/assignments')
      if (res.ok) {
        const data = await res.json()
        setAssignments(Array.isArray(data) ? data : [])
      }
    } catch {
      // handled silently
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAssignments()
  }, [fetchAssignments])

  const fetchLogs = useCallback(async (assignmentId: string) => {
    setLogsLoading(true)
    try {
      const res = await fetch(`/api/sunday-school/assignments/${assignmentId}/logs`)
      if (res.ok) {
        const data = await res.json()
        setLogs(Array.isArray(data) ? data : [])
      } else {
        setLogs([])
      }
    } catch {
      setLogs([])
    } finally {
      setLogsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedAssignmentId) {
      fetchLogs(selectedAssignmentId)
    } else {
      setLogs([])
    }
  }, [selectedAssignmentId, fetchLogs])

  const selectedAssignment = useMemo(
    () => assignments.find((a) => a.id === selectedAssignmentId),
    [assignments, selectedAssignmentId]
  )

  // Build week-by-week view
  const weekEntries = useMemo(() => {
    if (!selectedAssignment) return []
    const totalWeeks = selectedAssignment.totalWeeks
    const entries: Array<{
      weekNumber: number
      log: SSLogEntry | null
    }> = []
    for (let w = 1; w <= totalWeeks; w++) {
      const log = logs.find((l) => l.weekNumber === w) ?? null
      entries.push({ weekNumber: w, log })
    }
    return entries
  }, [selectedAssignment, logs])

  const initiateAction = (assignmentId: string, weekNumber: number, status: string) => {
    setPendingAction({ assignmentId, weekNumber, status })
    setAdminNotes('')
    setNotesDialogOpen(true)
  }

  const executeAction = async () => {
    if (!pendingAction) return
    setNotesDialogOpen(false)
    const actionKey = `${pendingAction.weekNumber}-${pendingAction.status}`
    setActionLoading(actionKey)
    try {
      const res = await fetch('/api/sunday-school/logs/admin-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentId: pendingAction.assignmentId,
          weekNumber: pendingAction.weekNumber,
          status: pendingAction.status,
          notes: adminNotes || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update attendance')
      }
      toast.success(`Week ${pendingAction.weekNumber} marked as ${pendingAction.status.toLowerCase()}`)
      fetchLogs(pendingAction.assignmentId)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to update attendance')
    } finally {
      setActionLoading(null)
      setPendingAction(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">Approved</Badge>
      case 'EXCUSED':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">Excused</Badge>
      case 'REJECTED':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">Rejected</Badge>
      case 'PENDING':
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">Pending</Badge>
      default:
        return <Badge variant="outline" className="text-gray-500 dark:text-gray-400">Not Logged</Badge>
    }
  }

  if (loading) {
    return <TableSkeleton rows={4} columns={5} />
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <CardTitle className="text-lg">SS Attendance Review</CardTitle>
            <div className="w-full sm:w-72">
              <Select value={selectedAssignmentId} onValueChange={setSelectedAssignmentId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a student" />
                </SelectTrigger>
                <SelectContent>
                  {assignments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.student.name} - {rotationPlace(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedAssignmentId ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              Select a student to view their week-by-week attendance.
            </div>
          ) : logsLoading ? (
            <TableSkeleton rows={6} columns={4} />
          ) : (
            <>
              {/* Assignment summary */}
              {selectedAssignment && (
                <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Student:</span>{' '}
                      <span className="font-medium dark:text-white">{selectedAssignment.student.name}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Grade:</span>{' '}
                      <span className="font-medium dark:text-white">{rotationPlace(selectedAssignment)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Weeks:</span>{' '}
                      <span className="font-medium dark:text-white">{selectedAssignment.totalWeeks}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Present:</span>{' '}
                      <span className="font-medium dark:text-white">{selectedAssignment.presentCount}/{selectedAssignment.totalWeeks}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Week</th>
                      <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Date</th>
                      <th className="text-center p-3 font-medium text-gray-700 dark:text-gray-300">Status</th>
                      <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Notes</th>
                      {canManageAttendance && (
                        <th className="text-center p-3 font-medium text-gray-700 dark:text-gray-300">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {weekEntries.map(({ weekNumber, log }) => {
                      const isLoading = actionLoading === `${weekNumber}-APPROVED` ||
                        actionLoading === `${weekNumber}-EXCUSED` ||
                        actionLoading === `${weekNumber}-REJECTED`
                      return (
                        <tr key={weekNumber} className="border-b hover:bg-gray-50 dark:hover:bg-gray-900">
                          <td className="p-3 font-medium dark:text-white">Week {weekNumber}</td>
                          <td className="p-3 text-gray-600 dark:text-gray-400">
                            {log?.weekOf ? formatDate(log.weekOf) : '---'}
                          </td>
                          <td className="p-3 text-center">
                            {getStatusBadge(log?.status ?? 'NOT_LOGGED')}
                          </td>
                          <td className="p-3 text-gray-600 dark:text-gray-400 text-xs max-w-xs truncate">
                            {log?.notes || '---'}
                            {log?.reviewedBy && (
                              <span className="ml-1 text-gray-400">(by {log.reviewedBy.name})</span>
                            )}
                          </td>
                          {canManageAttendance && (
                            <td className="p-3 text-center">
                              {isLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                              ) : (
                                <div className="flex justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => initiateAction(selectedAssignmentId, weekNumber, 'APPROVED')}
                                    title="Manual Approve"
                                    className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => initiateAction(selectedAssignmentId, weekNumber, 'EXCUSED')}
                                    title="Excuse"
                                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                                  >
                                    <Shield className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => initiateAction(selectedAssignmentId, weekNumber, 'REJECTED')}
                                    title="Reject"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {weekEntries.map(({ weekNumber, log }) => {
                  const isLoading = actionLoading === `${weekNumber}-APPROVED` ||
                    actionLoading === `${weekNumber}-EXCUSED` ||
                    actionLoading === `${weekNumber}-REJECTED`
                  return (
                    <Card key={weekNumber}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-sm dark:text-white">Week {weekNumber}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {log?.weekOf ? formatDate(log.weekOf) : 'Not logged'}
                            </div>
                          </div>
                          {getStatusBadge(log?.status ?? 'NOT_LOGGED')}
                        </div>
                        {log?.notes && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{log.notes}</div>
                        )}
                        {canManageAttendance && (
                          <div className="flex gap-1 mt-2 pt-2 border-t">
                            {isLoading ? (
                              <div className="flex items-center justify-center w-full py-1">
                                <Loader2 className="h-4 w-4 animate-spin" />
                              </div>
                            ) : (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 text-xs gap-1 text-green-600 border-green-200 hover:bg-green-50 dark:hover:bg-green-950"
                                  onClick={() => initiateAction(selectedAssignmentId, weekNumber, 'APPROVED')}
                                >
                                  <Check className="h-3 w-3" /> Approve
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 text-xs gap-1 text-blue-600 border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950"
                                  onClick={() => initiateAction(selectedAssignmentId, weekNumber, 'EXCUSED')}
                                >
                                  <Shield className="h-3 w-3" /> Excuse
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950"
                                  onClick={() => initiateAction(selectedAssignmentId, weekNumber, 'REJECTED')}
                                >
                                  <X className="h-3 w-3" /> Reject
                                </Button>
                              </>
                            )}
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

      {/* Admin notes dialog for attendance actions */}
      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingAction?.status === 'APPROVED' && 'Manual Approve'}
              {pendingAction?.status === 'EXCUSED' && 'Excuse Absence'}
              {pendingAction?.status === 'REJECTED' && 'Reject Attendance'}
            </DialogTitle>
            <DialogDescription>
              Week {pendingAction?.weekNumber} - Add an optional note for this action.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Input
              placeholder="Reason for this action..."
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={executeAction}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ===========================================================================
// Tab 4: Progress
// ===========================================================================

function ProgressTab() {
  const [progress, setProgress] = useState<SSProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterGrade, setFilterGrade] = useState<string>('all')

  const fetchProgress = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sunday-school/progress')
      if (res.ok) {
        const data = await res.json()
        setProgress(Array.isArray(data) ? data : [])
      } else {
        setProgress([])
      }
    } catch {
      setProgress([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProgress()
  }, [fetchProgress])

  const filteredProgress = useMemo(() => {
    return progress.filter((p) => {
      if (searchTerm && !p.studentName.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false
      }
      if (filterGrade !== 'all' && p.grade !== filterGrade) {
        return false
      }
      return true
    })
  }, [progress, searchTerm, filterGrade])

  const metCount = filteredProgress.filter((p) => p.met).length
  const notMetCount = filteredProgress.filter((p) => !p.met).length

  if (loading) {
    return <TableSkeleton rows={6} columns={6} />
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold dark:text-white">{filteredProgress.length}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Total Students</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-green-700 dark:text-green-400">{metCount}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Met Requirement</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">{notMetCount}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Not Met</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <CardTitle className="text-lg">
              SS Progress Overview
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Search students..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-40 sm:w-48 h-9 text-sm"
              />
              <Select value={filterGrade} onValueChange={setFilterGrade}>
                <SelectTrigger className="w-36 sm:w-40">
                  <SelectValue placeholder="Filter by grade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Grades</SelectItem>
                  {ALL_GRADES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {gradeDisplayName(g)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={fetchProgress} className="gap-1 h-9">
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredProgress.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              No progress data found.
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Student</th>
                      <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Grade</th>
                      <th className="text-center p-3 font-medium text-gray-700 dark:text-gray-300">Year</th>
                      <th className="text-center p-3 font-medium text-gray-700 dark:text-gray-300">Present / Total</th>
                      <th className="text-center p-3 font-medium text-gray-700 dark:text-gray-300">Percentage</th>
                      <th className="text-center p-3 font-medium text-gray-700 dark:text-gray-300">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProgress.map((p) => {
                      const pctColor = p.percentage >= 75
                        ? 'text-green-700 dark:text-green-400'
                        : 'text-red-700 dark:text-red-400'
                      return (
                        <tr key={p.studentId} className="border-b hover:bg-gray-50 dark:hover:bg-gray-900">
                          <td className="p-3 font-medium dark:text-white">{p.studentName}</td>
                          <td className="p-3">
                            <Badge variant="outline">{gradeDisplayName(p.grade)}</Badge>
                          </td>
                          <td className="p-3 text-center">
                            {p.yearLevel ? (
                              <Badge variant="outline" className="text-xs">
                                {p.yearLevel === 'YEAR_1' ? 'Y1' : 'Y2'}
                              </Badge>
                            ) : (
                              <span className="text-gray-400">---</span>
                            )}
                          </td>
                          <td className="p-3 text-center dark:text-gray-300">
                            {p.presentCount}/{p.totalWeeks}
                          </td>
                          <td className={`p-3 text-center font-semibold ${pctColor}`}>
                            {p.percentage}%
                          </td>
                          <td className="p-3 text-center">
                            {p.met ? (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                                Met
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
                                Not Met
                              </Badge>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {filteredProgress.map((p) => {
                  const pctColor = p.percentage >= 75
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-red-700 dark:text-red-400'
                  return (
                    <Card key={p.studentId}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm dark:text-white truncate">
                              {p.studentName}
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {gradeDisplayName(p.grade)}
                              </Badge>
                              {p.yearLevel && (
                                <Badge variant="outline" className="text-xs">
                                  {p.yearLevel === 'YEAR_1' ? 'Y1' : 'Y2'}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <div className={`text-sm font-semibold ${pctColor}`}>
                              {p.percentage}%
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {p.presentCount}/{p.totalWeeks}
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 pt-2 border-t flex justify-end">
                          {p.met ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 text-xs">
                              Met
                            </Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 text-xs">
                              Not Met
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
