'use client'

import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { GraduationCap, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'

interface StudentAnalytics {
  studentId: string
  studentName: string
  yearLevel: 'YEAR_1' | 'YEAR_2' | null
  attendancePercentage: number | null
  examAverage: number | null
  graduationEligible: boolean
  attendanceMet: boolean
  examAverageMet: boolean
  allSectionsMet: boolean
  sundaySchoolMet?: boolean
}

interface Student {
  id: string
  name: string
  email: string
  enrollments?: Array<{
    id: string
    yearLevel: 'YEAR_1' | 'YEAR_2' | null
    isActive: boolean
    status: 'ACTIVE' | 'GRADUATED' | 'WITHDRAWN'
  }>
}

interface GraduationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedStudents: Student[]
  analytics: StudentAnalytics[]
  onGraduate: (enrollmentIds: string[], graduationNote?: string) => Promise<void>
}

export function GraduationDialog({
  open,
  onOpenChange,
  selectedStudents,
  analytics,
  onGraduate
}: GraduationDialogProps) {
  const [exceptionNote, setExceptionNote] = useState('')
  const [confirmException, setConfirmException] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Categorize students
  const categorizedStudents = useMemo(() => {
    const eligible: { student: Student; analytics: StudentAnalytics | undefined }[] = []
    const exceptions: { student: Student; analytics: StudentAnalytics | undefined; issues: string[] }[] = []

    for (const student of selectedStudents) {
      const studentAnalytics = analytics.find(a => a.studentId === student.id)

      if (studentAnalytics?.graduationEligible) {
        eligible.push({ student, analytics: studentAnalytics })
      } else {
        const issues: string[] = []
        if (studentAnalytics) {
          if (!studentAnalytics.attendanceMet) {
            issues.push(`Attendance: ${studentAnalytics.attendancePercentage?.toFixed(1) ?? 'N/A'}% (need 75%)`)
          }
          if (!studentAnalytics.examAverageMet) {
            issues.push(`Exam average: ${studentAnalytics.examAverage?.toFixed(1) ?? 'N/A'}% (need 75%)`)
          }
          if (!studentAnalytics.allSectionsMet) {
            issues.push('One or more sections below 60%')
          }
          if (studentAnalytics.sundaySchoolMet === false) {
            issues.push('Sunday School attendance below 75%')
          }
        } else {
          issues.push('No analytics data available')
        }
        exceptions.push({ student, analytics: studentAnalytics, issues })
      }
    }

    return { eligible, exceptions }
  }, [selectedStudents, analytics])

  const hasExceptions = categorizedStudents.exceptions.length > 0
  const canSubmit = !hasExceptions || (confirmException && exceptionNote.trim().length > 0)

  const handleGraduate = async () => {
    setIsSubmitting(true)
    try {
      const enrollmentIds = selectedStudents
        .filter(s => s.enrollments?.[0]?.id)
        .map(s => s.enrollments![0].id)

      if (enrollmentIds.length === 0) {
        toast.error('No valid enrollments found')
        return
      }

      await onGraduate(enrollmentIds, hasExceptions ? exceptionNote : undefined)
      onOpenChange(false)
      setExceptionNote('')
      setConfirmException(false)
    } catch {
      toast.error('Failed to graduate students')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    setExceptionNote('')
    setConfirmException(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            Graduate Students
          </DialogTitle>
          <DialogDescription>
            You&apos;re about to graduate {selectedStudents.length} student{selectedStudents.length !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Eligible Students */}
          {categorizedStudents.eligible.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="font-medium text-green-800">
                  Eligible ({categorizedStudents.eligible.length})
                </span>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg divide-y divide-green-100">
                {categorizedStudents.eligible.map(({ student, analytics: sa }) => (
                  <div key={student.id} className="p-3">
                    <div className="font-medium text-sm">{student.name}</div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-300">
                        {sa?.attendancePercentage?.toFixed(1) ?? 'N/A'}% attendance
                      </Badge>
                      <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-300">
                        {sa?.examAverage?.toFixed(1) ?? 'N/A'}% exam avg
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Exception Students */}
          {categorizedStudents.exceptions.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <span className="font-medium text-yellow-800">
                  Exceptions ({categorizedStudents.exceptions.length})
                </span>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg divide-y divide-yellow-100">
                {categorizedStudents.exceptions.map(({ student, issues }) => (
                  <div key={student.id} className="p-3">
                    <div className="font-medium text-sm">{student.name}</div>
                    <div className="mt-1 space-y-1">
                      {issues.map((issue, i) => (
                        <div key={i} className="flex items-center gap-1 text-xs text-yellow-700">
                          <XCircle className="h-3 w-3" />
                          {issue}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Exception Note Requirement */}
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800">
                      Exception approval required
                    </p>
                    <p className="text-xs text-amber-700 mt-1">
                      These students don&apos;t meet graduation requirements. Please provide a reason for the exception.
                    </p>
                  </div>
                </div>

                <div className="mt-3 space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="exception-note">Reason for Exception *</Label>
                    <Textarea
                      id="exception-note"
                      value={exceptionNote}
                      onChange={(e) => setExceptionNote(e.target.value)}
                      placeholder="e.g., Special circumstances approved by Fr. Name, medical exemption, etc."
                      rows={3}
                    />
                  </div>

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmException}
                      onChange={(e) => setConfirmException(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-amber-300"
                    />
                    <span className="text-sm text-amber-800">
                      I confirm these exceptions have been approved and understand this will be recorded
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleGraduate}
            disabled={!canSubmit || isSubmitting}
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            <GraduationCap className="h-4 w-4" />
            {isSubmitting ? 'Graduating...' : `Graduate ${selectedStudents.length} Student${selectedStudents.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
