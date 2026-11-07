import { describe, expect, it } from "vitest";
import {
  ACTION_SUCCESS, answerCells, awaitingUnlock, contactAge, examControls, filterRoster, resultLine, rosterSummary,
  sheetStateLabel, sortRoster, staffActionFailure, studentTile, unlockBlocker, unlockHeadline,
} from "../../apps/mobile/src/data/exam-monitor";
import { canUnlockStudent } from "../../apps/mobile/src/data/live-exams";
import { ApiError } from "../../apps/mobile/src/data/api-client";
import { NOW, event, row, view } from "./exam-monitor-fixture";

const open = (extra = {}, roster = [] as ReturnType<typeof row>[]) => view(extra, roster);
const sheet = (state: "DRAFT" | "OPEN" | "CLOSED", extra: Record<string, unknown> = {}) =>
  ({ state, choiceCounts: Array<number>(50).fill(4), openedAt: "2026-10-14T10:00:00Z", closedAt: null, releasedAt: null, ...extra }) as NonNullable<ReturnType<typeof view>["sheet"]>;

describe("which exam controls are offered", () => {
  it("offers setup before the first opening, and only to someone who can manage", () => {
    const fresh = view({ sheet: sheet("DRAFT", { openedAt: null }) });
    expect(examControls(fresh, true)).toMatchObject({ configure: true, open: true, close: false, release: false, ready: false, reset: false });
    expect(examControls(view({ sheet: null }), true)).toMatchObject({ configure: true, open: false });
    for (const value of Object.values(examControls(fresh, false))) expect(value).toBe(false);
    expect(Object.values(examControls(undefined, true)).every((value) => value === false)).toBe(true);
  });
  it("locks setup once the exam has opened (the server locks the key and choices)", () => {
    expect(examControls(open(), true).configure).toBe(false);
    expect(examControls(open({ sheet: sheet("CLOSED") }), true).configure).toBe(false);
  });
  it("offers Close while open, Release only when closed with results pending, and Reset only before anyone joins", () => {
    expect(examControls(open(), true)).toMatchObject({ close: true, open: false, release: false, reset: true, ready: true });
    const joined = open({}, [row("Mina", { state: "ACTIVE" })]);
    expect(examControls(joined, true).reset).toBe(false);
    expect(examControls(open({ sheet: sheet("CLOSED") }), true)).toMatchObject({ release: true, open: true, close: false });
    expect(examControls(open({ sheet: sheet("CLOSED", { releasedAt: "2026-10-15T00:00:00Z" }) }), true)).toMatchObject({ release: false, open: false, reset: false });
    expect(examControls(open({ sheet: sheet("CLOSED", { releasedAt: "2026-10-15T00:00:00Z" }), pendingResults: 2 }), true).release).toBe(true);
  });
  it("reopens a released exam only while someone's retake is unfinished", () => {
    const released = sheet("CLOSED", { releasedAt: "2026-10-15T00:00:00Z" });
    expect(examControls(open({ sheet: released }, [row("Mina", { state: "SUBMITTED" })]), true).open).toBe(false);
    expect(examControls(open({ sheet: released }, [row("Mina", { state: "PAUSED", retakeReady: true })]), true).open).toBe(true);
  });
  it("offers retakes only when the server lists candidates and the exam has opened", () => {
    expect(examControls(open({ retakeCandidates: [{ id: "a", name: "A" }] }), true).retakes).toBe(true);
    expect(examControls(open({ retakeCandidates: [] }), true).retakes).toBe(false);
    expect(examControls(open({ retakeCandidates: [{ id: "a", name: "A" }], sheet: sheet("DRAFT", { openedAt: null }) }), true).retakes).toBe(false);
  });
  it("words the exam's state", () => {
    expect(sheetStateLabel(view({ sheet: null }))).toBe("Needs setup");
    expect(sheetStateLabel(view({ sheet: sheet("DRAFT") }))).toBe("Ready to open");
    expect(sheetStateLabel(view({ sheet: sheet("DRAFT", { openedAt: null }) }))).toBe("Needs setup");
    expect(sheetStateLabel(view())).toBe("Open");
    expect(sheetStateLabel(view({ sheet: sheet("CLOSED") }))).toBe("Closed");
    expect(sheetStateLabel(view({ sheet: sheet("CLOSED", { releasedAt: "x" }) }))).toBe("Results released");
  });
  it("has success wording for every staff action", () => {
    for (const action of ["configure", "open", "close", "release", "unlock", "retake", "ready", "reset"] as const) expect(ACTION_SUCCESS[action]).toBeTruthy();
  });
});

