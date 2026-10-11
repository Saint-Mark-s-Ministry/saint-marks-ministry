# Asynchronous Student Feature - Complete Implementation Plan

> **Superseded (Sept 2026):** Lesson Notes submission/review was replaced by **attendance slips**.
> Async students print a slip from `/dashboard/student/attendance-slip`, get each lesson signed, and a
> servant uploads a photo of it (Async Students → Attendance Slips, or the student's Attendance tab),
> which marks the covered lessons Present. See `app/api/slips`. The Sunday School sections below still apply.
>
> **Attendance rule (Oct 2026):** from the day a student becomes async (`asyncApprovedAt`, whole UTC
> day), Servants Prep lessons stop counting for or against them and they are left off the roll call;
> their attendance is their Sunday School rotation (75% of the weeks so far). Lessons before that day
> count as usual, and a lesson an attendance slip marked Present still counts. One rule,
> `excludeAsyncPeriodRecords` in `lib/attendance-utils.ts`, is applied by every attendance query
> (analytics, dashboard, roll call save, backfill, per-lesson views). An async student with no active
> rotation for their current year does not meet the Sunday School requirement. Rotations are placed in
> a real Sunday School class (`SundaySchoolAssignment.classId`); the class level sets the code grade.

## Executive Summary

This document outlines the implementation plan for the **Asynchronous Student** feature, which encompasses two major components:

1. **Lesson Notes Submission** - Async students submit notes for lessons to count as attendance
2. **Sunday School Placement** - Async students are placed in one Sunday School grade per year and must maintain 75% weekly attendance over a 6-week period each year

The key challenge addressed is verifying Sunday School attendance when the Sunday School servants are NOT app users.

---

## Document Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-30 | Initial plan |
| 2.0 | 2026-01-30 | Added Sunday School rotation, verification system, clarified RBAC |
| 3.0 | 2026-02-07 | Major redesign: SS placement model (1 grade/year, 6 weeks, 75% attendance), note approval reversal, SERVANT_PREP async permissions, SS excusal support |

---

## 1. Feature Summary

### 1.1 Description

The Asynchronous Student feature provides an alternative pathway for students who cannot attend Servants Prep lessons in person. These students:

1. **Submit lesson notes** that administrators review and approve to count as attendance
2. **Are placed in one Sunday School grade per year** and attend weekly for ~6 weeks, verified via codes
3. **Must maintain 75% Sunday School attendance** each year as an additional graduation requirement

### 1.2 Confirmed Requirements

| Requirement | Decision |
|-------------|----------|
| Who approves notes? | SUPER_ADMIN and SERVANT_PREP |
| Can approved notes be reverted? | **Yes** — reversal deletes the linked AttendanceRecord |
| Deadline for note submissions? | **None** — students can submit anytime |
| Minimum note length? | **None** — admins judge quality during review |
| Mentor access to notes? | **View only** — cannot approve/reject |
| Who can set async status? | **SUPER_ADMIN and SERVANT_PREP** |
| Sunday School model | **1 grade per year**, attend weekly for **6 weeks**, need **75% attendance** each year |
| Sunday School grades | Pre-K, K, 1st, 2nd, 3rd, 4th, 5th, 6th+ (**8 grades**) |
| Sunday School excusals | SUPER_ADMIN and SERVANT_PREP can excuse, just like regular attendance |
| Sunday School code reuse | Allowed after rejection — student can resubmit with same code |

### 1.3 User Stories

#### Lesson Notes
| Role | User Story |
|------|------------|
| **STUDENT (Async)** | As an async student, I want to submit notes for lessons so they count as attendance. |
| **STUDENT (Async)** | As an async student, I want to see my submission history and status (pending/approved/rejected). |
| **STUDENT (Async)** | As an async student, I want to resubmit notes if they were rejected, with guidance from the feedback. |
| **SUPER_ADMIN/SERVANT_PREP** | As an admin, I want to review and approve/reject note submissions with optional feedback. |
| **SUPER_ADMIN/SERVANT_PREP** | As an admin, I want to revert an approved note if I made a mistake. |
| **MENTOR** | As a mentor, I want to view my mentees' note submissions (read-only) to track their engagement. |

#### Sunday School
| Role | User Story |
|------|------------|
| **STUDENT (Async)** | As an async student, I want to log my weekly Sunday School attendance using a verification code. |
| **STUDENT (Async)** | As an async student, I want to see my week-by-week attendance for my assigned grade. |
| **SUPER_ADMIN/SERVANT_PREP** | As an admin, I want to assign async students to a Sunday School grade for the year. |
| **SUPER_ADMIN/SERVANT_PREP** | As an admin, I want to generate and manage weekly verification codes for Sunday School classes. |
| **SUPER_ADMIN/SERVANT_PREP** | As an admin, I want to excuse a student's Sunday School absence (excluded from attendance %). |
| **SUPER_ADMIN/SERVANT_PREP** | As an admin, I want to manually approve a week's attendance without a code (exceptions). |
| **SUPER_ADMIN/SERVANT_PREP** | As an admin, I want to reject a fraudulent attendance entry. |

### 1.4 Success Criteria

1. Async students can submit and track lesson notes with full approval workflow (including reversal)
2. Approved notes create standard PRESENT attendance records; reversal deletes them
3. Sunday School placement tracks weekly attendance within an assigned grade per year
4. Sunday School attendance uses 75% threshold with excusal support (same formula as regular attendance)
5. Verification codes provide reasonable fraud protection without burdening non-app-user servants
6. Graduation requirements include Sunday School 75% attendance for async students
7. All existing graduation calculation logic remains unchanged for regular attendance
8. Full RBAC compliance across all operations

---

## 2. Sunday School Placement System

### 2.1 Overview

Each year, async students are **placed in one Sunday School grade** and attend that grade's class weekly for a **6-week period**. They must maintain **75% attendance** (same formula as regular Servants Prep attendance) each year to meet graduation requirements.

### 2.2 Grade Levels (8 Available)

| Grade Key | Display Name | Typical Age |
|-----------|--------------|-------------|
| `PRE_K` | Pre-K | 3-4 years |
| `KINDERGARTEN` | Kindergarten | 5-6 years |
| `GRADE_1` | 1st Grade | 6-7 years |
| `GRADE_2` | 2nd Grade | 7-8 years |
| `GRADE_3` | 3rd Grade | 8-9 years |
| `GRADE_4` | 4th Grade | 9-10 years |
| `GRADE_5` | 5th Grade | 10-11 years |
| `GRADE_6_PLUS` | 6th Grade+ | 11+ years |

**Requirement:** Each academic year, the student is assigned to **one grade** and attends for **6 weeks**. They need **75% attendance** (using the same formula as regular attendance) to pass.

### 2.3 Attendance Calculation

Mirrors the regular Servants Prep attendance formula:

```
percentage = present_count / (total_weeks - excused_count)
```

Where:
- `present_count` = weeks with status VERIFIED or MANUAL
- `excused_count` = weeks with status EXCUSED (excluded from calculation)
- `total_weeks` = 6 (configurable per assignment)

**75% threshold required** for each year's assignment.

### 2.4 Verification Challenge

**Problem:** Sunday School servants are NOT app users. We need to verify that async students actually attended these classes.

**Solution:** A **Weekly Verification Code System** that balances security with simplicity.

### 2.5 Verification Code System Design

#### How It Works

1. **Admin generates weekly codes** — Each Sunday, a unique code is generated per grade level
2. **Codes are distributed** — Admin shares codes with Sunday School coordinators (via group chat, printed sheet, etc.)
3. **Servant provides code** — After class, the Sunday School servant gives the code to the async student
4. **Student logs attendance** — Student enters the code in the app within 7 days
5. **System validates** — Code must match the student's assigned grade and be within the valid date range

#### Code Format

```
Format: [GRADE_PREFIX]-[RANDOM_CHARS]
Example: PK-A7X3  (Pre-K, week of Jan 26)
         G2-B9M2  (2nd Grade, week of Jan 26)

- 2-3 character grade prefix for easy identification
- 4 alphanumeric random characters (~1.68 million combinations per grade)
- Valid for 7 days from generation date
- One code per grade per week
```

#### Security Considerations

| Threat | Mitigation |
|--------|------------|
| Student guesses code | 4 alphanumeric chars = ~1.68M combinations per grade |
| Student shares code | Codes are single-use per student per week |
| Delayed entry | 7-day validity window is reasonable |
| No servant cooperation | Servant just reads code — no app interaction needed |
| Suspected fraud | Admin can reject entry; student can resubmit if legitimate |

---

## 3. Database Design

### 3.1 New Enums

```prisma
enum NoteSubmissionStatus {
  PENDING
  APPROVED
  REJECTED
}

enum SundaySchoolGrade {
  PRE_K
  KINDERGARTEN
  GRADE_1
  GRADE_2
  GRADE_3
  GRADE_4
  GRADE_5
  GRADE_6_PLUS
}

enum SundaySchoolLogStatus {
  VERIFIED     // Code validated — counts as present
  MANUAL       // Admin manually approved — counts as present
  EXCUSED      // Admin excused — excluded from calculation
  REJECTED     // Admin rejected (fraud suspected) — counts as absent
}
```

### 3.2 Modified Model: StudentEnrollment

```prisma
model StudentEnrollment {
  // ... existing fields ...

  // Async student fields
  isAsyncStudent          Boolean   @default(false)
  asyncApprovedAt         DateTime?
  asyncApprovedBy         String?
  asyncReason             String?   @db.Text

  // Relations
  asyncApprover           User?     @relation("AsyncApprovedBy", fields: [asyncApprovedBy], references: [id], onDelete: SetNull)

  // ... existing relations ...
}
```

### 3.3 New Model: AsyncNoteSubmission

> **Note:** This is distinct from the existing `StudentNote` model, which stores admin/mentor observations *about* students. `AsyncNoteSubmission` stores lesson notes submitted *by* students as attendance proof.

```prisma
model AsyncNoteSubmission {
  id                 String               @id @default(cuid())
  studentId          String
  lessonId           String
  content            String               @db.Text
  status             NoteSubmissionStatus @default(PENDING)

  // Submission tracking
  submittedAt        DateTime             @default(now())

  // Review tracking
  reviewedBy         String?
  reviewedAt         DateTime?
  reviewFeedback     String?              @db.Text

  // Attendance linkage (created on APPROVED, deleted on reversal)
  attendanceRecordId String?              @unique

  createdAt          DateTime             @default(now())
  updatedAt          DateTime             @updatedAt

  // Relations
  student            User                 @relation("StudentNoteSubmissions", fields: [studentId], references: [id], onDelete: Cascade)
  lesson             Lesson               @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  reviewer           User?                @relation("ReviewedNoteSubmissions", fields: [reviewedBy], references: [id], onDelete: SetNull)
  attendanceRecord   AttendanceRecord?    @relation(fields: [attendanceRecordId], references: [id], onDelete: SetNull)

  // One submission per student per lesson. Resubmission = UPDATE (not new INSERT).
  @@unique([studentId, lessonId])
  @@index([studentId])
  @@index([lessonId])
  @@index([status])
  @@index([submittedAt])
}
```

**Resubmission flow:** The `@@unique([studentId, lessonId])` constraint means a student has one record per lesson. When rejected, the student UPDATEs the existing record (new content, status reset to PENDING, review fields cleared).

**Reversal flow:** When an admin reverts an APPROVED submission, the linked `AttendanceRecord` is deleted, `attendanceRecordId` is set to null, and `status` is reset to PENDING.

### 3.4 New Model: SundaySchoolAssignment

Tracks which grade a student is placed in for each academic year.

```prisma
model SundaySchoolAssignment {
  id              String            @id @default(cuid())
  studentId       String
  grade           SundaySchoolGrade
  academicYearId  String
  yearLevel       YearLevel         // YEAR_1 or YEAR_2 at time of assignment
  totalWeeks      Int               @default(6)
  startDate       DateTime          // When the 6-week period begins
  isActive        Boolean           @default(true)

  assignedBy      String?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  // Relations
  student         User              @relation("SundaySchoolAssignments", fields: [studentId], references: [id], onDelete: Cascade)
  academicYear    AcademicYear      @relation(fields: [academicYearId], references: [id], onDelete: Cascade)
  assigner        User?             @relation("AssignedSundaySchool", fields: [assignedBy], references: [id], onDelete: SetNull)
  logs            SundaySchoolLog[]

  @@unique([studentId, academicYearId])  // One assignment per student per year
  @@index([studentId])
  @@index([academicYearId])
  @@index([grade])
  @@index([isActive])
}
```

### 3.5 New Model: SundaySchoolCode

Weekly verification codes for Sunday School attendance.

```prisma
model SundaySchoolCode {
  id           String            @id @default(cuid())
  code         String            @unique        // e.g., "PK-A7X3"
  grade        SundaySchoolGrade
  weekOf       DateTime                         // Start of the week (Sunday)
  validUntil   DateTime                         // End of validity (7 days later)

  // Generation tracking
  generatedBy  String?
  generatedAt  DateTime          @default(now())

  // Usage tracking
  isActive     Boolean           @default(true)  // Can be deactivated if compromised

  createdAt    DateTime          @default(now())

  // Relations
  generator    User?             @relation("GeneratedCodes", fields: [generatedBy], references: [id], onDelete: SetNull)
  usages       SundaySchoolLog[]

  @@unique([grade, weekOf])  // One code per grade per week
  @@index([code])
  @@index([grade])
  @@index([weekOf])
  @@index([validUntil])
}
```

### 3.6 New Model: SundaySchoolLog

Tracks individual weekly attendance within a Sunday School assignment.

```prisma
model SundaySchoolLog {
  id            String                @id @default(cuid())
  assignmentId  String
  weekNumber    Int                   // 1 through totalWeeks
  weekOf        DateTime              // The Sunday date

  // Status
  status        SundaySchoolLogStatus // VERIFIED, MANUAL, EXCUSED, REJECTED

  // Verification
  codeId        String?               // Link to verification code (if VERIFIED)

  // Admin action tracking (for MANUAL, EXCUSED, or REJECTED)
  markedBy      String?
  notes         String?               @db.Text

  // Student notes about the experience (optional)
  studentNotes  String?               @db.Text

  createdAt     DateTime              @default(now())
  updatedAt     DateTime              @updatedAt

  // Relations
  assignment    SundaySchoolAssignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  code          SundaySchoolCode?      @relation(fields: [codeId], references: [id], onDelete: SetNull)
  marker        User?                  @relation("MarkedSundaySchoolLogs", fields: [markedBy], references: [id], onDelete: SetNull)

  @@unique([assignmentId, weekNumber])  // One log per week per assignment
  @@index([assignmentId])
  @@index([status])
  @@index([weekOf])
}
```

### 3.7 Modified Model: User

Add new relations:

```prisma
model User {
  // ... existing fields and relations ...

  // Async notes relations
  noteSubmissions           AsyncNoteSubmission[]      @relation("StudentNoteSubmissions")
  reviewedNoteSubmissions   AsyncNoteSubmission[]      @relation("ReviewedNoteSubmissions")
  asyncApprovedEnrollments  StudentEnrollment[]        @relation("AsyncApprovedBy")

  // Sunday School relations
  sundaySchoolAssignments   SundaySchoolAssignment[]   @relation("SundaySchoolAssignments")
  assignedSundaySchool      SundaySchoolAssignment[]   @relation("AssignedSundaySchool")
  generatedCodes            SundaySchoolCode[]         @relation("GeneratedCodes")
  markedSundaySchoolLogs    SundaySchoolLog[]          @relation("MarkedSundaySchoolLogs")
}
```

### 3.8 Modified Models: Lesson, AttendanceRecord, AcademicYear

```prisma
model Lesson {
  // ... existing fields and relations ...
  asyncNoteSubmissions  AsyncNoteSubmission[]
}

model AttendanceRecord {
  // ... existing fields and relations ...
  asyncNoteSubmission   AsyncNoteSubmission?
}

model AcademicYear {
  // ... existing fields and relations ...
  sundaySchoolAssignments  SundaySchoolAssignment[]
}
```

---

## 4. API Design

### 4.1 Async Notes Endpoints

#### `POST /api/async-notes` — Submit Notes
```typescript
// Request
{ lessonId: string, content: string }

// Response (201)
{ id, lessonId, content, status: "PENDING", submittedAt, lesson: {...} }

// Authorization: STUDENT (async only, own submission)
```

#### `GET /api/async-notes` — List Submissions
```typescript
// Query params: studentId, lessonId, status, academicYearId, page, limit

// Authorization:
// - SUPER_ADMIN, PRIEST, SERVANT_PREP: All
// - MENTOR: Mentees only (read-only)
// - STUDENT: Own only
```

#### `GET /api/async-notes/[id]` — Get Single Submission
#### `PUT /api/async-notes/[id]` — Update Submission (PENDING or REJECTED status only)

```typescript
// Request
{ content: string }

// Side effects on update of REJECTED submission:
// - status reset to PENDING
// - reviewedBy, reviewedAt, reviewFeedback cleared

// Authorization: STUDENT (own, status must be PENDING or REJECTED)
```

#### `DELETE /api/async-notes/[id]` — Delete Submission (PENDING status only)

#### `POST /api/async-notes/[id]/review` — Review (Approve/Reject/Revert)
```typescript
// Request
{ status: "APPROVED" | "REJECTED" | "PENDING", feedback?: string }

// Authorization: SUPER_ADMIN, SERVANT_PREP only

// Side effects:
// - APPROVED: Creates AttendanceRecord (status: PRESENT), links to submission
// - REJECTED: Sets feedback, clears attendance link if previously approved
// - PENDING (revert): Deletes linked AttendanceRecord, clears review fields
```

#### `POST /api/async-notes/bulk-review` — Bulk Review
```typescript
// Request
{ submissionIds: string[], status: "APPROVED" | "REJECTED", feedback?: string }

// Authorization: SUPER_ADMIN, SERVANT_PREP only
// Note: Bulk revert (PENDING) not supported — revert individually
```

### 4.2 Sunday School Assignment Endpoints

#### `POST /api/sunday-school/assignments` — Create Assignment
```typescript
// Request
{
  studentId: string,
  grade: SundaySchoolGrade,
  academicYearId: string,
  totalWeeks?: number,  // default: 6
  startDate: string     // ISO date (Sunday)
}

// Response (201)
{ id, studentId, grade, academicYearId, yearLevel, totalWeeks, startDate }

// Validation:
// - Student must be an async student
// - No existing assignment for this student + academic year
// - Grade must be a valid SundaySchoolGrade

// Authorization: SUPER_ADMIN, SERVANT_PREP
```

#### `GET /api/sunday-school/assignments` — List Assignments
```typescript
// Query params: studentId, academicYearId, grade, isActive

// Authorization:
// - SUPER_ADMIN, PRIEST, SERVANT_PREP: All
// - MENTOR: Mentees only (read-only)
// - STUDENT: Own only
```

#### `PATCH /api/sunday-school/assignments/[id]` — Update Assignment
```typescript
// Request
{ grade?: SundaySchoolGrade, totalWeeks?: number, startDate?: string, isActive?: boolean }

// Authorization: SUPER_ADMIN, SERVANT_PREP
```

#### `DELETE /api/sunday-school/assignments/[id]` — Delete Assignment
```typescript
// Cascade deletes all associated logs
// Authorization: SUPER_ADMIN, SERVANT_PREP
```

### 4.3 Sunday School Code Endpoints

#### `POST /api/sunday-school/codes/generate` — Generate Weekly Codes
```typescript
// Request
{ weekOf: string }  // ISO date (Sunday)

// Response (201)
{
  generated: [
    { grade: "PRE_K", code: "PK-A7X3", validUntil: "..." },
    { grade: "KINDERGARTEN", code: "KG-B9M2", validUntil: "..." },
    // ... all 8 grades
  ]
}

// Authorization: SUPER_ADMIN, SERVANT_PREP
```

#### `GET /api/sunday-school/codes` — List Codes
```typescript
// Query params: weekOf, grade, isActive

// Authorization: SUPER_ADMIN, SERVANT_PREP
```

#### `GET /api/sunday-school/codes/current` — Get Current Week's Codes
```typescript
// Returns codes for current week (for printing/sharing)
// Authorization: SUPER_ADMIN, SERVANT_PREP
```

#### `PATCH /api/sunday-school/codes/[id]` — Deactivate Code
```typescript
// Request
{ isActive: false }

// Authorization: SUPER_ADMIN, SERVANT_PREP
```

### 4.4 Sunday School Log Endpoints

#### `POST /api/sunday-school/logs` — Student Submits Attendance
```typescript
// Request
{
  code: string,          // e.g., "PK-A7X3"
  weekOf: string,        // ISO date (Sunday)
  studentNotes?: string
}

// Response (201)
{
  id, assignmentId, weekNumber, weekOf, status: "VERIFIED",
  message: "Sunday School attendance logged successfully"
}

// Validation:
// 1. Student must be async with an active assignment
// 2. Code must exist, be active, and not expired
// 3. Code grade must match student's assigned grade
// 4. weekOf must fall within the assignment's 6-week period
// 5. No existing log for this week (or existing REJECTED log — update it)

// Errors:
// - 400: Invalid code format
// - 403: Not an async student or no active assignment
// - 404: Code not found
// - 409: Already logged for this week (and not rejected)
// - 410: Code expired
// - 422: Code grade doesn't match assigned grade

// Authorization: STUDENT (async only)
```

#### `GET /api/sunday-school/logs` — List Logs
```typescript
// Query params: assignmentId, studentId, status, page, limit

// Authorization:
// - SUPER_ADMIN, PRIEST, SERVANT_PREP: All
// - MENTOR: Mentees only (read-only)
// - STUDENT: Own only
```

#### `POST /api/sunday-school/logs/admin-action` — Admin Mark Attendance
```typescript
// Request
{
  assignmentId: string,
  weekNumber: number,
  status: "MANUAL" | "EXCUSED" | "REJECTED",
  notes?: string
}

// Side effects:
// - Creates or updates the log for the given week
// - MANUAL: Counts as present
// - EXCUSED: Excluded from attendance calculation
// - REJECTED: Counts as absent (preserves audit trail)

// Authorization: SUPER_ADMIN, SERVANT_PREP
```

#### `GET /api/sunday-school/progress` — Get Student Progress
```typescript
// Query params: studentId

// Response
{
  studentId: string,
  assignments: [
    {
      id: "...",
      grade: "GRADE_2",
      yearLevel: "YEAR_1",
      academicYear: { id: "...", name: "2025-2026" },
      totalWeeks: 6,
      startDate: "2025-10-05",
      attendance: {
        present: 4,       // VERIFIED + MANUAL
        excused: 1,        // EXCUSED
        absent: 1,         // No log or REJECTED
        effectiveTotal: 5, // totalWeeks - excused
        percentage: 80.0,  // 4 / 5 = 80%
        met: true          // >= 75%
      },
      weeks: [
        { weekNumber: 1, weekOf: "2025-10-05", status: "VERIFIED" },
        { weekNumber: 2, weekOf: "2025-10-12", status: "VERIFIED" },
        { weekNumber: 3, weekOf: "2025-10-19", status: "EXCUSED" },
        { weekNumber: 4, weekOf: "2025-10-26", status: "VERIFIED" },
        { weekNumber: 5, weekOf: "2025-11-02", status: null },
        { weekNumber: 6, weekOf: "2025-11-09", status: "VERIFIED" }
      ]
    }
  ],
  graduation: {
    year1Met: true,
    year2Met: false,
    allMet: false
  }
}

// Authorization:
// - SUPER_ADMIN, PRIEST, SERVANT_PREP: All
// - MENTOR: Mentees only
// - STUDENT: Own only
```

### 4.5 Modified Endpoints

#### `PATCH /api/enrollments/[id]` — Update Enrollment
```typescript
// New fields accepted
{
  isAsyncStudent?: boolean,
  asyncReason?: string
}

// Side effects when setting isAsyncStudent:
// - Records asyncApprovedAt and asyncApprovedBy

// Authorization: SUPER_ADMIN, SERVANT_PREP (via canManageEnrollments)
```

#### `GET /api/students/[id]/analytics` — Enhanced Analytics
```typescript
// New response fields for async students
{
  // ... existing fields ...

  asyncNotes: {
    total: number,
    pending: number,
    approved: number,
    rejected: number
  },

  sundaySchool: {
    assignments: [{
      yearLevel: "YEAR_1",
      grade: "GRADE_2",
      attendance: { present: 4, excused: 1, absent: 1, percentage: 80.0, met: true }
    }],
    year1Met: boolean,
    year2Met: boolean,
    allMet: boolean
  },

  graduation: {
    // ... existing fields ...
    sundaySchoolMet: boolean  // Only relevant for async students
  }
}
```

---

## 5. Authorization Matrix

### 5.1 Async Notes Permissions

| Action | SUPER_ADMIN | PRIEST | SERVANT_PREP | MENTOR | STUDENT |
|--------|:-----------:|:------:|:------------:|:------:|:-------:|
| View all submissions | Yes | Yes | Yes | Mentees only | Own only |
| Submit notes | No | No | No | No | Yes (if async) |
| Update own (pending/rejected) | No | No | No | No | Yes |
| Delete own (pending only) | No | No | No | No | Yes |
| Approve/Reject | Yes | No | Yes | No | No |
| Revert approved | Yes | No | Yes | No | No |
| Bulk review | Yes | No | Yes | No | No |

### 5.2 Sunday School Permissions

| Action | SUPER_ADMIN | PRIEST | SERVANT_PREP | MENTOR | STUDENT |
|--------|:-----------:|:------:|:------------:|:------:|:-------:|
| Create/edit assignments | Yes | No | Yes | No | No |
| View assignments | Yes | Yes | Yes | Mentees | Own only |
| Generate codes | Yes | No | Yes | No | No |
| View codes | Yes | No | Yes | No | No |
| Deactivate codes | Yes | No | Yes | No | No |
| Submit attendance (code) | No | No | No | No | Yes (async) |
| View all logs | Yes | Yes | Yes | Mentees | Own only |
| Excuse attendance | Yes | No | Yes | No | No |
| Manual approve | Yes | No | Yes | No | No |
| Reject attendance | Yes | No | Yes | No | No |
| View progress | Yes | Yes | Yes | Mentees | Own only |

### 5.3 Async Status Permissions

| Action | SUPER_ADMIN | PRIEST | SERVANT_PREP | MENTOR | STUDENT |
|--------|:-----------:|:------:|:------------:|:------:|:-------:|
| Set async status | Yes | No | Yes | No | No |
| View async status | Yes | Yes | Yes | Mentees | Own |

### 5.4 New Permission Helpers (lib/roles.ts)

```typescript
// Can review async note submissions (approve/reject/revert)
export const canReviewAsyncNotes = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN || role === UserRole.SERVANT_PREP
}

// Can generate/manage Sunday School codes and manage assignments
export const canManageSundaySchool = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN || role === UserRole.SERVANT_PREP
}

// Can excuse/manually approve/reject Sunday School attendance
export const canManageSundaySchoolAttendance = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN || role === UserRole.SERVANT_PREP
}

// Can set async student status on enrollments
export const canSetAsyncStatus = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN || role === UserRole.SERVANT_PREP
}

// Can submit async notes and log Sunday School (must also be async student)
export const canSubmitAsyncContent = (role: UserRole) => {
  return role === UserRole.STUDENT
}
```

---

## 6. UI/UX Design

### 6.1 Student Dashboard (Async Students)

**Location:** `app/dashboard/student/page.tsx`

**New Section: "Async Progress"**

Appears only for students with `isAsyncStudent: true`:

```
+------------------------------------------+
|  ASYNC STUDENT PROGRESS                  |
+------------------------------------------+
|  Lesson Notes          Sunday School     |
|  +----------------+    +----------------+|
|  | 12 Approved    |    | Week 4/6       ||
|  | 3 Pending      |    | Grade: 2nd     ||
|  | [Submit Notes] |    | Attendance: 75%||
|  +----------------+    +----------------+|
+------------------------------------------+
```

### 6.2 Student Async Notes Page

**Location:** `app/dashboard/student/async-notes/page.tsx`

Features:
- List of all lessons (past scheduled date)
- Filter by status, section
- Expandable cards with submission form
- Status badges (Not Submitted / Pending / Approved / Rejected)
- Rejection feedback display with resubmit capability
- Submit/Resubmit button

### 6.3 Student Sunday School Page

**Location:** `app/dashboard/student/sunday-school/page.tsx`

Features:
- Current assignment info (grade, week progress)
- Week-by-week attendance tracker
- "Submit Code" dialog for current/recent weeks
- Attendance percentage with 75% threshold indicator
- History across years (Year 1 and Year 2)

```
+------------------------------------------+
|  SUNDAY SCHOOL — 2nd Grade               |
|  Year 1 • 2025-2026                      |
|  Attendance: 4/5 = 80% (75% required)    |
+------------------------------------------+
|  Week 1 (Oct 5)   [✓] Verified           |
|  Week 2 (Oct 12)  [✓] Verified           |
|  Week 3 (Oct 19)  [—] Excused            |
|  Week 4 (Oct 26)  [✓] Verified           |
|  Week 5 (Nov 2)   [ ] Not submitted      |
|  Week 6 (Nov 9)   [✓] Verified           |
+------------------------------------------+
|  [Submit Code for This Week]             |
+------------------------------------------+
```

### 6.4 Admin Async Notes Review

**Location:** `app/dashboard/admin/async-notes/page.tsx`

Features:
- Filterable table of submissions
- Bulk selection for batch review
- Quick approve/reject buttons
- Revert button for approved submissions (with confirmation)
- Dialog for rejection feedback
- Preview panel for full content

### 6.5 Admin Sunday School Management

**Location:** `app/dashboard/admin/sunday-school/page.tsx`

**Tabs:**
1. **Assignments** — Assign students to grades, view/edit assignments
2. **Codes** — Generate, view, print weekly codes
3. **Attendance** — View logs, excuse/approve/reject, week-by-week view
4. **Progress** — Overview of all async students' SS attendance percentages

**Assignments Tab:**
```
+------------------------------------------+
|  Sunday School Assignments               |
|  Academic Year: 2025-2026                |
|  [+ Assign Student]                      |
+------------------------------------------+
|  Student      | Grade    | Progress      |
|  John Smith   | 2nd Grade| 4/6 (80%)    |
|  Jane Doe     | Pre-K   | 2/6 (33%)     |
|  ...                                     |
+------------------------------------------+
```

**Codes Tab:**
```
+------------------------------------------+
|  Current Week: January 26, 2026          |
|  [Generate New Codes] [Print Codes]      |
+------------------------------------------+
|  Grade        | Code    | Used By        |
|  Pre-K        | PK-A7X3 | 2 students     |
|  Kindergarten | KG-B9M2 | 1 student      |
|  1st Grade    | G1-C8N4 | 0 students     |
|  ...                                     |
+------------------------------------------+
```

**Attendance Tab:**
```
+------------------------------------------+
|  Student: John Smith — 2nd Grade         |
|  [Excuse] [Manual Approve] [Reject]      |
+------------------------------------------+
|  Wk | Date    | Status    | Code         |
|  1  | Oct 5   | Verified  | G2-A7X3      |
|  2  | Oct 12  | Verified  | G2-B9M2      |
|  3  | Oct 19  | Excused   | —            |
|  4  | Oct 26  | Verified  | G2-D4K8      |
|  5  | Nov 2   | —         | —            |
|  6  | Nov 9   | —         | —            |
+------------------------------------------+
```

**Print View:**
Simple printable sheet with all codes for the current week, for distribution to Sunday School coordinators.

### 6.6 Student Details Modal Additions

**Location:** `components/student-details-modal.tsx`

**New Tabs for Async Students:**
- **Lesson Notes** — Submission history with quick review actions
- **Sunday School** — Week-by-week attendance and progress

### 6.7 Enrollment Management Additions

**Location:** `app/dashboard/admin/students/page.tsx`

- New "Async" column with icon indicator
- Filter by async status
- Bulk action: "Set as Async Student" (SUPER_ADMIN and SERVANT_PREP)

---

## 7. Integration with Existing Features

### 7.1 Graduation Requirements

**Current Requirements (unchanged):**
1. Attendance >= 75%
2. Overall exam average >= 75%
3. Each exam section >= 60%
4. Complete both YEAR_1 and YEAR_2

**Additional Requirement for Async Students:**
5. Sunday School attendance >= 75% for each year's assignment

**Implementation:**
- Analytics endpoint includes `sundaySchool.allMet` flag
- Graduation dialog checks this flag for async students
- If not met, shown as an issue: "Sunday School: X% attendance (need 75%)"
- The `StudentAnalytics` interface in `graduation-dialog.tsx` gains an optional `sundaySchoolMet` field
- `graduationEligible` on the backend: existing checks AND (if async) `sundaySchool.allMet`

### 7.2 Attendance Calculation (NO CHANGES to existing)

The existing `lib/attendance-utils.ts` requires **no modifications**:
- Approved async notes create standard `AttendanceRecord` entries with status PRESENT
- Reverting an approved note deletes the `AttendanceRecord`
- Calculation continues to use same formula
- Sunday School attendance is tracked separately (not part of regular attendance %)

### 7.3 Sunday School Attendance Calculation (NEW)

Uses the same conceptual formula as regular attendance:

```typescript
// lib/sunday-school-utils.ts
function calculateSSAttendance(logs: SundaySchoolLog[], totalWeeks: number) {
  const present = logs.filter(l => l.status === 'VERIFIED' || l.status === 'MANUAL').length
  const excused = logs.filter(l => l.status === 'EXCUSED').length
  const effectiveTotal = totalWeeks - excused

  if (effectiveTotal === 0) return null  // All weeks excused
  return (present / effectiveTotal) * 100
}
```

### 7.4 Analytics Integration

Both analytics endpoints will:
1. Calculate attendance from AttendanceRecord (unchanged)
2. Include async note stats as supplementary data
3. Include Sunday School progress for async students (per-year attendance %)
4. Factor Sunday School into graduation eligibility for async students only
5. Not double-count anything

---

## 8. Implementation Order

### Phase 1: Database Foundation (Days 1-2)
1. Add all enums to schema.prisma
2. Add AsyncNoteSubmission model
3. Add SundaySchoolAssignment model
4. Add SundaySchoolCode model
5. Add SundaySchoolLog model
6. Modify StudentEnrollment, User, Lesson, AttendanceRecord, AcademicYear
7. Run `bun db:generate` and `bun db:migrate`
8. Verify with `bun db:studio`

### Phase 2: Core APIs — Async Notes (Days 3-4)
1. Add permission helpers to `lib/roles.ts`
2. Create `/api/async-notes/route.ts` (POST, GET)
3. Create `/api/async-notes/[id]/route.ts` (GET, PUT, DELETE)
4. Create `/api/async-notes/[id]/review/route.ts` (POST — approve/reject/revert)
5. Create `/api/async-notes/bulk-review/route.ts` (POST)
6. Update `/api/enrollments/[id]/route.ts` for async status fields

### Phase 3: Core APIs — Sunday School (Days 5-7)
1. Create `lib/sunday-school-utils.ts` (code generation, attendance calculation)
2. Create `/api/sunday-school/assignments/route.ts` (GET, POST)
3. Create `/api/sunday-school/assignments/[id]/route.ts` (PATCH, DELETE)
4. Create `/api/sunday-school/codes/route.ts` (GET)
5. Create `/api/sunday-school/codes/generate/route.ts` (POST)
6. Create `/api/sunday-school/codes/current/route.ts` (GET)
7. Create `/api/sunday-school/codes/[id]/route.ts` (PATCH)
8. Create `/api/sunday-school/logs/route.ts` (GET, POST — student code submission)
9. Create `/api/sunday-school/logs/admin-action/route.ts` (POST — excuse/manual/reject)
10. Create `/api/sunday-school/progress/route.ts` (GET)

### Phase 4: Student UI (Days 8-9)
1. Update student dashboard with async progress section
2. Create async notes page
3. Create Sunday School page with week-by-week tracker
4. Add code submission dialog

### Phase 5: Admin UI (Days 10-12)
1. Create admin async notes review page (with revert support)
2. Create admin Sunday School management page (4 tabs)
3. Add print view for codes
4. Update student details modal with async tabs
5. Update enrollment management (async column, bulk action)

### Phase 6: Analytics & Graduation (Days 13-14)
1. Create `lib/sunday-school-utils.ts` attendance calculation
2. Update `/api/students/[id]/analytics` with async + SS stats
3. Update `/api/students/analytics/batch` for async summary
4. Update graduation dialog to check Sunday School attendance
5. Update `StudentAnalytics` interface

### Phase 7: SWR Hooks & Polish (Day 15)
1. Add SWR hooks to `lib/swr.ts`:
   - `useAsyncNotes(filters?)`
   - `useSundaySchoolAssignments(filters?)`
   - `useSundaySchoolCodes(weekOf?)`
   - `useSundaySchoolProgress(studentId?)`
2. Mobile responsiveness testing
3. Edge case testing

### Phase 8: Testing (Days 16-17)
1. Write API tests for all new endpoints
2. Test RBAC across all roles
3. Test code validation edge cases
4. Test note reversal flow (approved → reverted → resubmitted → re-approved)
5. Test SS excusal in attendance calculation
6. Test graduation flow for async students
7. Test resubmission after rejection (both notes and SS logs)

---

## 9. Risk Assessment

### 9.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|:----------:|:------:|------------|
| Attendance double-counting | Low | High | Unique constraints in database |
| Permission bypass | Medium | High | Comprehensive RBAC at API level |
| Note reversal orphans | Low | Medium | Transaction wraps reversal + AR deletion |
| Graduation calc breakage | Low | Critical | All existing logic unchanged; SS is additive |
| SS attendance miscalculation | Low | Medium | Shared utility with unit tests |

### 9.2 Sunday School Fraud Risks

| Risk | Likelihood | Impact | Mitigation |
|------|:----------:|:------:|------------|
| Student guesses code | Very Low | Low | 4 alphanum = ~1.68M combinations per grade |
| Student shares code | Low | Low | Each student submits for their assigned grade only |
| Code photo sharing | Low | Low | Social trust, admin spot-checks |
| Wrong grade submission | None | None | System validates code grade matches assignment |

### 9.3 Mitigation Strategies

**Async Notes:**
1. Review workflow with approve/reject/revert
2. Bulk review for efficiency
3. Rejection feedback for student improvement

**Sunday School:**
1. Code validation (automatic)
2. Grade-locked assignments (student can only submit for their assigned grade)
3. Admin excusal/manual approve for legitimate exceptions
4. Admin rejection for suspected fraud
5. Social accountability

---

## 10. File Reference

### Files to Create

| Path | Description |
|------|-------------|
| `app/api/async-notes/route.ts` | Async notes list/create |
| `app/api/async-notes/[id]/route.ts` | Single note CRUD |
| `app/api/async-notes/[id]/review/route.ts` | Note review (approve/reject/revert) |
| `app/api/async-notes/bulk-review/route.ts` | Bulk review |
| `app/api/sunday-school/assignments/route.ts` | Assignment list/create |
| `app/api/sunday-school/assignments/[id]/route.ts` | Assignment update/delete |
| `app/api/sunday-school/codes/route.ts` | Codes list |
| `app/api/sunday-school/codes/generate/route.ts` | Generate codes |
| `app/api/sunday-school/codes/current/route.ts` | Current week codes |
| `app/api/sunday-school/codes/[id]/route.ts` | Code management |
| `app/api/sunday-school/logs/route.ts` | Student code submission + list logs |
| `app/api/sunday-school/logs/admin-action/route.ts` | Admin excuse/approve/reject |
| `app/api/sunday-school/progress/route.ts` | Student progress summary |
| `app/dashboard/student/async-notes/page.tsx` | Student notes page |
| `app/dashboard/student/sunday-school/page.tsx` | Student SS page |
| `app/dashboard/admin/async-notes/page.tsx` | Admin notes review |
| `app/dashboard/admin/sunday-school/page.tsx` | Admin SS management |
| `components/async-progress-card.tsx` | Dashboard progress card |
| `components/ss-week-tracker.tsx` | Week-by-week attendance tracker |
| `components/code-entry-dialog.tsx` | Code entry form |
| `lib/sunday-school-utils.ts` | Code generation + attendance calc utilities |

### Files to Modify

| Path | Changes |
|------|---------|
| `prisma/schema.prisma` | Add enums, models, relations |
| `lib/roles.ts` | Add permission helpers |
| `lib/swr.ts` | Add SWR hooks for async notes, SS assignments, codes, progress |
| `app/api/enrollments/[id]/route.ts` | Add async status handling |
| `app/api/students/[id]/analytics/route.ts` | Add async/SS stats + graduation check |
| `app/api/students/analytics/batch/route.ts` | Add async summary |
| `app/dashboard/student/page.tsx` | Add async progress section |
| `app/dashboard/admin/students/page.tsx` | Add async column/filter |
| `components/student-details-modal.tsx` | Add async tabs |
| `components/graduation-dialog.tsx` | Check SS attendance + update interface |
| `components/navbar.tsx` | Add admin nav links |

---

## 11. Appendix: Complete Schema Changes

```prisma
// ============================================
// NEW ENUMS
// ============================================

enum NoteSubmissionStatus {
  PENDING
  APPROVED
  REJECTED
}

enum SundaySchoolGrade {
  PRE_K
  KINDERGARTEN
  GRADE_1
  GRADE_2
  GRADE_3
  GRADE_4
  GRADE_5
  GRADE_6_PLUS
}

enum SundaySchoolLogStatus {
  VERIFIED     // Code validated — counts as present
  MANUAL       // Admin manually approved — counts as present
  EXCUSED      // Admin excused — excluded from attendance calculation
  REJECTED     // Admin rejected — counts as absent
}

// ============================================
// NEW MODELS
// ============================================

model AsyncNoteSubmission {
  id                 String               @id @default(cuid())
  studentId          String
  lessonId           String
  content            String               @db.Text
  status             NoteSubmissionStatus @default(PENDING)
  submittedAt        DateTime             @default(now())
  reviewedBy         String?
  reviewedAt         DateTime?
  reviewFeedback     String?              @db.Text
  attendanceRecordId String?              @unique
  createdAt          DateTime             @default(now())
  updatedAt          DateTime             @updatedAt

  student            User                 @relation("StudentNoteSubmissions", fields: [studentId], references: [id], onDelete: Cascade)
  lesson             Lesson               @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  reviewer           User?                @relation("ReviewedNoteSubmissions", fields: [reviewedBy], references: [id], onDelete: SetNull)
  attendanceRecord   AttendanceRecord?    @relation(fields: [attendanceRecordId], references: [id], onDelete: SetNull)

  @@unique([studentId, lessonId])
  @@index([studentId])
  @@index([lessonId])
  @@index([status])
  @@index([submittedAt])
}

model SundaySchoolAssignment {
  id              String            @id @default(cuid())
  studentId       String
  grade           SundaySchoolGrade
  academicYearId  String
  yearLevel       YearLevel
  totalWeeks      Int               @default(6)
  startDate       DateTime
  isActive        Boolean           @default(true)
  assignedBy      String?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  student         User              @relation("SundaySchoolAssignments", fields: [studentId], references: [id], onDelete: Cascade)
  academicYear    AcademicYear      @relation(fields: [academicYearId], references: [id], onDelete: Cascade)
  assigner        User?             @relation("AssignedSundaySchool", fields: [assignedBy], references: [id], onDelete: SetNull)
  logs            SundaySchoolLog[]

  @@unique([studentId, academicYearId])
  @@index([studentId])
  @@index([academicYearId])
  @@index([grade])
  @@index([isActive])
}

model SundaySchoolCode {
  id           String            @id @default(cuid())
  code         String            @unique
  grade        SundaySchoolGrade
  weekOf       DateTime
  validUntil   DateTime
  generatedBy  String?
  generatedAt  DateTime          @default(now())
  isActive     Boolean           @default(true)
  createdAt    DateTime          @default(now())

  generator    User?             @relation("GeneratedCodes", fields: [generatedBy], references: [id], onDelete: SetNull)
  usages       SundaySchoolLog[]

  @@unique([grade, weekOf])
  @@index([code])
  @@index([grade])
  @@index([weekOf])
  @@index([validUntil])
}

model SundaySchoolLog {
  id            String                  @id @default(cuid())
  assignmentId  String
  weekNumber    Int
  weekOf        DateTime
  status        SundaySchoolLogStatus
  codeId        String?
  markedBy      String?
  notes         String?                 @db.Text
  studentNotes  String?                 @db.Text
  createdAt     DateTime                @default(now())
  updatedAt     DateTime                @updatedAt

  assignment    SundaySchoolAssignment  @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  code          SundaySchoolCode?       @relation(fields: [codeId], references: [id], onDelete: SetNull)
  marker        User?                   @relation("MarkedSundaySchoolLogs", fields: [markedBy], references: [id], onDelete: SetNull)

  @@unique([assignmentId, weekNumber])
  @@index([assignmentId])
  @@index([status])
  @@index([weekOf])
}

// ============================================
// MODIFIED MODELS
// ============================================

model StudentEnrollment {
  // ... existing fields ...

  isAsyncStudent    Boolean   @default(false)
  asyncApprovedAt   DateTime?
  asyncApprovedBy   String?
  asyncReason       String?   @db.Text

  asyncApprover     User?     @relation("AsyncApprovedBy", fields: [asyncApprovedBy], references: [id], onDelete: SetNull)

  // ... existing relations ...
}

model User {
  // ... existing fields and relations ...

  // Async notes
  noteSubmissions           AsyncNoteSubmission[]      @relation("StudentNoteSubmissions")
  reviewedNoteSubmissions   AsyncNoteSubmission[]      @relation("ReviewedNoteSubmissions")
  asyncApprovedEnrollments  StudentEnrollment[]        @relation("AsyncApprovedBy")

  // Sunday School
  sundaySchoolAssignments   SundaySchoolAssignment[]   @relation("SundaySchoolAssignments")
  assignedSundaySchool      SundaySchoolAssignment[]   @relation("AssignedSundaySchool")
  generatedCodes            SundaySchoolCode[]         @relation("GeneratedCodes")
  markedSundaySchoolLogs    SundaySchoolLog[]          @relation("MarkedSundaySchoolLogs")
}

model Lesson {
  // ... existing fields and relations ...
  asyncNoteSubmissions      AsyncNoteSubmission[]
}

model AttendanceRecord {
  // ... existing fields and relations ...
  asyncNoteSubmission       AsyncNoteSubmission?
}

model AcademicYear {
  // ... existing fields and relations ...
  sundaySchoolAssignments   SundaySchoolAssignment[]
}
```

---

## 12. Code Generation Utility

```typescript
// lib/sunday-school-utils.ts

import { SundaySchoolGrade, SundaySchoolLogStatus } from '@prisma/client'
import { randomBytes } from 'crypto'

// ============================================
// Code Generation
// ============================================

const GRADE_PREFIXES: Record<SundaySchoolGrade, string> = {
  PRE_K: 'PK',
  KINDERGARTEN: 'KG',
  GRADE_1: 'G1',
  GRADE_2: 'G2',
  GRADE_3: 'G3',
  GRADE_4: 'G4',
  GRADE_5: 'G5',
  GRADE_6_PLUS: 'G6',
}

const ALPHANUMERIC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Exclude confusable chars (0/O, 1/I/L)

export function generateCode(grade: SundaySchoolGrade): string {
  const prefix = GRADE_PREFIXES[grade]
  const bytes = randomBytes(4)
  let random = ''
  for (let i = 0; i < 4; i++) {
    random += ALPHANUMERIC[bytes[i] % ALPHANUMERIC.length]
  }
  return `${prefix}-${random}`
}

export function parseCodePrefix(code: string): SundaySchoolGrade | null {
  const prefix = code.split('-')[0]
  for (const [grade, p] of Object.entries(GRADE_PREFIXES)) {
    if (p === prefix) return grade as SundaySchoolGrade
  }
  return null
}

export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day) // Go to Sunday
  d.setHours(0, 0, 0, 0)
  return d
}

export function getCodeValidUntil(weekOf: Date): Date {
  const d = new Date(weekOf)
  d.setDate(d.getDate() + 7)
  d.setHours(23, 59, 59, 999)
  return d
}

// ============================================
// Attendance Calculation
// ============================================

interface SSLog {
  status: SundaySchoolLogStatus
}

export function calculateSSAttendance(logs: SSLog[], totalWeeks: number) {
  const present = logs.filter(
    l => l.status === SundaySchoolLogStatus.VERIFIED || l.status === SundaySchoolLogStatus.MANUAL
  ).length
  const excused = logs.filter(
    l => l.status === SundaySchoolLogStatus.EXCUSED
  ).length
  const effectiveTotal = totalWeeks - excused

  if (effectiveTotal <= 0) return null // All weeks excused

  const percentage = (present / effectiveTotal) * 100
  return {
    present,
    excused,
    absent: totalWeeks - present - excused,
    effectiveTotal,
    percentage,
    met: percentage >= 75,
  }
}

export function meetsSSRequirement(percentage: number | null): boolean {
  if (percentage === null) return true // No data yet, not penalized
  return percentage >= 75
}

// ============================================
// Week Helpers
// ============================================

export function getAssignmentWeeks(startDate: Date, totalWeeks: number) {
  const weeks = []
  for (let i = 0; i < totalWeeks; i++) {
    const weekOf = new Date(startDate)
    weekOf.setDate(weekOf.getDate() + i * 7)
    weeks.push({ weekNumber: i + 1, weekOf })
  }
  return weeks
}

export function getWeekNumber(startDate: Date, weekOf: Date): number | null {
  const diffMs = weekOf.getTime() - startDate.getTime()
  const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000))
  const weekNumber = diffWeeks + 1
  return weekNumber >= 1 ? weekNumber : null
}
```

---

*Document Version: 3.0*
*Last Updated: 2026-02-07*
*Author: Claude Code (Architecture Specialist)*
