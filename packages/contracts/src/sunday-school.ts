import type {
  AttendanceStatus,
  SundaySchoolAuthority,
  SundaySchoolChildGender,
  SundaySchoolFeedbackStatus,
  SundaySchoolFeedbackType,
  SundaySchoolFeedbackVoteType,
  SundaySchoolLevel,
  SundaySchoolServantAttendanceStatus,
  SundaySchoolVisitationStatus,
} from "@prisma/client";

// Shapes returned by the /api/sunday-school/* routes (Sunday School mode).

export interface SundaySchoolServantRef {
  id: string;
  name: string;
  email?: string;
  phone?: string | null;
  profileImageUrl?: string | null;
}

export interface SundaySchoolAssignmentRow {
  id: string;
  userId: string;
  academicYearId: string;
  authority: SundaySchoolAuthority;
  classId: string | null;
  ageGroupId: string | null;
  user: SundaySchoolServantRef;
  class?: SundaySchoolClassRef | null;
  ageGroup?: { id: string; name: string } | null;
}

export interface SundaySchoolAgeGroup {
  overseerId?: string | null;
  overseer?: SundaySchoolServantRef | null;
  id: string;
  name: string;
  levels: SundaySchoolLevel[];
  sortOrder: number;
  isActive: boolean;
  canCoordinate?: boolean;
  assignments?: SundaySchoolAssignmentRow[];
}

export interface SundaySchoolClassRef {
  id: string;
  name: string;
  level: SundaySchoolLevel;
}

export interface SundaySchoolClass extends SundaySchoolClassRef {
  academicYearId: string;
  academicYear?: { id: string; name: string } | null;
  isActive: boolean;
  assignments: SundaySchoolAssignmentRow[];
  _count?: { children: number; sessions: number };
  // What this viewer may do with this class, decided by the server
  canServe?: boolean;
  canCoordinate?: boolean;
  canDelete?: boolean;
  canTakeServantAttendance?: boolean;
  canViewServantAttendance?: boolean;
  weeklyLessons?: SundaySchoolWeeklyLesson[];
}

export interface SundaySchoolFamilyChild {
  id: string;
  firstName: string;
  lastName: string;
  level: SundaySchoolLevel;
  classId: string | null;
  class?: SundaySchoolClassRef | null;
}

export interface SundaySchoolFamily {
  id: string;
  name: string | null;
  homeAddress: string | null;
  motherName: string | null;
  motherPhone: string | null;
  motherEmail: string | null;
  fatherName: string | null;
  fatherPhone: string | null;
  fatherEmail: string | null;
  children: SundaySchoolFamilyChild[];
}

export interface SundaySchoolChild {
  id: string;
  familyId: string | null;
  userId: string | null;
  firstName: string;
  lastName: string;
  level: SundaySchoolLevel;
  classId: string | null;
  birthDate: string | null;
  gender: SundaySchoolChildGender | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  notes: string | null;
  isActive: boolean;
  class?: SundaySchoolClassRef | null;
  family?: SundaySchoolFamily | null;
  user?: { id: string; name: string; email: string; profileImageUrl: string | null } | null;
}

export type SundaySchoolWeeklyLessonStatus =
  "UNASSIGNED" | "NEEDS_LINKS" | "READY";

