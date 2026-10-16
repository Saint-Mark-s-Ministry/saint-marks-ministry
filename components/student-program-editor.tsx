'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { EnrollmentStatus, RegistrationStatus, UserRole, YearLevel } from '@prisma/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { canManageAllUsers, canManageEnrollments, canManageUsers, getRoleDisplayName } from '@/lib/roles'
import { formatToastTimestamp, withCurrentOption } from '@/lib/utils'
import { fetcher, staticDataConfig } from '@/lib/swr'
import type { MentorContact } from '@/lib/mentor-contact'
import { ContactLink } from '@/components/contact-link'

/** The student record returned by /api/students/[id]/details */
export interface EditableStudent {
  id: string
  name: string
  email: string
  phone: string | null
  profileImageUrl: string | null
  role: UserRole
  isDisabled: boolean
  enrollments?: Array<{
    id: string
    studentId: string
    yearLevel: YearLevel | null
    status: EnrollmentStatus
    academicYearId: string | null
    attendanceStartDate: string | null
    enrolledAt: string
    mentorId: string | null
    mentorContact?: MentorContact | null
    mentor?: { id: string; name: string } | null
    fatherOfConfessionId: string | null
    fatherOfConfession?: { id: string; name: string } | null
    isAsyncStudent: boolean
    asyncReason: string | null
  }>
  annualMentorRequirement?: {
    activeYear: { id: string; name: string }
    enrollment: { approvalFormUrl: string | null }
    information: { mentorName: string; mentorPhone: string; mentorEmail: string; updatedAt: string; reviewedAt: string | null } | null
  } | null
  createdFromRegistration?: Array<{
    id: string
    status: RegistrationStatus
    createdAt: string
    reviewedAt: string | null
    reviewNote: string | null
    approvalFormUrl: string | null
    fatherOfConfessionName: string | null
    mentorName: string | null
    mentorPhone: string | null
    mentorEmail: string | null
    reviewer: { name: string } | null
  }>
}

interface Option {
  id: string
  name: string
  role?: UserRole
}

const REGISTRATION_BADGE: Record<RegistrationStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-yellow-100 text-yellow-800' },
  APPROVED: { label: 'Approved', className: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-800' },
}

const selectClass = 'border rounded px-2 py-1.5 text-sm w-full dark:bg-gray-800 dark:text-white dark:border-gray-600 disabled:opacity-60'

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4 py-2 border-b last:border-0">
      <label htmlFor={id} className="text-sm text-gray-600 shrink-0">{label}</label>
      <div className="sm:w-72">{children}</div>
    </div>
  )
}

