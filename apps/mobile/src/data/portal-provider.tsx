import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type {
  SundaySchoolClass,
  SundaySchoolChild,
  SundaySchoolWeeklyLesson,
  SundaySchoolSession,
  SundaySchoolSessionAttendance,
} from "@stmark/contracts";
import {
  getMostRecentClassMeetingDate,
  toDateInputValue,
} from "@stmark/domain";
import { api } from "./auth-provider";
import { rosterProgress, type AttendanceMarks } from "./attendance-draft";
import {
  clearResourceCache,
  invalidateResourceCache,
  prefetchResources,
} from "./resources";

export type PortalNotification = {
  id: string;
  title: string;
  body: string;
  isRead: boolean;
  isPersistent?: boolean;
  url?: string | null;
};
type AttendanceSummary = { marks: AttendanceMarks; savedAt: string | null };
export const attendanceKey = (classId: string, date: string) =>
  `${classId}:${date}`;
export const meetingDate = (cls: SundaySchoolClass) =>
  toDateInputValue(getMostRecentClassMeetingDate(cls.level));
const request = <T,>(path: string, init?: RequestInit) => {
  if (!api) throw new Error("No API server configured.");
  return api.request<T>(path, init);
};
const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
type PortalState = {
  classes: SundaySchoolClass[];
  lessons: SundaySchoolWeeklyLesson[];
  notifications: PortalNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  attendance: Record<string, AttendanceSummary>;
  drafts: Record<string, AttendanceMarks>;
  setDraft: (classId: string, date: string, marks: AttendanceMarks) => void;
  loadAttendance: (
    classId: string,
    date: string,
  ) => Promise<SundaySchoolSessionAttendance>;
  saveAttendance: (
    classId: string,
    date: string,
    loaded: SundaySchoolSessionAttendance,
    marks: AttendanceMarks,
  ) => Promise<SundaySchoolSessionAttendance>;
  markRead: (id: string) => Promise<void>;
};
const PortalContext = createContext<PortalState | null>(null);

