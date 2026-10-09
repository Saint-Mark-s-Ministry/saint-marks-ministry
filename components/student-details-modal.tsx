'use client'

import { useState, useEffect, useMemo } from 'react'
import { ContactLink } from '@/components/contact-link'
import { useSession } from 'next-auth/react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { Edit, Check, X, Trash2, Send, Camera, Plane, Plus, CalendarClock } from 'lucide-react'
import { UserRole } from '@prisma/client'
import { getRoleDisplayName, isAdmin, canManageUsers, canManageData } from '@/lib/roles'
import { formatDateUTC } from '@/lib/utils'
import { StudentProgramEditor, type EditableStudent } from '@/components/student-program-editor'
import { ConfessionTracker } from '@/components/admin/confession-tracker'
import { AttendanceSlipsPanel } from '@/components/admin/attendance-slips-panel'
import { AsyncBadge } from '@/components/async-badge'

interface StudentNote {
  id: string
  content: string
  createdAt: string | Date
  updatedAt: string | Date
  author: {
    id: string
    name: string
    role: UserRole
  }
}

interface ExamScore {
  id: string
  score: number
  percentage: number
  notes?: string
  exam: {
    id: string
    examDate: string | Date
    totalPoints: number
    examSection: {
      id: string
      name: string
      displayName: string
      yearLevel: string
    }
  }
  grader?: {
    id: string
    name: string
  }
}

interface AttendanceRecord {
  id: string
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED'
  arrivedAt?: string | Date
  notes?: string
  conductRemoval?: boolean
  conductNote?: string
  notEnrolledYet?: boolean
  expectedAbsenceId?: string | null
  expectedAbsenceNA?: boolean
  lesson: {
    id: string
    title: string
    scheduledDate: string | Date
    isExamDay?: boolean
    examSection: {
      id: string
      name: string
      displayName: string
      yearLevel: string
    }
    academicYear?: {
      id: string
      name: string
    }
  }
  recorder?: {
    id: string
    name: string
  }
}

interface Exam {
  id: string
  examDate: string | Date
  totalPoints: number
  yearLevel: string
  examSection: {
    id: string
    name: string
    displayName: string
  }
}

interface Lesson {
  id: string
  title: string
  scheduledDate: string | Date
  examSection: {
    id: string
    name: string
    displayName: string
  }
}

interface ExpectedAbsence {
  id: string
  startDate: string
  endDate: string
  reason: string
  markAsNA?: boolean
  creator?: { id: string; name: string } | null
}

interface StudentDetailsModalProps {
  studentId: string | null
  studentName: string // shown until details load
  student?: EditableStudent
  examScores: ExamScore[]
  attendanceRecords: AttendanceRecord[]
  allExams?: Exam[]
  allLessons?: Lesson[]
  loading: boolean
  onClose: () => void
  onRefresh: () => void
}

