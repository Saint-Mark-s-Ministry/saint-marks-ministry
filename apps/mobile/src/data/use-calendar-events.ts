import { useMemo } from "react";
import { attendanceKey, meetingDate, usePortal } from "./portal-provider";
import { useResource } from "./resources";
import {
  buildCalendarEvents,
  liturgicalDatesParam,
  type CalendarEvent,
  type CalendarLiturgicalDay,
  type DateKey,
} from "./calendar";

export interface LiturgicalCalendarDay extends CalendarLiturgicalDay {
  date: string;
  copticDate: { label: string } | null;
}

/**
 * Sunday School calendar events for a set of days: lessons, attendance owed or
 * taken, and the church calendar's feasts and fasts (best effort: if that
 * upstream is down the rest of the calendar still works).
 */
export function useCalendarEvents(days: DateKey[]) {
  const { classes, lessons, attendance, loading, refresh } = usePortal();
  const dates = liturgicalDatesParam(days);
  const church = useResource<{ days: Record<string, LiturgicalCalendarDay> }>(
    dates ? `/api/liturgical/calendar?dates=${dates}` : null,
  );
  const liturgical = church.data?.days;

  const events = useMemo(() => {
    const classById = new Map(classes.map((cls) => [cls.id, cls]));
    const attendanceTaken = Object.keys(attendance).flatMap((key) => {
      const split = key.lastIndexOf(":");
      const classId = key.slice(0, split);
      const cls = classById.get(classId);
      return cls ? [{ classId, className: cls.name, date: key.slice(split + 1) }] : [];
    });
    const attendanceDue = classes
      .filter((cls) => cls.canServe && !attendance[attendanceKey(cls.id, meetingDate(cls))])
      .map((cls) => ({ classId: cls.id, className: cls.name, date: meetingDate(cls) }));
    return buildCalendarEvents({
      lessons,
      attendanceDue,
      attendanceTaken,
      liturgical: liturgical ?? {},
    });
  }, [classes, lessons, attendance, liturgical]);

  const eventsOn = (day: DateKey): CalendarEvent[] => events[day] ?? [];

  return {
    events,
    eventsOn,
    liturgical: liturgical ?? {},
    loading,
    refresh: async () => {
      await Promise.all([refresh(), church.refresh()]);
    },
  };
}