export function PortalProvider({ children }: PropsWithChildren) {
  const [classes, setClasses] = useState<SundaySchoolClass[]>([]);
  const [lessons, setLessons] = useState<SundaySchoolWeeklyLesson[]>([]);
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<
    Record<string, AttendanceSummary>
  >({});
  const [drafts, setDrafts] = useState<Record<string, AttendanceMarks>>({});
  const refreshId = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++refreshId.current;
    setLoading(true);
    setError(null);
    try {
      const [nextClasses, lessonData, notificationData, sessions] =
        await Promise.all([
          request<SundaySchoolClass[]>(
            "/api/sunday-school/classes?isActive=true",
          ),
          request<{ lessons: SundaySchoolWeeklyLesson[] }>(
            "/api/sunday-school/lessons",
          ),
          request<{ notifications: PortalNotification[]; unreadCount: number }>(
            "/api/notifications",
          ),
          request<SundaySchoolSession[]>("/api/sunday-school/sessions"),
        ]);
      if (id !== refreshId.current) return;
      setClasses(nextClasses);
      setLessons(lessonData.lessons);
      setNotifications(notificationData.notifications);
      setUnreadCount(notificationData.unreadCount);
      setAttendance(
        Object.fromEntries(
          sessions
            .filter((s) => (s._count?.attendance ?? 0) > 0)
            .map((s) => [
              attendanceKey(s.classId, s.date.slice(0, 10)),
              { marks: {}, savedAt: null },
            ]),
        ),
      );
      const primaryClassId = nextClasses[0]?.id;
      void prefetchResources([
        "/api/sunday-school/dashboard",
        "/api/sunday-school/dashboard?audience=children",
        primaryClassId
          ? `/api/sunday-school/lessons?scope=year&classId=${encodeURIComponent(primaryClassId)}`
          : "/api/sunday-school/lessons?scope=year",
        primaryClassId
          ? `/api/sunday-school/children?classId=${encodeURIComponent(primaryClassId)}&isActive=true`
          : "/api/sunday-school/children?isActive=true",
        "/api/sunday-school/visitations",
        "/api/sunday-school/feedback?status=ALL&sort=TOP",
      ]);
    } catch (err) {
      if (id !== refreshId.current) return;
      // Do not leave previously visible classes on screen after access changes.
      setClasses([]);
      setLessons([]);
      setNotifications([]);
      setAttendance({});
      setDrafts({});
      setError(
        err instanceof Error ? err.message : "Unable to load your classes.",
      );
    } finally {
      if (id === refreshId.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const sequence = refreshId;
    void refresh();
    return () => {
      sequence.current++;
      clearResourceCache();
    };
  }, [refresh]);

  const loadAttendance = useCallback(async (classId: string, date: string) => {
    const sessions = await request<SundaySchoolSession[]>(
      `/api/sunday-school/sessions?classId=${encodeURIComponent(classId)}&from=${date}&to=${date}`,
    );
    let result: SundaySchoolSessionAttendance;
    if (sessions[0])
      result = await request<SundaySchoolSessionAttendance>(
        `/api/sunday-school/sessions/${encodeURIComponent(sessions[0].id)}/attendance`,
      );
    else {
      const children = await request<SundaySchoolChild[]>(
        `/api/sunday-school/children?classId=${encodeURIComponent(classId)}&isActive=true`,
      );
      // Retain roster fields only, never guardian contacts in the mobile cache.
      result = {
        session: null,
        roster: children.map(({ id, firstName, lastName, level, gender, user }) => ({
          id,
          firstName,
          lastName,
          level,
          gender,
          profileImageUrl: user?.profileImageUrl ?? null,
          attendance: null,
        })),
      };
    }
    const marks: AttendanceMarks = Object.fromEntries(
      result.roster.flatMap((child) =>
        child.attendance ? [[child.id, child.attendance.status]] : [],
      ),
    );
    setAttendance((previous) => {
      const next = { ...previous };
      const key = attendanceKey(classId, date);
      if (Object.keys(marks).length) next[key] = { marks, savedAt: null };
      else delete next[key];
      return next;
    });
    return result;
  }, []);

  async function saveAttendance(
    classId: string,
    date: string,
    loaded: SundaySchoolSessionAttendance,
    marks: AttendanceMarks,
  ) {
    if (!classes.find((cls) => cls.id === classId)?.canServe)
      throw new Error("You have read-only access to this class.");
    if (
      !rosterProgress(
        loaded.roster.map((child) => child.id),
        marks,
      ).complete
    )
      throw new Error("Mark every child before saving.");
    const session =
      loaded.session ??
      (await request<SundaySchoolSession>(
        "/api/sunday-school/sessions",
        json({ classId, date }),
      ));
    await request(
      "/api/sunday-school/attendance/batch",
      json({
        sessionId: session.id,
        records: loaded.roster.map((child) => ({
          childId: child.id,
          status: marks[child.id],
          notes: child.attendance?.notes ?? null,
        })),
      }),
    );
    invalidateResourceCache();
    const confirmed = await loadAttendance(classId, date);
    setDrafts((previous) => {
      const next = { ...previous };
      delete next[attendanceKey(classId, date)];
      return next;
    });
    setAttendance((previous) => ({
      ...previous,
      [attendanceKey(classId, date)]: {
        marks: { ...marks },
        savedAt: new Date().toISOString(),
      },
    }));
    return confirmed;
  }
  async function markRead(id: string) {
    if (notifications.some((item) => item.id === id && item.isPersistent)) return;
    await request(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: "PATCH",
    });
    if (notifications.some((item) => item.id === id && !item.isRead))
      setUnreadCount((count) => Math.max(0, count - 1));
    setNotifications((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, isRead: true } : item,
      ),
    );
  }
  return (
    <PortalContext.Provider
      value={{
        classes,
        lessons,
        notifications,
        unreadCount,
        loading,
        error,
        refresh,
        attendance,
        drafts,
        loadAttendance,
        saveAttendance,
        markRead,
        setDraft: (classId, date, marks) =>
          setDrafts((previous) => ({
            ...previous,
            [attendanceKey(classId, date)]: { ...marks },
          })),
      }}
    >
      {children}
    </PortalContext.Provider>
  );
}
export function usePortal() {
  const value = useContext(PortalContext);
  if (!value) throw new Error("PortalProvider missing");
  return value;
}