export function StudentDetailsModal({
  studentId,
  studentName: listName,
  student,
  examScores,
  attendanceRecords,
  allExams = [],
  loading,
  onClose,
  onRefresh
}: StudentDetailsModalProps) {
  const { data: session } = useSession()
  const canEditData = session?.user?.role ? canManageData(session.user.role as UserRole) : false
  const enrollment = student?.enrollments?.[0]
  const studentName = student?.name ?? listName
  const studentEmail = student?.email ?? ''
  const studentPhone = student?.phone ?? ''
  const profileImageUrl = student?.profileImageUrl
  const enrollmentId = enrollment?.id
  const attendanceStartDate = enrollment?.attendanceStartDate
  const isAsyncStudent = !!enrollment?.isAsyncStudent
  // Scoped to this student so the slip and confession panels don't refetch the enrollment
  const scopedEnrollment = useMemo(
    () => (student && enrollment ? { ...enrollment, student: { id: student.id, name: student.name } } : undefined),
    [student, enrollment]
  )
  const [editingScoreId, setEditingScoreId] = useState<string | null>(null)
  const [editingScore, setEditingScore] = useState<number>(0)
  const [editingScoreNotes, setEditingScoreNotes] = useState<string>('')
  const [editingAttendanceId, setEditingAttendanceId] = useState<string | null>(null)

  // Profile editing state
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileName, setProfileName] = useState(studentName)
  const [profileEmail, setProfileEmail] = useState(studentEmail)
  const [profilePhone, setProfilePhone] = useState(studentPhone)
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  // Notes state
  const [notes, setNotes] = useState<StudentNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [newNoteContent, setNewNoteContent] = useState('')
  const [submittingNote, setSubmittingNote] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNoteContent, setEditingNoteContent] = useState('')

  // Expected absences state
  const [expectedAbsences, setExpectedAbsences] = useState<ExpectedAbsence[]>([])
  const [eaStart, setEaStart] = useState('')
  const [eaEnd, setEaEnd] = useState('')
  const [eaReason, setEaReason] = useState('')
  const [eaMarkAsNA, setEaMarkAsNA] = useState(false)
  const [savingAbsence, setSavingAbsence] = useState(false)

  // Late-start attendance date state
  const [startDateInput, setStartDateInput] = useState('')
  const [savingStartDate, setSavingStartDate] = useState(false)

  // Fetch notes when student changes
  useEffect(() => {
    if (studentId) {
      fetchNotes()
      fetchExpectedAbsences()
    } else {
      setNotes([])
      setExpectedAbsences([])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  // Sync the late-start date input with the current enrollment value
  useEffect(() => {
    setStartDateInput(attendanceStartDate ? new Date(attendanceStartDate).toISOString().slice(0, 10) : '')
  }, [attendanceStartDate, studentId])

  const fetchNotes = async () => {
    if (!studentId) return
    setNotesLoading(true)
    try {
      const res = await fetch(`/api/students/${studentId}/notes`)
      if (res.ok) {
        const data = await res.json()
        setNotes(data)
      }
    } catch (error) {
      console.error('Failed to fetch notes:', error)
    } finally {
      setNotesLoading(false)
    }
  }

  const fetchExpectedAbsences = async () => {
    if (!studentId) return
    try {
      const res = await fetch(`/api/students/${studentId}/expected-absences`)
      if (res.ok) {
        const data = await res.json()
        setExpectedAbsences(Array.isArray(data) ? data : [])
      }
    } catch (error) {
      console.error('Failed to fetch expected absences:', error)
    }
  }

  const addExpectedAbsence = async () => {
    if (!studentId || !eaStart || !eaEnd || !eaReason.trim()) return
    setSavingAbsence(true)
    try {
      const res = await fetch(`/api/students/${studentId}/expected-absences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: eaStart, endDate: eaEnd, reason: eaReason.trim(), markAsNA: eaMarkAsNA })
      })
      if (res.ok) {
        toast.success(eaMarkAsNA
          ? 'Expected absence added — overlapping lessons marked N/A (not counted)'
          : 'Expected absence added — overlapping lessons stay Absent until excused')
        setEaStart('')
        setEaEnd('')
        setEaReason('')
        setEaMarkAsNA(false)
        await fetchExpectedAbsences()
        onRefresh()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to add expected absence')
      }
    } catch (error) {
      console.error('Failed to add expected absence:', error)
      toast.error('Failed to add expected absence')
    } finally {
      setSavingAbsence(false)
    }
  }

  const deleteExpectedAbsence = async (id: string) => {
    if (!confirm('Remove this expected absence? Lessons in its range will revert to Absent.')) return
    try {
      const res = await fetch(`/api/expected-absences/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Expected absence removed')
        await fetchExpectedAbsences()
        onRefresh()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to remove expected absence')
      }
    } catch (error) {
      console.error('Failed to remove expected absence:', error)
      toast.error('Failed to remove expected absence')
    }
  }

  const saveAttendanceStartDate = async () => {
    if (!enrollmentId) {
      toast.error('No enrollment found for this student')
      return
    }
    setSavingStartDate(true)
    try {
      const res = await fetch(`/api/enrollments/${enrollmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendanceStartDate: startDateInput || null })
      })
      if (res.ok) {
        toast.success(startDateInput
          ? 'Attendance start date saved — earlier lessons marked N/A'
          : 'Attendance start date cleared')
        onRefresh()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to save attendance start date')
      }
    } catch (error) {
      console.error('Failed to save attendance start date:', error)
      toast.error('Failed to save attendance start date')
    } finally {
      setSavingStartDate(false)
    }
  }

  const addNote = async () => {
    if (!studentId || !newNoteContent.trim()) return
    setSubmittingNote(true)
    try {
      const res = await fetch(`/api/students/${studentId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newNoteContent.trim() })
      })
      if (res.ok) {
        const note = await res.json()
        setNotes([note, ...notes])
        setNewNoteContent('')
        toast.success('Note added successfully!')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to add note')
      }
    } catch (error) {
      console.error('Failed to add note:', error)
      toast.error('Failed to add note')
    } finally {
      setSubmittingNote(false)
    }
  }

  const updateNote = async (noteId: string) => {
    if (!editingNoteContent.trim()) return
    try {
      const res = await fetch(`/api/student-notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingNoteContent.trim() })
      })
      if (res.ok) {
        const updatedNote = await res.json()
        setNotes(notes.map(n => n.id === noteId ? updatedNote : n))
        setEditingNoteId(null)
        setEditingNoteContent('')
        toast.success('Note updated successfully!')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to update note')
      }
    } catch (error) {
      console.error('Failed to update note:', error)
      toast.error('Failed to update note')
    }
  }

  const deleteNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return
    try {
      const res = await fetch(`/api/student-notes/${noteId}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setNotes(notes.filter(n => n.id !== noteId))
        toast.success('Note deleted successfully!')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to delete note')
      }
    } catch (error) {
      console.error('Failed to delete note:', error)
      toast.error('Failed to delete note')
    }
  }

  // Reset profile form when student changes
  const resetProfileForm = () => {
    setProfileName(studentName)
    setProfileEmail(studentEmail)
    setProfilePhone(studentPhone)
    setEditingProfile(false)
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !studentId) return

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload PNG, JPG, or GIF')
      return
    }

    if (file.size > 4.5 * 1024 * 1024) {
      toast.error('File size exceeds 4.5 MB limit')
      return
    }

    setUploadingPhoto(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('userId', studentId)

      const res = await fetch('/api/profile-picture/upload', {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        toast.success('Profile picture updated!')
        onRefresh()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to upload photo')
      }
    } catch (error) {
      console.error('Failed to upload photo:', error)
      toast.error('Failed to upload photo')
    } finally {
      setUploadingPhoto(false)
      // Reset the input so the same file can be re-selected
      e.target.value = ''
    }
  }

  const updateStudentProfile = async () => {
    if (!studentId) return
    setSavingProfile(true)
    try {
      const res = await fetch(`/api/users/${studentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileName,
          email: profileEmail,
          phone: profilePhone || null
        })
      })

      if (res.ok) {
        toast.success('Student profile updated successfully!')
        setEditingProfile(false)
        onRefresh()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to update profile')
      }
    } catch (error) {
      console.error('Failed to update profile:', error)
      toast.error('Failed to update profile')
    } finally {
      setSavingProfile(false)
    }
  }

  const updateExamScore = async (scoreId: string, newScore: number, notes?: string) => {
    try {
      const res = await fetch(`/api/exam-scores/${scoreId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: newScore, notes: notes || null })
      })

      if (res.ok) {
        toast.success('Score updated successfully!')
        onRefresh()
      } else {
        toast.error('Failed to update score')
      }
    } catch (error) {
      console.error('Failed to update score:', error)
      toast.error('Failed to update score')
    }
    setEditingScoreId(null)
  }

  const updateAttendance = async (recordId: string, status: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED') => {
    try {
      const res = await fetch(`/api/attendance/${recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })

      if (res.ok) {
        toast.success('Attendance updated successfully!')
        onRefresh()
      } else {
        toast.error('Failed to update attendance')
      }
    } catch (error) {
      console.error('Failed to update attendance:', error)
      toast.error('Failed to update attendance')
    }
    setEditingAttendanceId(null)
  }

  // Calculate average score
  const avgScore = examScores.length > 0
    ? examScores.reduce((sum, s) => sum + s.percentage, 0) / examScores.length
    : 0

  // Group scores by section (using displayName for better readability)
  const scoresBySection = examScores.reduce((acc, score) => {
    const section = score.exam.examSection.displayName || score.exam.examSection.name
    if (!acc[section]) acc[section] = []
    acc[section].push(score)
    return acc
  }, {} as Record<string, ExamScore[]>)

  // Find missing exams (past exams student hasn't taken - exclude future exams)
  const now = new Date()
  const takenExamIds = new Set(examScores.map(s => s.exam.id))
  const missingExams = allExams.filter(exam =>
    !takenExamIds.has(exam.id) && new Date(exam.examDate) < now
  )

  // Filter out exam day lessons from attendance calculations (they don't count toward graduation)
  const countableAttendance = attendanceRecords.filter(r => !r.lesson.isExamDay)

  // Separate attendance by year level (using section yearLevel for grouping display)
  const year1Attendance = countableAttendance.filter(r =>
    r.lesson.examSection.yearLevel === 'YEAR_1'
  )
  const year2Attendance = countableAttendance.filter(r =>
    r.lesson.examSection.yearLevel === 'YEAR_2'
  )

  // Calculate attendance stats using Formula A: (Present + Late/2) / (Total - Excused) * 100
  const presentCount = countableAttendance.filter(r => r.status === 'PRESENT').length
  const lateCount = countableAttendance.filter(r => r.status === 'LATE').length
  const absentCount = countableAttendance.filter(r => r.status === 'ABSENT').length
  const excusedCount = countableAttendance.filter(r => r.status === 'EXCUSED').length
  // "Not enrolled yet" (late start) and expected-absence N/A records are
  // EXCUSED but excluded from the rate — show them as N/A rather than a
  // regular excuse.
  const naCount = countableAttendance.filter(r => r.notEnrolledYet || r.expectedAbsenceNA).length
  const regularExcusedCount = excusedCount - naCount
  const effectiveTotal = countableAttendance.length - excusedCount
  const attendanceRate = effectiveTotal > 0
    ? ((presentCount + (lateCount / 2)) / effectiveTotal) * 100
    : 0

  // Year 1 attendance stats
  const year1Present = year1Attendance.filter(r => r.status === 'PRESENT').length
  const year1Late = year1Attendance.filter(r => r.status === 'LATE').length
  const year1Absent = year1Attendance.filter(r => r.status === 'ABSENT').length
  const year1Excused = year1Attendance.filter(r => r.status === 'EXCUSED').length
  const year1Na = year1Attendance.filter(r => r.notEnrolledYet || r.expectedAbsenceNA).length
  const year1RegularExcused = year1Excused - year1Na
  const year1EffectiveTotal = year1Attendance.length - year1Excused
  const year1Rate = year1EffectiveTotal > 0
    ? ((year1Present + (year1Late / 2)) / year1EffectiveTotal) * 100
    : 0

  // Year 2 attendance stats
  const year2Present = year2Attendance.filter(r => r.status === 'PRESENT').length
  const year2Late = year2Attendance.filter(r => r.status === 'LATE').length
  const year2Absent = year2Attendance.filter(r => r.status === 'ABSENT').length
  const year2Excused = year2Attendance.filter(r => r.status === 'EXCUSED').length
  const year2Na = year2Attendance.filter(r => r.notEnrolledYet || r.expectedAbsenceNA).length
  const year2RegularExcused = year2Excused - year2Na
  const year2EffectiveTotal = year2Attendance.length - year2Excused
  const year2Rate = year2EffectiveTotal > 0
    ? ((year2Present + (year2Late / 2)) / year2EffectiveTotal) * 100
    : 0

  return (
    <Dialog open={!!studentId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8">
            <span>{studentName} - Details</span>
            <div className="flex items-center gap-2 text-sm font-normal">
              {isAsyncStudent && <AsyncBadge />}
              {enrollment && (
                <Badge variant="outline">{enrollment.yearLevel === 'YEAR_1' ? 'Year 1' : 'Year 2'}</Badge>
              )}
              {enrollment?.mentor && (
                <div className="text-gray-600">
                  Mentor: <span className="font-medium">{enrollment.mentor.name}</span>
                </div>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-gray-500">Loading...</div>
        ) : (
          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="grid w-full grid-cols-5 [&>button]:px-1 [&>button]:text-xs sm:[&>button]:text-sm">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="scores">Exams</TabsTrigger>
              <TabsTrigger value="attendance">Attendance</TabsTrigger>
              <TabsTrigger value="confession">Confession</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="relative group">
                      <Avatar className="h-16 w-16">
                        {profileImageUrl && (
                          <AvatarImage src={profileImageUrl} alt={studentName} />
                        )}
                        <AvatarFallback className="bg-maroon-600 text-white text-lg">
                          {studentName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      {session?.user?.role && canManageUsers(session.user.role as UserRole) && (
                        <>
                          <button
                            type="button"
                            onClick={() => document.getElementById(`photo-upload-${studentId}`)?.click()}
                            disabled={uploadingPhoto}
                            className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            <Camera className="h-5 w-5 text-white" />
                          </button>
                          <input
                            id={`photo-upload-${studentId}`}
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/gif"
                            className="hidden"
                            onChange={handlePhotoUpload}
                            disabled={uploadingPhoto}
                          />
                        </>
                      )}
                      {uploadingPhoto && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                          <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    <h3 className="font-semibold flex-1">Student Information</h3>
                    {!editingProfile ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setProfileName(studentName)
                          setProfileEmail(studentEmail)
                          setProfilePhone(studentPhone)
                          setEditingProfile(true)
                        }}
                        className="gap-1"
                      >
                        <Edit className="h-4 w-4" />
                        Edit
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={resetProfileForm}
                          disabled={savingProfile}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={updateStudentProfile}
                          disabled={savingProfile}
                          className="gap-1"
                        >
                          <Check className="h-4 w-4" />
                          {savingProfile ? 'Saving...' : 'Save'}
                        </Button>
                      </div>
                    )}
                  </div>

                  {editingProfile ? (
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700">Full Name</label>
                        <Input
                          value={profileName}
                          onChange={(e) => setProfileName(e.target.value)}
                          placeholder="Full Name"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Email</label>
                        <Input
                          type="email"
                          value={profileEmail}
                          onChange={(e) => setProfileEmail(e.target.value)}
                          placeholder="Email"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Phone (optional)</label>
                        <Input
                          type="tel"
                          value={profilePhone}
                          onChange={(e) => setProfilePhone(e.target.value)}
                          placeholder="Phone number"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-gray-600">Name</span>
                        <span className="font-medium">{studentName}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-gray-600">Email</span>
                        {studentEmail ? <ContactLink kind="email" value={studentEmail} name={studentName} label="student email" className="font-medium" /> : <span className="font-medium">-</span>}
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-gray-600">Phone</span>
                        {studentPhone ? <ContactLink kind="phone" value={studentPhone} name={studentName} label="student phone number" className="font-medium" /> : <span className="font-medium">-</span>}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              {student && <StudentProgramEditor student={student} onRefresh={onRefresh} />}
            </TabsContent>

            <TabsContent value="notes" className="space-y-4">
              {/* Add New Note */}
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-3">Add a Note</h3>
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Write a note about this student..."
                      value={newNoteContent}
                      onChange={(e) => setNewNoteContent(e.target.value)}
                      className="flex-1"
                      rows={2}
                    />
                    <Button
                      onClick={addNote}
                      disabled={submittingNote || !newNoteContent.trim()}
                      className="self-end"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Notes List */}
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-3">
                    Comments ({notes.length})
                  </h3>
                  {notesLoading ? (
                    <div className="py-4 text-center text-gray-500">Loading notes...</div>
                  ) : notes.length === 0 ? (
                    <div className="py-4 text-center text-gray-500">No notes yet. Add the first one!</div>
                  ) : (
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                      {notes.map((note) => {
                        const isAuthor = session?.user?.id === note.author.id
                        const isEditing = editingNoteId === note.id

                        return (
                          <div key={note.id} className="p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-sm">{note.author.name}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {getRoleDisplayName(note.author.role)}
                                  </Badge>
                                  <span className="text-xs text-gray-500">
                                    {new Date(note.createdAt).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                      hour: 'numeric',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                </div>
                                {isEditing ? (
                                  <div className="space-y-2">
                                    <Textarea
                                      value={editingNoteContent}
                                      onChange={(e) => setEditingNoteContent(e.target.value)}
                                      className="text-sm"
                                      rows={2}
                                    />
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        onClick={() => updateNote(note.id)}
                                        disabled={!editingNoteContent.trim()}
                                      >
                                        <Check className="h-3 w-3 mr-1" />
                                        Save
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setEditingNoteId(null)
                                          setEditingNoteContent('')
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                                )}
                              </div>
                              {!isEditing && (isAuthor || (session?.user?.role && isAdmin(session.user.role as UserRole))) && (
                                <div className="flex gap-1">
                                  {isAuthor && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        setEditingNoteId(note.id)
                                        setEditingNoteContent(note.content)
                                      }}
                                      className="h-7 w-7 p-0"
                                    >
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => deleteNote(note.id)}
                                    className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="scores" className="space-y-4">
              {/* Score Summary */}
              <Card>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-gray-500">Average Score</div>
                      <div className={`text-2xl font-bold ${avgScore >= 75 ? 'text-green-700' : avgScore >= 60 ? 'text-yellow-700' : 'text-red-700'}`}>
                        {avgScore.toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Exams Taken</div>
                      <div className="text-2xl font-bold">{examScores.length}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Scores by Section */}
              {Object.keys(scoresBySection).length === 0 ? (
                <div className="text-center py-8 text-gray-500">No exam scores yet</div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(scoresBySection).map(([section, scores]) => (
                    <Card key={section}>
                      <CardContent className="pt-4">
                        <h3 className="font-semibold mb-3">{section}</h3>
                        <div className="space-y-2">
                          {scores.map((score) => (
                            <div key={score.id} className="p-2 bg-gray-50 rounded">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="font-medium text-sm">
                                    {score.exam.examSection.displayName} Exam
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {formatDateUTC(score.exam.examDate, {
                                      weekday: undefined,
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric'
                                    })}
                                    {score.grader && ` • Graded by ${score.grader.name}`}
                                  </div>
                                  {!editingScoreId && score.notes && (
                                    <div className="text-xs text-gray-600 mt-1 italic">{score.notes}</div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {editingScoreId === score.id ? (
                                    <>
                                      <Input
                                        type="number"
                                        value={isNaN(editingScore) ? '' : editingScore}
                                        onChange={(e) => {
                                          const val = e.target.value === '' ? 0 : parseFloat(e.target.value)
                                          setEditingScore(isNaN(val) ? 0 : val)
                                        }}
                                        className="w-20 h-8 text-sm"
                                        max={score.exam.totalPoints}
                                        min={0}
                                      />
                                      <span className="text-sm text-gray-500">/ {score.exam.totalPoints}</span>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => updateExamScore(score.id, editingScore, editingScoreNotes)}
                                        className="h-8 w-8 p-0"
                                      >
                                        <Check className="h-4 w-4 text-green-600" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setEditingScoreId(null)}
                                        className="h-8 w-8 p-0"
                                      >
                                        <X className="h-4 w-4 text-red-600" />
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <div className="text-right">
                                        <div className={`font-semibold ${score.percentage >= 75 ? 'text-green-700' : score.percentage >= 60 ? 'text-yellow-700' : 'text-red-700'}`}>
                                          {score.percentage.toFixed(2)}%
                                        </div>
                                        <div className="text-xs text-gray-500">
                                          {score.score} / {score.exam.totalPoints}
                                        </div>
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          setEditingScoreId(score.id)
                                          setEditingScore(score.score)
                                          setEditingScoreNotes(score.notes || '')
                                        }}
                                        className="h-8 w-8 p-0"
                                      >
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                              {editingScoreId === score.id && (
                                <div className="mt-2">
                                  <Textarea
                                    placeholder="Notes (optional)"
                                    value={editingScoreNotes}
                                    onChange={(e) => setEditingScoreNotes(e.target.value)}
                                    className="text-sm"
                                    rows={2}
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Missing Exams */}
              {missingExams.length > 0 && (
                <Card>
                  <CardContent className="pt-4">
                    <h3 className="font-semibold mb-3 text-amber-700">Missing Exams ({missingExams.length})</h3>
                    <div className="space-y-2">
                      {missingExams.map((exam) => (
                        <div key={exam.id} className="p-2 bg-amber-50 rounded border border-amber-200">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-sm">{exam.examSection.displayName}</div>
                              <div className="text-xs text-gray-500">
                                {formatDateUTC(exam.examDate, {
                                  weekday: undefined,
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                                {' • '}
                                Out of {exam.totalPoints} points
                              </div>
                            </div>
                            <Badge variant="outline" className="text-amber-700 border-amber-700">
                              Not Taken
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="attendance" className="space-y-4">
              {scopedEnrollment && (
                <AttendanceSlipsPanel enrollment={scopedEnrollment} canEdit={canEditData} onChange={onRefresh} />
              )}

              {/* Late-start attendance date (admins only) */}
              {canEditData && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-1">
                      <CalendarClock className="h-4 w-4 text-maroon-600" />
                      <h3 className="font-semibold">Attendance Start Date</h3>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">
                      For students who joined late. Lessons before this date are marked
                      <span className="font-medium"> N/A (Late start)</span> and excluded from the attendance rate.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="date"
                        value={startDateInput}
                        onChange={(e) => setStartDateInput(e.target.value)}
                        className="w-auto"
                        disabled={!enrollmentId}
                      />
                      <Button size="sm" onClick={saveAttendanceStartDate} disabled={savingStartDate || !enrollmentId}>
                        {savingStartDate ? 'Saving...' : 'Save'}
                      </Button>
                      {startDateInput && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setStartDateInput(''); }}
                          disabled={savingStartDate}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                    {!enrollmentId && (
                      <p className="text-xs text-amber-600 mt-2">This student has no enrollment yet.</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Expected absences (admins only) */}
              {canEditData && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-1">
                      <Plane className="h-4 w-4 text-maroon-600" />
                      <h3 className="font-semibold">Expected Absences</h3>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">
                      Block out a date range (e.g. travel). Lessons in the range are marked
                      <span className="font-medium"> Absent</span> with this reason and count against
                      the attendance rate until you manually excuse them. Check
                      <span className="font-medium"> Mark as N/A</span> to instead exclude these
                      dates from the attendance rate entirely.
                    </p>

                    {/* Add form */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="text-xs text-gray-500">From</label>
                        <Input type="date" value={eaStart} onChange={(e) => setEaStart(e.target.value)} className="mt-1" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">To</label>
                        <Input type="date" value={eaEnd} onChange={(e) => setEaEnd(e.target.value)} className="mt-1" />
                      </div>
                    </div>
                    <Textarea
                      placeholder="Reason (e.g. Travelling abroad)"
                      value={eaReason}
                      onChange={(e) => setEaReason(e.target.value)}
                      rows={2}
                      className="mb-2"
                    />
                    <label className="flex items-center gap-2 mb-3 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={eaMarkAsNA}
                        onChange={(e) => setEaMarkAsNA(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <span>
                        Mark as N/A
                        <span className="text-xs text-gray-500"> — exclude these dates from the attendance rate</span>
                      </span>
                    </label>
                    <Button
                      size="sm"
                      onClick={addExpectedAbsence}
                      disabled={savingAbsence || !eaStart || !eaEnd || !eaReason.trim()}
                      className="gap-1"
                    >
                      <Plus className="h-4 w-4" />
                      {savingAbsence ? 'Adding...' : 'Add Expected Absence'}
                    </Button>

                    {/* List */}
                    {expectedAbsences.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {expectedAbsences.map((ea) => (
                          <div key={ea.id} className="flex items-start justify-between gap-2 p-2 bg-blue-50 rounded border border-blue-100">
                            <div className="min-w-0">
                              <div className="text-sm font-medium flex items-center gap-2">
                                <span>
                                  {formatDateUTC(ea.startDate, { month: 'short', day: 'numeric', year: 'numeric' })}
                                  {' – '}
                                  {formatDateUTC(ea.endDate, { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                                {ea.markAsNA ? (
                                  <Badge className="bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0" title="Lessons in this range are excluded from the attendance rate">N/A</Badge>
                                ) : (
                                  <Badge className="bg-red-50 text-red-700 border border-red-200 text-[10px] px-1.5 py-0" title="Lessons in this range count as Absent until manually excused">Absent until excused</Badge>
                                )}
                              </div>
                              <div className="text-xs text-gray-600 break-words">{ea.reason}</div>
                              {ea.creator && (
                                <div className="text-[11px] text-gray-400">Added by {ea.creator.name}</div>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteExpectedAbsence(ea.id)}
                              className="h-7 w-7 p-0 text-red-600 hover:text-red-700 shrink-0"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Attendance Summary - Overall */}
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-3">Overall Attendance</h3>
                  <div className={`grid grid-cols-2 gap-4 ${naCount > 0 ? 'md:grid-cols-6' : 'md:grid-cols-5'}`}>
                    <div>
                      <div className="text-sm text-gray-500">Rate</div>
                      <div className={`text-xl md:text-2xl font-bold whitespace-nowrap tabular-nums ${attendanceRate >= 75 ? 'text-green-700' : attendanceRate >= 60 ? 'text-yellow-700' : 'text-red-700'}`}>
                        {attendanceRate.toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Present</div>
                      <div className="text-2xl font-bold text-green-700">{presentCount}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Late</div>
                      <div className="text-2xl font-bold text-yellow-700">{lateCount}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Absent</div>
                      <div className="text-2xl font-bold text-red-700">{absentCount}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Excused</div>
                      <div className="text-2xl font-bold text-blue-700">{regularExcusedCount}</div>
                    </div>
                    {naCount > 0 && (
                      <div>
                        <div className="text-sm text-gray-500">N/A</div>
                        <div className="text-2xl font-bold text-gray-500">{naCount}</div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Year 1 Attendance */}
              {year1Attendance.length > 0 && (
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3">Year 1 Attendance</h3>
                    <div className={`grid grid-cols-2 gap-4 ${year1Na > 0 ? 'md:grid-cols-6' : 'md:grid-cols-5'}`}>
                      <div>
                        <div className="text-sm text-gray-500">Rate</div>
                        <div className={`text-xl md:text-2xl font-bold whitespace-nowrap tabular-nums ${year1Rate >= 75 ? 'text-green-700' : year1Rate >= 60 ? 'text-yellow-700' : 'text-red-700'}`}>
                          {year1Rate.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Present</div>
                        <div className="text-2xl font-bold text-green-700">{year1Present}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Late</div>
                        <div className="text-2xl font-bold text-yellow-700">{year1Late}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Absent</div>
                        <div className="text-2xl font-bold text-red-700">{year1Absent}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Excused</div>
                        <div className="text-2xl font-bold text-blue-700">{year1RegularExcused}</div>
                      </div>
                      {year1Na > 0 && (
                        <div>
                          <div className="text-sm text-gray-500">N/A</div>
                          <div className="text-2xl font-bold text-gray-500">{year1Na}</div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Year 2 Attendance */}
              {year2Attendance.length > 0 && (
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3">Year 2 Attendance</h3>
                    <div className={`grid grid-cols-2 gap-4 ${year2Na > 0 ? 'md:grid-cols-6' : 'md:grid-cols-5'}`}>
                      <div>
                        <div className="text-sm text-gray-500">Rate</div>
                        <div className={`text-xl md:text-2xl font-bold whitespace-nowrap tabular-nums ${year2Rate >= 75 ? 'text-green-700' : year2Rate >= 60 ? 'text-yellow-700' : 'text-red-700'}`}>
                          {year2Rate.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Present</div>
                        <div className="text-2xl font-bold text-green-700">{year2Present}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Late</div>
                        <div className="text-2xl font-bold text-yellow-700">{year2Late}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Absent</div>
                        <div className="text-2xl font-bold text-red-700">{year2Absent}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Excused</div>
                        <div className="text-2xl font-bold text-blue-700">{year2RegularExcused}</div>
                      </div>
                      {year2Na > 0 && (
                        <div>
                          <div className="text-sm text-gray-500">N/A</div>
                          <div className="text-2xl font-bold text-gray-500">{year2Na}</div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Attendance Records */}
              {attendanceRecords.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No attendance records yet</div>
              ) : (
                <div className="space-y-2">
                  {attendanceRecords.map((record) => (
                    <div key={record.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div className="flex-1">
                        <div className="font-medium text-sm flex items-center gap-2">
                          {formatDateUTC(record.lesson.scheduledDate, {
                            weekday: undefined,
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal bg-blue-50 text-blue-700 border-blue-200">
                            {record.lesson.examSection.displayName}
                          </Badge>
                        </div>
                        <div className="text-xs text-gray-500">
                          {record.lesson.title}
                        </div>
                        {/* Attendance note (expected-absence reason, conduct note, or free note) */}
                        {record.conductRemoval && record.conductNote ? (
                          <div className="text-xs text-orange-600 mt-1 break-words">
                            Removed from lesson: {record.conductNote}
                          </div>
                        ) : record.notes ? (
                          <div className="text-xs text-gray-600 mt-1 italic break-words">
                            {record.notEnrolledYet ? '' : record.expectedAbsenceId ? 'Expected absence: ' : ''}{record.notes}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        {editingAttendanceId === record.id ? (
                          <>
                            <select
                              value={record.status}
                              onChange={(e) => updateAttendance(record.id, e.target.value as 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED')}
                              className="border rounded px-2 py-1 text-sm dark:bg-gray-800 dark:text-white dark:border-gray-600"
                            >
                              <option value="PRESENT">Present</option>
                              <option value="LATE">Late</option>
                              <option value="ABSENT">Absent</option>
                              <option value="EXCUSED">Excused</option>
                            </select>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingAttendanceId(null)}
                              className="h-8 w-8 p-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            {record.notEnrolledYet ? (
                              <Badge className="bg-gray-100 text-gray-600" title="Lesson before this student joined — not counted">N/A</Badge>
                            ) : record.expectedAbsenceNA ? (
                              <Badge className="bg-gray-100 text-gray-600" title="Expected absence — not counted">N/A</Badge>
                            ) : (
                              <>
                                {record.status === 'PRESENT' && (
                                  <Badge className="bg-green-100 text-green-800">Present</Badge>
                                )}
                                {record.status === 'LATE' && (
                                  <Badge className="bg-yellow-100 text-yellow-800">Late</Badge>
                                )}
                                {record.status === 'ABSENT' && (
                                  <Badge className="bg-red-100 text-red-800">Absent</Badge>
                                )}
                                {record.status === 'EXCUSED' && (
                                  <Badge className="bg-blue-100 text-blue-800">Excused</Badge>
                                )}
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingAttendanceId(record.id)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="confession" className="space-y-4">
              {scopedEnrollment
                ? <ConfessionTracker enrollment={scopedEnrollment} canEdit={canEditData} />
                : <div className="py-8 text-center text-gray-500">Not enrolled in the program.</div>}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
