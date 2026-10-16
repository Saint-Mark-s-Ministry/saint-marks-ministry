'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { GraduationCap, ArrowUpCircle, CalendarPlus, X, Calendar, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
import type { AcademicYear, StudentAnalytics } from '@/lib/types'

interface YearEndReviewPanelProps {
  activeYear: AcademicYear | null
  analytics: StudentAnalytics[]
  onGraduateEligible: () => void
  onPromoteYear1: () => void
  onYearCreated: () => void
  isVisible: boolean
  onToggle: () => void
}

export function YearEndReviewPanel({
  activeYear,
  analytics,
  onGraduateEligible,
  onPromoteYear1,
  onYearCreated,
  isVisible,
  onToggle
}: YearEndReviewPanelProps) {
  const [showCreateYearDialog, setShowCreateYearDialog] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formName, setFormName] = useState('')
  const [formStartDate, setFormStartDate] = useState('')
  const [formEndDate, setFormEndDate] = useState('')
  const [autoShow, setAutoShow] = useState(false)

  // Calculate counts
  const year2Students = analytics.filter(a => a.yearLevel === 'YEAR_2')
  const year1Students = analytics.filter(a => a.yearLevel === 'YEAR_1')
  const eligibleForGraduation = year2Students.filter(a => a.graduationEligible)
  const needsReview = year2Students.filter(a => !a.graduationEligible)

  // Check if we should auto-show based on date
  useEffect(() => {
    if (activeYear) {
      const endDate = new Date(activeYear.endDate)
      const now = new Date()
      const daysUntilEnd = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      // Auto-show if within 60 days of year end
      if (daysUntilEnd <= 60 && daysUntilEnd > -30) {
        setAutoShow(true)
      }
    }
  }, [activeYear])

  // Suggest next year name
  useEffect(() => {
    if (activeYear && showCreateYearDialog) {
      // Parse current year name like "2025-2026" to suggest next
      const match = activeYear.name.match(/(\d{4})-(\d{4})/)
      if (match) {
        const nextStart = parseInt(match[2])
        const nextEnd = nextStart + 1
        setFormName(`${nextStart}-${nextEnd}`)
        setFormStartDate(`${nextStart}-09-01`)
        setFormEndDate(`${nextEnd}-06-30`)
      }
    }
  }, [activeYear, showCreateYearDialog])

  const handleCreateYear = async () => {
    if (!formName || !formStartDate || !formEndDate) {
      toast.error('Please fill in all required fields')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/academic-years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          startDate: formStartDate,
          endDate: formEndDate,
          isActive: false  // Don't make active immediately - let admin choose when
        })
      })

      if (res.ok) {
        toast.success(`Academic year "${formName}" created successfully`)
        setShowCreateYearDialog(false)
        onYearCreated()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to create academic year')
      }
    } catch {
      toast.error('Failed to create academic year')
    } finally {
      setSaving(false)
    }
  }

  // Calculate days until year end
  const daysUntilEnd = activeYear
    ? Math.ceil((new Date(activeYear.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null

  const showPanel = isVisible || (autoShow && daysUntilEnd !== null && daysUntilEnd <= 60)

  // Collapsed, the Students page header's "Year-end review" button opens it.
  if (!showPanel) return null

  return (
    <>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-ink-3" />
              <div>
                <h3 className="font-semibold text-ink">Year-End Review</h3>
                {activeYear && daysUntilEnd !== null && (
                  <p className="text-[13px] text-ink-3">
                    {activeYear.name} {daysUntilEnd > 0 ? `ends in ${daysUntilEnd} days` : daysUntilEnd === 0 ? 'ends today' : `ended ${Math.abs(daysUntilEnd)} days ago`}
                  </p>
                )}
              </div>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Close year-end review">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-md bg-raised p-3">
              <div className="text-2xl font-bold text-green-600">{eligibleForGraduation.length}</div>
              <div className="text-xs text-gray-600">Eligible to Graduate</div>
            </div>
            <div className="rounded-md bg-raised p-3">
              <div className="text-2xl font-bold text-yellow-600">{needsReview.length}</div>
              <div className="text-xs text-gray-600">Need Review</div>
            </div>
            <div className="rounded-md bg-raised p-3">
              <div className="text-2xl font-bold text-blue-600">{year1Students.length}</div>
              <div className="text-xs text-gray-600">Year 1 to Promote</div>
            </div>
            <div className="rounded-md bg-raised p-3">
              <div className="text-2xl font-bold text-gray-600">{year2Students.length}</div>
              <div className="text-xs text-gray-600">Total Year 2</div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Graduate Eligible */}
            <button
              onClick={onGraduateEligible}
              disabled={eligibleForGraduation.length === 0}
              className="flex items-start gap-3 p-3 bg-white rounded-lg border border-amber-100 hover:border-green-300 hover:bg-green-50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="p-2 bg-green-100 rounded-lg">
                <GraduationCap className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="font-medium text-gray-900">Graduate Eligible</div>
                <div className="text-sm text-gray-600">
                  {eligibleForGraduation.length} student{eligibleForGraduation.length !== 1 ? 's' : ''} ready
                </div>
                {needsReview.length > 0 && (
                  <Badge variant="outline" className="mt-1 text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {needsReview.length} need review
                  </Badge>
                )}
              </div>
            </button>

            {/* Promote Year 1 */}
            <button
              onClick={onPromoteYear1}
              disabled={year1Students.length === 0}
              className="flex items-start gap-3 p-3 bg-white rounded-lg border border-amber-100 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="p-2 bg-blue-100 rounded-lg">
                <ArrowUpCircle className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="font-medium text-gray-900">Promote to Year 2</div>
                <div className="text-sm text-gray-600">
                  {year1Students.length} Year 1 student{year1Students.length !== 1 ? 's' : ''}
                </div>
              </div>
            </button>

            {/* Create New Year */}
            <button
              onClick={() => setShowCreateYearDialog(true)}
              className="flex items-start gap-3 p-3 bg-white rounded-lg border border-amber-100 hover:border-purple-300 hover:bg-purple-50 transition-colors text-left"
            >
              <div className="p-2 bg-purple-100 rounded-lg">
                <CalendarPlus className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <div className="font-medium text-gray-900">Create New Year</div>
                <div className="text-sm text-gray-600">
                  Set up next academic year
                </div>
              </div>
            </button>
          </div>

          {/* Expandable list of students needing review */}
          {needsReview.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-amber-700 hover:text-amber-900 flex items-center gap-1">
                <ChevronDown className="h-4 w-4 details-open:hidden" />
                <ChevronUp className="h-4 w-4 hidden details-open:inline" />
                View {needsReview.length} student{needsReview.length !== 1 ? 's' : ''} needing review
              </summary>
              <div className="mt-2 bg-white rounded-lg border border-amber-100 divide-y divide-amber-50">
                {needsReview.map(student => (
                  <div key={student.studentId} className="p-2 text-sm">
                    <div className="font-medium">{student.studentName}</div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {!student.attendanceMet && (
                        <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                          Attendance: {student.attendancePercentage?.toFixed(1) ?? 'N/A'}%
                        </Badge>
                      )}
                      {!student.examAverageMet && (
                        <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                          Exam Avg: {student.examAverage?.toFixed(1) ?? 'N/A'}%
                        </Badge>
                      )}
                      {!student.allSectionsMet && (
                        <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                          Section below 60%
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {/* Create Academic Year Dialog */}
      <Dialog open={showCreateYearDialog} onOpenChange={setShowCreateYearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Academic Year</DialogTitle>
            <DialogDescription>
              Add a new academic year for the upcoming class cycle
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="year-name">Name</Label>
              <Input
                id="year-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., 2026-2027"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="year-start">Start Date</Label>
                <Input
                  id="year-start"
                  type="date"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="year-end">End Date</Label>
                <Input
                  id="year-end"
                  type="date"
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                />
              </div>
            </div>
            <p className="text-sm text-gray-500">
              The new year will be created but not set as active. You can activate it from Settings when you&apos;re ready.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateYearDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateYear} disabled={saving}>
              {saving ? 'Creating...' : 'Create Year'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