describe("the student grid", () => {
  const paused = row("Paused", { state: "PAUSED", events: [event("e1", "HIDDEN")] });
  const reconnecting = row("Reconnecting", { state: "PAUSED", stale: true });
  const hidden = row("Hidden", { state: "PAUSED", pageVisible: false });
  const stale = row("Stale", { state: "ACTIVE", stale: true });
  const answering = row("Answering", { state: "ACTIVE", answeredCount: 12 });
  const waiting = row("Waiting", null);
  const retake = row("Retake", { state: "PAUSED", retakeReady: true });
  const done = row("Done", { state: "SUBMITTED", correctCount: 41, percentage: 82 });
  const all = [done, answering, waiting, stale, reconnecting, retake, hidden, paused];
  const v = view({}, all);

  it("highlights students waiting for an unlock, and says why one cannot be unlocked yet", () => {
    expect(studentTile(v, paused)).toMatchObject({ label: "Needs unlock", tone: "alert" });
    expect(studentTile(v, reconnecting)).toMatchObject({ label: "Paused", tone: "alert", detail: expect.stringMatching(/must reconnect/) });
    expect(studentTile(v, hidden)).toMatchObject({ label: "Paused", detail: expect.stringMatching(/hidden/) });
    expect(studentTile(v, stale)).toMatchObject({ label: "No contact", tone: "warn" });
    expect(studentTile(v, answering).label).toBe("Answering");
    expect(studentTile(v, waiting).label).toBe("Not started");
    expect(studentTile(v, retake).label).toBe("Retake ready");
    expect(studentTile(v, done).label).toBe("Submitted");
  });
  it("sorts the unlockable first, then reconnecting, then stale, answering, not started, submitted", () => {
    expect(sortRoster(v, all).map((r) => r.student.name)).toEqual(["Paused", "Hidden", "Reconnecting", "Stale", "Answering", "Retake", "Waiting", "Done"]);
  });
  it("counts the roster and writes a headline only when someone is waiting on a proctor", () => {
    const summary = rosterSummary(v, all);
    expect(summary).toEqual({ eligible: 8, started: 6, paused: 3, unlockReady: 1, noContact: 1, submitted: 1 });
    expect(unlockHeadline(summary)).toBe("1 student can be unlocked now · 2 still reconnecting");
    expect(unlockHeadline({ ...summary, unlockReady: 0 })).toBe("3 students paused and still reconnecting");
    expect(unlockHeadline({ ...summary, paused: 2, unlockReady: 2 })).toBe("2 students can be unlocked now");
    expect(unlockHeadline(rosterSummary(v, [answering, done]))).toBeNull();
  });
  it("does not count historical attempts as eligible, and finds students by name", () => {
    expect(rosterSummary(view({}, [row("Old", { state: "SUBMITTED" }, false)]), [row("Old", { state: "SUBMITTED" }, false)]).eligible).toBe(0);
    expect(filterRoster(all, "  rec").map((r) => r.student.name)).toEqual(["Reconnecting"]);
    expect(filterRoster(all, "")).toHaveLength(all.length);
  });
  it("agrees with the unlock gate: a blocker means the server would refuse", () => {
    for (const r of all) {
      const allowed = canUnlockStudent(v, r);
      expect(allowed).toBe(awaitingUnlock(r) && unlockBlocker(v, r) === null);
    }
    const closed = view({ sheet: sheet("CLOSED") }, [paused]);
    expect(unlockBlocker(closed, paused)).toMatch(/not open/);
    expect(canUnlockStudent(closed, paused)).toBe(false);
    expect(unlockBlocker(v, answering)).toBeNull();
  });
  it("shows how long ago a student was last heard from", () => {
    expect(contactAge("2026-10-14T12:00:28Z", NOW)).toBe("just now");
    expect(contactAge("2026-10-14T12:00:10Z", NOW)).toBe("20 s ago");
    expect(contactAge("2026-10-14T11:57:00Z", NOW)).toBe("3 min ago");
    expect(contactAge("2026-10-14T09:00:00Z", NOW)).toBe("over an hour ago");
    expect(contactAge("nonsense", NOW)).toBe("unknown");
  });
});

describe("answer detail and results come from the server, never the device", () => {
  it("lists all 50 saved choices, blank where none", () => {
    const cells = answerCells(["A", "", "C"]);
    expect(cells).toHaveLength(50);
    expect(cells.slice(0, 4)).toEqual([{ question: 1, choice: "A" }, { question: 2, choice: "" }, { question: 3, choice: "C" }, { question: 4, choice: "" }]);
    expect(answerCells(undefined).every((cell) => cell.choice === "")).toBe(true);
  });
  it("prints the server's count and percentage; it never derives a percentage itself", () => {
    expect(resultLine({ correctCount: 41, percentage: 82 })).toBe("41 of 50 correct · 82%");
    expect(resultLine({ correctCount: 41 })).toBe("41 of 50 correct");
    expect(resultLine({ correctCount: null })).toBeNull();
    expect(resultLine({})).toBeNull();
  });
});

describe("what the proctor is told when the server refuses", () => {
  it("shows the server's own reason for a stale unlock, an existing-grade conflict, and a concurrent change", () => {
    for (const message of [
      "The student must return and reconnect before unlocking.",
      "Existing grades overlap these submissions. Resolve them before releasing; no grades were overwritten.",
      "The exam changed. Refresh and try again.",
    ]) expect(staffActionFailure(new ApiError(message, 409), "unlock")).toEqual({ kind: "conflict", message, refresh: true });
  });
  it("reloads after a lost permission or a missing exam, and does not for View As or a bad request", () => {
    expect(staffActionFailure(new ApiError("Forbidden", 403))).toMatchObject({ kind: "forbidden", refresh: true });
    expect(staffActionFailure(new ApiError("View as is read-only.", 403, "ViewAsReadOnly"))).toMatchObject({ kind: "readonly", refresh: false });
    expect(staffActionFailure(new ApiError("Not found", 404))).toMatchObject({ kind: "missing", refresh: true });
    expect(staffActionFailure(new ApiError("Set between two and eight choices for all 50 questions.", 400))).toEqual({
      kind: "invalid", message: "Set between two and eight choices for all 50 questions.", refresh: false,
    });
  });
  it("says an offline action may or may not have been applied, and reloads to find out", () => {
    const failure = staffActionFailure(new TypeError("Network request failed"), "close");
    expect(failure.kind).toBe("offline");
    expect(failure.refresh).toBe(true);
    expect(failure.message).toMatch(/not known whether "close" was applied/);
  });
});