function SelectField({ id, label, value, disabled, onChange, options, empty }: {
  id: string
  label: string
  value: string | null
  disabled: boolean
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  empty?: string
}) {
  return (
    <Field id={id} label={label}>
      <select id={id} className={selectClass} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {empty && <option value="">{empty}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  )
}

const toOptions = (items: { id: string; name: string }[]) => items.map(i => ({ value: i.id, label: i.name }))

/** Every editable field for a student in one place: account, enrollment, async status, registration. */
export function StudentProgramEditor({ student, onRefresh }: { student: EditableStudent; onRefresh: () => void }) {
  const { data: session } = useSession()
  const myRole = session?.user?.role as UserRole | undefined
  const canEdit = !!myRole && canManageEnrollments(myRole)
  const canEditRole = !!myRole && canManageUsers(myRole)
  const isSuperAdmin = !!myRole && canManageAllUsers(myRole)
  const enrollment = student.enrollments?.[0]
  const registration = student.createdFromRegistration?.[0]
  const renewal = student.annualMentorRequirement

  const { data: mentors = [] } = useSWR<Option[]>(
    canEdit ? '/api/mentor-options' : null,
    fetcher,
    staticDataConfig
  )
  const { data: fathers = [] } = useSWR<Option[]>('/api/fathers-of-confession', fetcher, staticDataConfig)
  const { data: years = [] } = useSWR<Option[]>('/api/academic-years', fetcher, staticDataConfig)
  const [saving, setSaving] = useState(false)
  const [choosingInPersonYearFor, setChoosingInPersonYearFor] = useState<string | null>(null)

  const save = async (url: string, body: object, message: string, method = 'PATCH') => {
    setSaving(true)
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      toast.success(message, { description: formatToastTimestamp() })
      onRefresh()
      return true
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
      return false
    } finally {
      setSaving(false)
    }
  }

  const saveEnrollment = (body: object, message: string) =>
    enrollment && save(`/api/enrollments/${enrollment.id}`, body, message)

  const roleOptions: UserRole[] = [UserRole.STUDENT, UserRole.MENTOR]
  const enrollmentLocked = !canEdit || saving

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-2">Program &amp; Account</h3>

          {isSuperAdmin ? (
            <Field id="student-access" label="Access">
              <div id="student-access" className="text-sm">
                <span className="font-medium">{getRoleDisplayName(student.role)}</span>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add or remove this person&apos;s access tags from User Management.
                </p>
              </div>
            </Field>
          ) : (
            <SelectField
              id="student-role"
              label="Role"
              value={student.role}
              disabled={!canEditRole || saving}
              options={(roleOptions.includes(student.role) ? roleOptions : [student.role, ...roleOptions])
                .map(r => ({ value: r, label: getRoleDisplayName(r) }))}
              onChange={(value) => {
                const role = value as UserRole
                if (role !== UserRole.STUDENT && !confirm(`Change this student to ${getRoleDisplayName(role)}? They will no longer appear in the student list.`)) return
                save(`/api/users/${student.id}`, { role }, 'Role updated')
              }}
            />
          )}

          <Field id="student-disabled" label="Account">
            {isSuperAdmin ? (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  id="student-disabled"
                  type="checkbox"
                  className="h-4 w-4 rounded"
                  checked={student.isDisabled}
                  disabled={saving}
                  onChange={(e) => save('/api/users/bulk-disable', { userIds: [student.id], isDisabled: e.target.checked }, e.target.checked ? 'Account disabled' : 'Account enabled', 'POST')}
                />
                Disabled (can&apos;t sign in)
              </label>
            ) : (
              <span id="student-disabled" className="text-sm font-medium">{student.isDisabled ? 'Disabled' : 'Active'}</span>
            )}
          </Field>

          {!enrollment ? (
            <div className="py-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-amber-700">Not enrolled in the program.</span>
              {canEdit && [YearLevel.YEAR_1, YearLevel.YEAR_2].map(yearLevel => (
                <Button
                  key={yearLevel}
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => save('/api/enrollments', { studentId: student.id, yearLevel, isActive: true }, 'Student enrolled', 'POST')}
                >
                  Enroll in {yearLevel === YearLevel.YEAR_1 ? 'Year 1' : 'Year 2'}
                </Button>
              ))}
              {canEdit && (
                <Button size="sm" variant="outline" disabled={saving}
                  onClick={() => save('/api/enrollments', { studentId: student.id, isAsyncStudent: true, isActive: true }, 'Student enrolled as async', 'POST')}
                >
                  Enroll as async
                </Button>
              )}
            </div>
          ) : (
            <>
              {!enrollment.isAsyncStudent && (
                <SelectField
                  id="student-year-level"
                  label="Year level"
                  value={enrollment.yearLevel}
                  disabled={enrollmentLocked}
                  options={[{ value: YearLevel.YEAR_1, label: 'Year 1' }, { value: YearLevel.YEAR_2, label: 'Year 2' }]}
                  onChange={(yearLevel) => saveEnrollment({ yearLevel }, 'Year level updated')}
                />
              )}
              <SelectField
                id="student-status"
                label="Enrollment status"
                value={enrollment.status}
                disabled={enrollmentLocked}
                options={[
                  { value: EnrollmentStatus.ACTIVE, label: 'Active' },
                  { value: EnrollmentStatus.GRADUATED, label: 'Graduated' },
                  { value: EnrollmentStatus.WITHDRAWN, label: 'Withdrawn' },
                ]}
                onChange={(status) => saveEnrollment({ status }, 'Enrollment status updated')}
              />
              <SelectField
                id="student-academic-year"
                label="Start academic year"
                value={enrollment.academicYearId}
                disabled={enrollmentLocked}
                empty="Not set"
                options={toOptions(years)}
                onChange={(academicYearId) => saveEnrollment({ academicYearId }, 'Academic year updated')}
              />
              <Field id="student-mentor-contact" label="Submitted mentor contact">
                <div id="student-mentor-contact" role="group" aria-label="Submitted mentor contact" className="flex flex-col gap-1 text-sm">
                  {enrollment.mentorContact ? <>
                    <span>{enrollment.mentorContact.name}</span>
                    {enrollment.mentorContact.email && <ContactLink kind="email" value={enrollment.mentorContact.email} name={enrollment.mentorContact.name} />}
                    {enrollment.mentorContact.phone && <ContactLink kind="phone" value={enrollment.mentorContact.phone} name={enrollment.mentorContact.name} />}
                  </> : <span className="text-muted-foreground">Not provided</span>}
                </div>
              </Field>
              <SelectField
                id="student-mentor"
                label="Assigned mentor account"
                value={enrollment.mentorId}
                disabled={enrollmentLocked}
                empty="Not assigned"
                options={toOptions(withCurrentOption(mentors, enrollment.mentor))}
                onChange={(mentorId) => saveEnrollment({ mentorId }, 'Mentor updated')}
              />
              {enrollment.mentorContact && enrollment.mentorContact.name !== enrollment.mentor?.name && (
                <p className="py-2 text-sm text-muted-foreground">
                  The submitted mentor is {enrollment.mentorContact.name}. Select their account above to update who can access this student as a mentor.
                </p>
              )}
              <SelectField
                id="student-father"
                label="Father of confession"
                value={enrollment.fatherOfConfessionId}
                disabled={enrollmentLocked}
                empty="Not assigned"
                options={toOptions(withCurrentOption(fathers, enrollment.fatherOfConfession))}
                onChange={(fatherOfConfessionId) => saveEnrollment({ fatherOfConfessionId }, 'Father of confession updated')}
              />

              <Field id="student-async" label="Async student">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      id="student-async"
                      type="checkbox"
                      className="h-4 w-4 rounded"
                      checked={enrollment.isAsyncStudent}
                      disabled={enrollmentLocked}
                      onChange={(e) => {
                        if (!e.target.checked) {
                          setChoosingInPersonYearFor(enrollment.id)
                        } else {
                          saveEnrollment({ isAsyncStudent: true }, 'Marked as async — attendance is recorded from signed slips')
                        }
                      }}
                    />
                    Attends asynchronously (signed attendance slips)
                  </label>
                  {enrollment.isAsyncStudent && choosingInPersonYearFor === enrollment.id && (
                    <div className="space-y-2">
                      <label htmlFor="student-in-person-year" className="text-sm">Choose a year to switch to in-person</label>
                      <select id="student-in-person-year" className={selectClass} value="" disabled={enrollmentLocked}
                        onChange={async (e) => {
                          if (await saveEnrollment({ isAsyncStudent: false, yearLevel: e.target.value }, 'Switched to in-person')) setChoosingInPersonYearFor(null)
                        }}
                      >
                        <option value="" disabled>Choose year</option>
                        <option value={YearLevel.YEAR_1}>Year 1</option>
                        <option value={YearLevel.YEAR_2}>Year 2</option>
                      </select>
                      <Button size="sm" variant="ghost" disabled={saving} onClick={() => setChoosingInPersonYearFor(null)}>Cancel</Button>
                    </div>
                  )}
                  {enrollment.isAsyncStudent && (
                    <Input
                      key={enrollment.asyncReason ?? ''}
                      aria-label="Reason for async"
                      placeholder="Reason (optional)"
                      defaultValue={enrollment.asyncReason ?? ''}
                      disabled={enrollmentLocked}
                      onBlur={(e) => {
                        if (e.target.value !== (enrollment.asyncReason ?? '')) {
                          saveEnrollment({ asyncReason: e.target.value }, 'Async reason saved')
                        }
                      }}
                      className="h-8 text-sm"
                    />
                  )}
                </div>
              </Field>
            </>
          )}
        </CardContent>
      </Card>

      {renewal && <Card>
        <CardContent className="pt-6 space-y-3">
          <h3 className="font-semibold">Mentor Information · {renewal.activeYear.name}</h3>
          {!renewal.information?.reviewedAt && <Badge variant="outline">Update Required</Badge>}
          <p className="text-sm">{renewal.information?.reviewedAt ? 'Reviewed' : renewal.information ? 'Submitted · Awaiting admin review' : 'Awaiting student submission'}</p>
          {renewal.information && <>
            <p className="text-sm">{[renewal.information.mentorName, renewal.information.mentorPhone, renewal.information.mentorEmail].join(' · ')}</p>
            {!renewal.information.reviewedAt && canEdit && myRole !== UserRole.PRIEST && <Button disabled={saving} onClick={() => save(
              `/api/students/${student.id}/mentor-information/review`,
              { updatedAt: renewal.information!.updatedAt },
              'Mentor information reviewed',
              'POST'
            )}>Mark mentor information reviewed</Button>}
          </>}
          <p className="text-sm">Approval Form: {(registration?.approvalFormUrl ?? renewal.enrollment.approvalFormUrl)
            ? <a className="text-maroon-700 hover:underline" target="_blank" rel="noopener noreferrer" href={(registration?.approvalFormUrl ?? renewal.enrollment.approvalFormUrl)!}>View signed approval form</a>
            : 'Not provided'}</p>
        </CardContent>
      </Card>}

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="font-semibold">Registration</h3>
            {registration && (
              <Badge className={REGISTRATION_BADGE[registration.status].className}>
                {REGISTRATION_BADGE[registration.status].label}
              </Badge>
            )}
          </div>
          {registration ? (
            <div className="text-sm space-y-1">
              <p className="text-gray-600">
                Submitted {new Date(registration.createdAt).toLocaleDateString()}
                {registration.reviewedAt && ` · Reviewed ${new Date(registration.reviewedAt).toLocaleDateString()}`}
                {registration.reviewer && ` by ${registration.reviewer.name}`}
              </p>
              <p><span className="text-gray-600">Father of confession listed:</span> {registration.fatherOfConfessionName || 'Not provided'}</p>
              <p>
                <span className="text-gray-600">Mentor submitted by student:</span>{' '}
                {[registration.mentorName, registration.mentorPhone, registration.mentorEmail].filter(Boolean).join(' · ') || 'Not provided'}
              </p>
              {registration.reviewNote && <p><span className="text-gray-600">Review note:</span> {registration.reviewNote}</p>}
              <div className="flex flex-wrap gap-3 pt-1">
                {registration.approvalFormUrl ? (
                  <a href={registration.approvalFormUrl} target="_blank" rel="noopener noreferrer" className="text-maroon-700 hover:underline">
                    View signed registration form
                  </a>
                ) : (
                  <span className="text-gray-500">Approval form not provided</span>
                )}
                <Link href="/dashboard/admin/registrations" className="text-maroon-700 hover:underline">
                  Open registrations
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No registration application on file — this student was added manually.</p>
          )}
        </CardContent>
      </Card>
    </>
  )
}
