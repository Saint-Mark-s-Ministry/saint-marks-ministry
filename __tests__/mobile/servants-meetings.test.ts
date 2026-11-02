import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SundaySchoolDashboard } from "@stmark/contracts";
import {
  afterCreate,
  attendanceGate,
  buildSaveBody,
  checkNewMeeting,
  meetingDateLabel,
  meetingFailure,
  meetingTitleLabel,
  progressLabel,
  reconcileMarks,
  servantsMeetingGroups,
  unmarkedCount,
  validDay,
} from "../../apps/mobile/src/data/servants-meetings";
import { ministryAccess } from "../../apps/mobile/src/data/ministry";
import { authenticatedRoutes } from "../../apps/mobile/src/data/route-access";
import { WEB_TO_NATIVE } from "../../apps/mobile/src/data/notification-routes";

const src = (file: string) => readFileSync(join(__dirname, "../../apps/mobile/src", file), "utf8");
const code = (file: string) => src(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const group = (id: string, canCoordinate = false) => ({ id, name: id, levels: [], canCoordinate });
type Standing = SundaySchoolDashboard["standing"];
const dashboard = (standing: Partial<Standing> = {}, extra: { classes?: SundaySchoolDashboard["classes"]; ageGroups?: ReturnType<typeof group>[] } = {}) =>
  ({
    classes: extra.classes ?? [],
    ageGroups: extra.ageGroups ?? [group("elementary"), group("middle"), group("high", true)],
    standing: { isAdmin: false, readOnly: false, coordinatesAnyAgeGroup: false, ...standing },
    attendanceTrend: { canViewServantAttendance: false },
  }) as unknown as SundaySchoolDashboard;
const cls = (ageGroupId: string) => ({ ageGroup: { id: ageGroupId, name: ageGroupId } }) as SundaySchoolDashboard["classes"][number];
const person = (id: string, status: "PRESENT" | "ABSENT" | null = null) => ({ id, name: `Servant ${id}`, status });

describe("which school groups are offered", () => {
  it("lists only the groups the account has a class in, or coordinates", () => {
    const ids = (d: SundaySchoolDashboard) => servantsMeetingGroups(d).map((g) => g.id);
    expect(ids(dashboard({}, { classes: [cls("elementary")] }))).toEqual(["elementary", "high"]);
    expect(ids(dashboard())).toEqual(["high"]);
  });

  it("lists everything the API gives an administrator or a read-only viewer, and nothing before it loads", () => {
    expect(servantsMeetingGroups(dashboard({ isAdmin: true })).map((g) => g.id)).toEqual(["elementary", "middle", "high"]);
    expect(servantsMeetingGroups(dashboard({ readOnly: true }))).toHaveLength(3);
    expect(servantsMeetingGroups(undefined)).toEqual([]);
  });

  it("gates the menu row on it, as menu visibility only", () => {
    expect(ministryAccess(dashboard({}, { classes: [cls("elementary")] }), []).canOpenServantsMeetings).toBe(true);
    expect(ministryAccess(dashboard({}, { ageGroups: [group("elementary")] }), []).canOpenServantsMeetings).toBe(false);
    expect(ministryAccess(undefined, []).canOpenServantsMeetings).toBe(false);
  });
});

describe("opening attendance on the meeting date", () => {
  const base = { canManageAttendance: true, today: "2026-10-31" };

  it("is editable today and for any past meeting, so past attendance can be corrected", () => {
    expect(attendanceGate({ ...base, day: "2026-10-31" })).toBe("editable");
    expect(attendanceGate({ ...base, day: "2026-09-05" })).toBe("editable");
  });

  it("opens on the meeting's day, not before", () => {
    expect(attendanceGate({ ...base, day: "2026-11-07" })).toBe("not-yet");
    // The same meeting becomes editable when the church's calendar reaches it.
    expect(attendanceGate({ ...base, day: "2026-11-07", today: "2026-11-07" })).toBe("editable");
  });

  it("is view-only without roster authority, and while previewing another account", () => {
    expect(attendanceGate({ ...base, canManageAttendance: false, day: "2026-10-31" })).toBe("view-only");
    expect(attendanceGate({ ...base, day: "2026-10-31", previewing: true })).toBe("view-only");
  });
});

describe("creating a meeting", () => {
  it("sends the group, the date and a trimmed optional title", () => {
    expect(checkNewMeeting({ ageGroupId: "g", date: "2026-11-07", title: "  Service planning " })).toEqual({
      ok: true,
      body: { ageGroupId: "g", date: "2026-11-07", title: "Service planning" },
    });
    expect(checkNewMeeting({ ageGroupId: "g", date: "2026-11-07", title: "   " })).toEqual({
      ok: true,
      body: { ageGroupId: "g", date: "2026-11-07" },
    });
  });

  it("refuses a missing group, a bad date and an over-long title before asking the server", () => {
    expect(checkNewMeeting({ ageGroupId: "", date: "2026-11-07", title: "" })).toMatchObject({ ok: false });
    for (const date of ["", "2026-13-01", "2026-02-30", "11/07/2026", "2026-1-5"])
      expect(checkNewMeeting({ ageGroupId: "g", date, title: "" })).toMatchObject({ ok: false });
    expect(checkNewMeeting({ ageGroupId: "g", date: "2026-11-07", title: "x".repeat(201) })).toMatchObject({ ok: false });
    expect(checkNewMeeting({ ageGroupId: "g", date: "2026-11-07", title: "x".repeat(200) })).toMatchObject({ ok: true });
  });

  it("opens a meeting dated today or earlier and only plans a later one", () => {
    expect(afterCreate({ date: "2026-10-31T00:00:00.000Z" }, "2026-10-31")).toBe("open");
    expect(afterCreate({ date: "2026-10-03T00:00:00.000Z" }, "2026-10-31")).toBe("open");
    expect(afterCreate({ date: "2026-11-07T00:00:00.000Z" }, "2026-10-31")).toBe("planned");
  });

  it("reads dates in UTC so a phone in another time zone never moves the day", () => {
    expect(meetingDateLabel("2026-10-03")).toBe("Sat, Oct 3, 2026");
    expect(meetingTitleLabel({ date: "2026-10-03T00:00:00.000Z", title: "Planning" })).toBe("Sat, Oct 3, 2026 — Planning");
    expect(meetingTitleLabel({ date: "2026-10-03T00:00:00.000Z", title: null })).toBe("Sat, Oct 3, 2026");
    expect(validDay("2026-02-29")).toBe(false);
  });
});

describe("saving attendance", () => {
  const roster = [person("a"), person("b", "ABSENT"), person("c")];

  it("needs an explicit Present or Absent for every attendee; nobody is assumed absent", () => {
    expect(buildSaveBody("m", roster, { a: "PRESENT" })).toBeNull();
    expect(buildSaveBody("m", roster, { a: "PRESENT", c: "PRESENT" })).toEqual({
      meetingId: "m",
      records: [
        { servantId: "a", status: "PRESENT" },
        { servantId: "b", status: "ABSENT" },
        { servantId: "c", status: "PRESENT" },
      ],
    });
    expect(buildSaveBody("m", [], {})).toBeNull();
  });

  it("a mark made on screen wins over the saved one", () => {
    expect(buildSaveBody("m", [person("a", "ABSENT")], { a: "PRESENT" })?.records).toEqual([{ servantId: "a", status: "PRESENT" }]);
  });

  it("counts and describes progress", () => {
    expect(unmarkedCount(roster, { a: "PRESENT" })).toBe(1);
    expect(progressLabel(roster, { a: "PRESENT" })).toBe("1 of 3 present · 1 not recorded");
    expect(progressLabel(roster, { a: "PRESENT", c: "ABSENT" })).toBe("1 of 3 present");
  });

  it("after a refresh keeps marks only for people still on the roster, and leaves new people unmarked", () => {
    const next = [person("a"), person("z")];
    expect(reconcileMarks({ a: "PRESENT", b: "ABSENT" }, next)).toEqual({ a: "PRESENT" });
  });
});

describe("what a failure means", () => {
  const status = (code: number, message: string) => Object.assign(new Error(message), { status: code });

  it("a 403 is a lost permission and reloads, in plain words", () => {
    const failure = meetingFailure(status(403, "Forbidden"));
    expect(failure).toMatchObject({ kind: "forbidden", reload: true });
    expect(failure.message).toMatch(/no longer have permission/i);
  });

  it("a 404 means the meeting is gone, and a roster mismatch asks for a review", () => {
    expect(meetingFailure(status(404, "Meeting not found"))).toMatchObject({ kind: "missing", reload: true });
    expect(meetingFailure(status(400, "One or more servants are outside this meeting roster"))).toMatchObject({ kind: "roster", reload: true });
  });

  it("other 400s show the server's words, and a dropped connection keeps the marks", () => {
    expect(meetingFailure(status(400, "Meeting date must be within the active year"))).toEqual({
      kind: "invalid",
      message: "Meeting date must be within the active year",
      reload: false,
    });
    expect(meetingFailure(new Error("Could not reach the server."))).toMatchObject({ kind: "offline", reload: false });
    expect(meetingFailure(status(403, "View as is read-only. Stop viewing as this user before making changes.")).kind).toBe("other");
  });
});

describe("wiring", () => {
  const screen = code("app/servants-meetings.tsx");

  it("is a signed-in route reached from More, search, Servant attendance and a notification link", () => {
    expect(authenticatedRoutes).toContain("servants-meetings");
    expect(src("app/(tabs)/ministry/index.tsx")).toContain('href: "/servants-meetings"');
    expect(code("data/search-tools.ts")).toContain('href: "/servants-meetings"');
    expect(src("app/servant-attendance.tsx")).toContain('router.push("/servants-meetings")');
    expect(WEB_TO_NATIVE["servants/servant-attendance/meetings"]).toBeTypeOf("function");
  });

  it("opening the screen creates nothing: the only POST and PUT are inside the Add and Save actions", () => {
    expect(screen.match(/"POST"/g)).toHaveLength(1);
    expect(screen.match(/"PUT"/g)).toHaveLength(1);
    expect(screen.indexOf('"POST"')).toBeGreaterThan(screen.indexOf("async function create()"));
    expect(screen.indexOf('"PUT"')).toBeGreaterThan(screen.indexOf("async function save()"));
  });

  it("hides create and save during a View As preview and never offers check-in", () => {
    expect(screen).toContain("previewing: !!viewingAs");
    expect(screen).toContain("!!data?.canCreate && !viewingAs");
    expect(screen).not.toMatch(/PATCH|geolocation|check in/i);
  });

  it("caches the answer per signed-in or viewed account", () => {
    expect(screen).toContain("servants-meetings:");
  });
});
