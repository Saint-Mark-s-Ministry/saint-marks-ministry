import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
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
import { ApiError } from "./api-client";
import type { AttendanceMarks } from "./attendance-draft";
import {
  clearResourceCache,
  prefetchResources,
} from "./resources";

export type PortalNotification = {
  id: string;
  title: string;
  body: string;
  isRead: boolean;
  isPersistent?: boolean;
  url?: string | null;
  type?: string | null;
  createdAt?: string;
  /** Extra fields the server attached (a teaching reminder's `kind` and `lessonId`). */
  metadata?: Record<string, unknown> | null;
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
  /** Re-reads just the notification feed (cheap; used when a push arrives or the app resumes). */
  refreshNotifications: () => Promise<void>;
  attendance: Record<string, AttendanceSummary>;
  drafts: Record<string, AttendanceMarks>;
  setDraft: (classId: string, date: string, marks: AttendanceMarks) => void;
  loadAttendance: (
    classId: string,
    date: string,
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
      // Each source stands alone. A role with no class access (a parent, a
      // student) gets 403 for the class data; that must read as "no classes",
      // not fail the whole load and wipe their notifications with it.
      const settle = async <T,>(promise: Promise<T>, empty: T): Promise<{ value: T; failure: Error | null }> => {
        try {
          return { value: await promise, failure: null };
        } catch (failure) {
          if (failure instanceof ApiError && failure.status === 403) return { value: empty, failure: null };
          return { value: empty, failure: failure instanceof Error ? failure : new Error("Request failed") };
        }
      };
      const [classesResult, lessonsResult, notificationsResult, sessionsResult] = await Promise.all([
        settle(request<SundaySchoolClass[]>("/api/sunday-school/classes?isActive=true"), [] as SundaySchoolClass[]),
        settle(
          request<{ lessons: SundaySchoolWeeklyLesson[] }>("/api/sunday-school/lessons"),
          { lessons: [] as SundaySchoolWeeklyLesson[] },
        ),
        settle(
          request<{ notifications: PortalNotification[]; unreadCount: number }>("/api/notifications"),
          { notifications: [] as PortalNotification[], unreadCount: 0 },
        ),
        settle(request<SundaySchoolSession[]>("/api/sunday-school/sessions"), [] as SundaySchoolSession[]),
      ]);
      const failure =
        classesResult.failure ?? lessonsResult.failure ?? notificationsResult.failure ?? sessionsResult.failure;
      if (failure) throw failure;
      const nextClasses = classesResult.value;
      const lessonData = lessonsResult.value;
      const notificationData = notificationsResult.value;
      const sessions = sessionsResult.value;
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
  const refreshNotifications = useCallback(async () => {
    try {
      const data = await request<{ notifications: PortalNotification[]; unreadCount: number }>("/api/notifications");
      // Replaced by id, never appended, so a reminder seen twice (push and
      // refresh, or a retry) is still one row.
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // Keep what is showing; the full refresh is what reports problems.
    }
  }, []);
  // A reminder is a server record, so the feed is the source of truth: reread
  // it when a push arrives while the app is open and whenever the app comes
  // back to the foreground. That works whether or not push permission was
  // granted or the push itself was delivered.
  useEffect(() => {
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshNotifications();
    });
    let received: { remove: () => void } | undefined;
    try {
      received = Notifications.addNotificationReceivedListener(() => void refreshNotifications());
    } catch {
      // No native notifications module in this binary: the AppState path still works.
    }
    return () => {
      appState.remove();
      received?.remove();
    };
  }, [refreshNotifications]);
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
        refreshNotifications,
        attendance,
        drafts,
        loadAttendance,
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