export interface SundaySchoolWeeklyLessonResource {
  id: string;
  weeklyLessonId: string;
  title: string;
  url: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SundaySchoolWeeklyLesson {
  id: string;
  classId: string;
  sundayDate: string;
  title: string | null;
  ownerId: string | null;
  assignedById: string | null;
  createdAt: string;
  updatedAt: string;
  class: SundaySchoolClassRef;
  owner: Pick<SundaySchoolServantRef, "id" | "name" | "profileImageUrl"> | null;
  resources: SundaySchoolWeeklyLessonResource[];
  status: SundaySchoolWeeklyLessonStatus;
  canEdit: boolean;
  canAssignOwner: boolean;
  eligibleOwners: SundaySchoolServantRef[];
}

export interface SundaySchoolWeeklyLessonsResponse {
  lessons: SundaySchoolWeeklyLesson[];
}

export interface SundaySchoolChildSearchResult {
  kind: "child";
  id: string;
  title: string;
  subtitle: string;
  classId: string | null;
}

export interface SundaySchoolClassSearchResult {
  kind: "class";
  id: string;
  title: string;
  subtitle: string;
}

export interface SundaySchoolLessonSearchResult {
  kind: "lesson";
  id: string;
  title: string;
  subtitle: string;
  classId: string;
  sundayDate: string;
}

export interface SundaySchoolSearchResponse {
  query: string;
  children: SundaySchoolChildSearchResult[];
  classes: SundaySchoolClassSearchResult[];
  lessons: SundaySchoolLessonSearchResult[];
}

export interface SundaySchoolVisitationRecord {
  id: string;
  status: SundaySchoolVisitationStatus;
  visitedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  recorder: { id: string; name: string } | null;
}

export interface SundaySchoolPriestNote {
  id: string;
  visitationId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  visitation: {
    id: string;
    status: SundaySchoolVisitationStatus;
    visitedAt: string | null;
    createdAt: string;
  };
  author: { id: string; name: string };
}

export interface SundaySchoolVisitationChild {
  id: string;
  firstName: string;
  lastName: string;
  visitations: SundaySchoolVisitationRecord[];
}

export interface SundaySchoolVisitationClass extends SundaySchoolClassRef {
  canEdit: boolean;
  children: SundaySchoolVisitationChild[];
}

export interface SundaySchoolVisitationsResponse {
  classes: SundaySchoolVisitationClass[];
  standing: {
    readOnly: boolean;
    isAdmin: boolean;
    isPriest: boolean;
  };
}

export interface SundaySchoolFeedbackIdea {
  id: string;
  type: SundaySchoolFeedbackType;
  title: string;
  description: string | null;
  status: SundaySchoolFeedbackStatus;
  createdAt: string;
  updatedAt: string;
  submitter: {
    id: string;
    name: string;
    profileImageUrl: string | null;
  } | null;
  upvotes: number;
  downvotes: number;
  score: number;
  viewerVote: SundaySchoolFeedbackVoteType | null;
  canEdit: boolean;
  canDelete: boolean;
  canVote: boolean;
}

export interface SundaySchoolFeedbackResponse {
  ideas: SundaySchoolFeedbackIdea[];
  statusCounts: Record<SundaySchoolFeedbackStatus, number>;
  viewer: {
    canSubmit: boolean;
    canModerate: boolean;
  };
}

export interface SundaySchoolSession {
  id: string;
  classId: string;
  date: string;
  topic: string | null;
  notes: string | null;
  takenBy: string | null;
  class?: SundaySchoolClassRef;
  taker?: { id: string; name: string } | null;
  _count?: { attendance: number };
}

export interface SundaySchoolRosterEntry {
  id: string;
  firstName: string;
  lastName: string;
  level: SundaySchoolLevel;
  gender: SundaySchoolChildGender | null;
  profileImageUrl: string | null;
  attendance: {
    id: string;
    childId: string;
    status: AttendanceStatus;
    notes: string | null;
  } | null;
}

export interface SundaySchoolSessionAttendance {
  // null while a date has no recorded session yet — the roster is shown
  // unmarked and the session row is created on the first save
  session: SundaySchoolSession | null;
  roster: SundaySchoolRosterEntry[];
}

export interface SundaySchoolServantAttendanceRosterEntry {
  id: string;
  userId: string;
  name: string;
  email: string;
  profileImageUrl: string | null;
  authority: SundaySchoolAuthority;
  attendance: {
    id: string;
    servantId: string;
    status: SundaySchoolServantAttendanceStatus;
  } | null;
}

export interface SundaySchoolServantAttendanceResponse {
  class: SundaySchoolClassRef & { academicYearId: string };
  session: SundaySchoolSession | null;
  roster: SundaySchoolServantAttendanceRosterEntry[];
  canEdit: boolean;
}

export type SundaySchoolAttendanceAudience = "children" | "servants";

export interface SundaySchoolClassSummary {
  id: string;
  name: string;
  level: SundaySchoolLevel;
  ageGroup: { id: string; name: string } | null;
  childCount: number;
  sessionCount: number;
  attendancePercentage: number;
  latestSession: { id: string; date: string; topic: string | null } | null;
  attendanceTakenThisWeek: boolean;
  canServe: boolean;
  canCoordinate: boolean;
  servants: Array<{
    id: string;
    name: string;
    profileImageUrl: string | null;
    isCoordinator: boolean;
  }>;
}

export interface SundaySchoolAttendanceTrendPoint {
  date: string;
  attendedCount: number | null;
  rosterCount: number | null;
  attendanceRate: number | null;
}

export interface SundaySchoolAcademicYearOption {
  id: string;
  name: string;
}

export interface SundaySchoolClassOption {
  id: string;
  name: string;
}

export interface SundaySchoolDashboard {
  classes: SundaySchoolClassSummary[];
  ageGroups: Array<{
    id: string;
    name: string;
    levels: SundaySchoolLevel[];
    canCoordinate: boolean;
  }>;
  totals: {
    classes: number;
    children: number;
    classesNeedingAttendance: number;
  };
  standing: {
    isAdmin: boolean;
    readOnly: boolean;
    coordinatesAnyAgeGroup: boolean;
  };
  attendanceTrend: {
    audience: SundaySchoolAttendanceAudience;
    points: SundaySchoolAttendanceTrendPoint[];
    academicYears: SundaySchoolAcademicYearOption[];
    classes: SundaySchoolClassOption[];
    selectedAcademicYearId: string | null;
    selectedClassId: string | null;
    canSelectClass: boolean;
    canViewServantAttendance: boolean;
    meetingDayLabel: "Saturday" | "Sunday" | "week";
    startDate: string | null;
    endDate: string | null;
  };
  weekOf: string;
}
