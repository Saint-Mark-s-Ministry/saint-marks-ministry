import { describe, expect, it, vi } from "vitest";
import type { AttemptResponse, DigitalExamList, DigitalExamView, ExamAttemptView } from "@stmark/contracts";
import { ExamAttemptController } from "../../apps/mobile/src/data/exam-attempt";
import { ApiError } from "../../apps/mobile/src/data/api-client";
import { LocationUnavailable, type ExamPosition } from "../../apps/mobile/src/data/exam-location";
import { canUnlockStudent, completeAnswerKey, examCalendarDate, filterLiveExams, liveExamAudience, monitoringState } from "../../apps/mobile/src/data/live-exams";

function fixture() {
  let attempt: ExamAttemptView = { id: "attempt", state: "ACTIVE", answers: Array<string>(50).fill(""), revision: 1,
    startedAt: "2026-10-14T12:00:00Z", lastSeenAt: "2026-10-14T12:00:00Z", pausedAt: null, submittedAt: null, attemptNumber: 1 };
  let examState = "OPEN";
  let hasAttempt = false;
  let draft: string | null = null;
  let serial = 1;
  const view = (): DigitalExamView => ({
    exam: { id: "exam", examDate: "2026-10-14T00:00:00Z", yearLevel: "YEAR_1", totalPoints: 100, examSection: { displayName: "Bible" }, academicYear: { name: "2026-27" } },
    sheet: { state: examState as "OPEN", choiceCounts: Array<number>(50).fill(4), openedAt: "2026-10-14T00:00:00Z", closedAt: null, releasedAt: null },
    attempt: structuredClone(attempt),
  });
  const getView = vi.fn(async () => {
    if (examState !== "OPEN") throw new ApiError("Not found", 404);
    return { ...view(), attempt: hasAttempt ? structuredClone(attempt) : null };
  });
  const server = async (body: Record<string, unknown>): Promise<AttemptResponse> => {
    if (attempt.state === "SUBMITTED") {
      if (["start", "submit", "heartbeat"].includes(String(body.action))) return { attempt: structuredClone(attempt), examState };
      throw new ApiError("Your exam has already been submitted.", 409);
    }
    if (examState !== "OPEN") throw new ApiError("The exam is not open.", 409);
    if (attempt.retakeReady && body.action !== "start") throw new ApiError("Start the approved retake first.", 409);
    if (body.action === "start") hasAttempt = true;
    if (body.action === "start" && attempt.retakeReady) attempt = { ...attempt, retakeReady: false, state: "ACTIVE", revision: attempt.revision + 1 };
    if (body.action === "events") {
      const events = body.events as { kind: string }[];
      if (events.some(event => ["HIDDEN", "BLUR", "OFFLINE", "RECONNECTED"].includes(event.kind)))
        attempt = { ...attempt, state: "PAUSED", revision: attempt.revision + 1 };
    }
    if (body.action === "save" || body.action === "submit") {
      if (attempt.state !== "ACTIVE") return { attempt: structuredClone(attempt), examState, blocked: true };
      if (body.revision !== attempt.revision) throw new ApiError("Revision changed", 409);
      if (body.action === "save") {
        const answers = [...attempt.answers]; answers[Number(body.question)] = String(body.answer);
        attempt = { ...attempt, answers, revision: attempt.revision + 1 };
      } else attempt = { ...attempt, state: "SUBMITTED", revision: attempt.revision + 1, submittedAt: "2026-10-14T13:00:00Z" };
    }
    return { attempt: structuredClone(attempt), examState };
  };
  const post = vi.fn(server);
  const save = vi.fn(async (value: string | null) => { draft = value; });
  const create = (extra: Partial<ConstructorParameters<typeof ExamAttemptController>[0]> = {}) => new ExamAttemptController({ getView, post, now: () => 100000,
    uuid: () => `00000000-0000-4000-8000-${String(serial++).padStart(12, "0")}`,
    store: { load: async () => draft, save }, ...extra });
  const control = create();
  return { control, create, post, getView, save, server, view, get draft() { return draft; },
    setDraft: (value: string) => { draft = value; },
    setAttempt: (value: Partial<ExamAttemptView>) => { attempt = { ...attempt, ...value }; hasAttempt = true; },
    close: () => { examState = "CLOSED"; attempt = { ...attempt, state: "SUBMITTED", revision: attempt.revision + 1, submittedAt: "2026-10-14T13:00:00Z" }; },
  };
}
async function started() {
  const fixtureData = fixture();
  await fixtureData.control.refresh(); await fixtureData.control.start();
  return fixtureData;
}
const saves = (f: ReturnType<typeof fixture>) => f.post.mock.calls.filter(([body]) => body.action === "save");

describe("native live exam answering", () => {
  it("preserves a pending choice until the server acknowledges it", async () => {
    const f = await started();
    let finish!: () => void;
    const delay = new Promise<void>(resolve => { finish = resolve; });
    f.post.mockImplementation(async body => { if (body.action === "save") await delay; return f.server(body); });
    f.control.choose(4, "C");
    await vi.waitFor(() => expect(saves(f)).toHaveLength(1));
    expect(f.control.snapshot().pendingCount).toBe(1);
    expect(f.control.snapshot().answers[4]).toBe("C");
    expect(f.draft).toContain('"4":"C"');
    finish(); await f.control.refresh();
    expect(f.control.snapshot().pendingCount).toBe(0);
    expect(f.control.snapshot().answers[4]).toBe("C");
  });
  it("saves a cleared answer as a blank choice", async () => {
    const f = await started();
    f.control.choose(0, "B"); await f.control.refresh();
    f.control.choose(0, ""); await f.control.refresh();
    expect(f.control.snapshot().answers[0]).toBe("");
    expect(saves(f).at(-1)?.[0].answer).toBe("");
  });
  it("preserves private review stars across remounts without sending them to the server", async () => {
    const f = await started();
    f.control.toggleStar(3); f.control.toggleStar(9); f.control.toggleStar(3);
    await vi.waitFor(() => expect(f.draft).toContain('"starredQuestions":[9]'));
    expect(f.control.snapshot().starredQuestions).toEqual([9]);
    const restored = f.create(); await restored.refresh(); await restored.start();
    expect(restored.snapshot().starredQuestions).toEqual([9]);
    expect(f.post.mock.calls.some(([body]) => "starredQuestions" in body)).toBe(false);
    f.setAttempt({ state: "ACTIVE", revision: 20 }); await restored.refresh();
    await restored.submit();
    expect(restored.snapshot().starredQuestions).toEqual([]);
  });
  it("re-activates safely when the native lifecycle effect remounts", async () => {
    const f = fixture();
    f.control.stop(); f.control.activate(); f.control.visibility(true);
    await f.control.refresh(); await f.control.start();
    expect(f.control.snapshot().started).toBe(true);
  });
  it("pauses immediately on focus loss, even when a save is in flight", async () => {
    const f = await started();
    let finish!: () => void;
    const delay = new Promise<void>(resolve => { finish = resolve; });
    f.post.mockImplementation(async body => { if (body.action === "save") await delay; return f.server(body); });
    f.control.choose(0, "A");
    await vi.waitFor(() => expect(saves(f)).toHaveLength(1));
    f.control.visibility(false, true);
    expect(f.control.snapshot().paused).toBe(true);
    f.control.choose(1, "B");
    expect(f.control.snapshot().answers[1]).toBe("");
    finish(); await f.control.refresh();
    f.control.visibility(true); await f.control.refresh();
    expect(f.control.snapshot().paused).toBe(true);
    expect(f.control.snapshot().attempt?.state).toBe("PAUSED");
    expect(f.post.mock.calls.some(([body]) => body.action === "events" && body.visible === false)).toBe(true);
    f.setAttempt({ state: "ACTIVE", revision: 10 });
    await f.control.refresh();
    expect(f.control.snapshot().paused).toBe(false);
  });
  it("saves the newest choice when a student changes an answer during a slow acknowledgment", async () => {
    const f = await started();
    let finish!: () => void;
    const delay = new Promise<void>(resolve => { finish = resolve; });
    let first = true;
    f.post.mockImplementation(async body => {
      if (body.action === "save" && first) { first = false; await delay; }
      return f.server(body);
    });
    f.control.choose(0, "A");
    await vi.waitFor(() => expect(saves(f)).toHaveLength(1));
    f.control.choose(0, "B");
    finish(); await f.control.refresh();
    expect(saves(f).map(([body]) => body.answer)).toEqual(["A", "B"]);
    expect(f.control.snapshot().answers[0]).toBe("B");
    expect(f.control.snapshot().pendingCount).toBe(0);
  });
  it("reports hiding while the initial Start request is still pending", async () => {
    const f = fixture(); await f.control.refresh();
    let finish!: () => void;
    const delay = new Promise<void>(resolve => { finish = resolve; });
    f.post.mockImplementation(async body => { if (body.action === "start") await delay; return f.server(body); });
    const opening = f.control.start();
    await vi.waitFor(() => expect(f.post).toHaveBeenCalled());
    f.control.visibility(false); finish(); await opening;
    expect(f.control.snapshot().paused).toBe(true);
    expect(f.control.snapshot().attempt?.state).toBe("PAUSED");
    expect(f.post.mock.calls.some(([body]) => body.action === "events" && body.visible === false)).toBe(true);
  });
  it("reports a brief interruption even if the student returns before Start finishes", async () => {
    const f = fixture(); await f.control.refresh();
    let finish!: () => void;
    const delay = new Promise<void>(resolve => { finish = resolve; });
    f.post.mockImplementation(async body => { if (body.action === "start") await delay; return f.server(body); });
    const opening = f.control.start();
    await vi.waitFor(() => expect(f.post).toHaveBeenCalled());
    f.control.visibility(false, true); f.control.visibility(true);
    finish(); await opening;
    expect(f.control.snapshot().paused).toBe(true);
    expect(f.control.snapshot().attempt?.state).toBe("PAUSED");
  });
  it("requires clearance when resuming even if the old session left no queued reports", async () => {
    const f = await started();
    const restored = f.create(); await restored.refresh(); await restored.start();
    expect(restored.snapshot().paused).toBe(true);
    expect(restored.snapshot().attempt?.state).toBe("PAUSED");
    restored.choose(0, "A"); expect(saves(f)).toHaveLength(0);
  });
  it("preserves the session token before an ambiguous Start response", async () => {
    const f = fixture(); await f.control.refresh();
    f.post.mockImplementationOnce(async body => { await f.server(body); throw new Error("Response lost"); });
    await f.control.start();
    const token = f.post.mock.calls[0][0].sessionToken;
    expect(JSON.parse(f.draft!).token).toBe(token);
    const restored = f.create(); await restored.refresh(); await restored.start();
    expect(f.post.mock.calls.filter(([body]) => body.action === "start").at(-1)?.[0].sessionToken).toBe(token);
    expect(restored.snapshot().paused).toBe(true);
  });
  it("retains offline choices and requires unlock before retrying them", async () => {
    const f = await started();
    f.post.mockRejectedValueOnce(new Error("Connection lost"));
    f.control.choose(2, "B");
    await vi.waitFor(() => expect(f.control.snapshot().offline).toBe(true));
    expect(f.control.snapshot().pendingCount).toBe(1);
    await f.control.refresh();
    expect(f.control.snapshot().offline).toBe(false);
    expect(f.control.snapshot().paused).toBe(true);
    expect(saves(f)).toHaveLength(1);
    f.setAttempt({ state: "ACTIVE", revision: 20 });
    await f.control.refresh(); await f.control.refresh();
    expect(f.control.snapshot().pendingCount).toBe(0);
    expect(f.control.snapshot().answers[2]).toBe("B");
  });
  it("reconciles a revision conflict without losing a pending choice", async () => {
    const f = await started();
    f.setAttempt({ revision: 20 });
    f.control.choose(3, "D");
    await vi.waitFor(() => expect(f.control.snapshot().message).toBe("Revision changed"));
    await f.control.refresh();
    expect(f.control.snapshot().answers[3]).toBe("D");
    expect(f.control.snapshot().pendingCount).toBe(0);
    expect(saves(f).at(-1)?.[0].revision).toBe(20);
  });
  it("keeps a blocked save pending and does not automatically unlock", async () => {
    const f = await started();
    f.setAttempt({ state: "PAUSED", revision: 2 });
    f.control.choose(0, "A"); await f.control.refresh();
    expect(f.control.snapshot().pendingCount).toBe(1);
    expect(f.control.snapshot().paused).toBe(true);
    f.control.choose(1, "B");
    expect(f.control.snapshot().answers[1]).toBe("");
  });
  it("reports navigation away and does not keep sending answers from a hidden screen", async () => {
    const f = await started();
    f.control.stop();
    await vi.waitFor(() => expect(f.post.mock.calls.some(([body]) => body.action === "events")).toBe(true));
    f.control.choose(0, "A");
    expect(saves(f)).toHaveLength(0);
    expect(f.control.snapshot().visible).toBe(false);
  });
  it("restores pending answers and event IDs after remount without bypassing clearance", async () => {
    const f = await started();
    f.post.mockRejectedValueOnce(new Error("Offline"));
    f.control.choose(6, "C");
    await vi.waitFor(() => expect(f.draft).toContain('"6":"C"'));
    const restored = f.create();
    await restored.refresh(); await restored.start();
    expect(restored.snapshot().answers[6]).toBe("C");
    expect(restored.snapshot().paused).toBe(true);
    expect(restored.snapshot().pendingCount).toBe(1);
  });
  it("drops an old version's pending answers when a retake is approved", async () => {
    const f = fixture();
    f.setDraft(JSON.stringify({ token: "00000000-0000-4000-8000-000000000099", attemptNumber: 1, answers: { "5": "D" }, events: [], starredQuestions: [5] }));
    f.setAttempt({ attemptNumber: 2, retakeReady: true, state: "PAUSED", revision: 10 });
    await f.control.refresh(); await f.control.start();
    expect(f.control.snapshot().started).toBe(true);
    expect(f.control.snapshot().attempt?.attemptNumber).toBe(2);
    expect(f.control.snapshot().answers[5]).toBe("");
    expect(f.control.snapshot().pendingCount).toBe(0);
    expect(f.control.snapshot().starredQuestions).toEqual([]);
    expect(saves(f)).toHaveLength(0);
  });
  it("does not erase the current retake's persisted draft when loading the initial view", async () => {
    const f = fixture();
    f.setDraft(JSON.stringify({ token: "00000000-0000-4000-8000-000000000099", attemptNumber: 2, answers: { "5": "D" }, events: [] }));
    f.setAttempt({ attemptNumber: 2, revision: 10 });
    await f.control.refresh(); await f.control.start();
    expect(f.control.snapshot().answers[5]).toBe("D");
    expect(f.control.snapshot().pendingCount).toBe(1);
    expect(f.control.snapshot().paused).toBe(true);
  });
  it("requires a new Start retake after a submitted attempt is replaced", async () => {
    const f = await started(); await f.control.submit();
    f.setAttempt({ attemptNumber: 2, retakeReady: true, state: "PAUSED", revision: 30 });
    await f.control.refresh();
    expect(f.control.snapshot().started).toBe(false);
    expect(f.control.snapshot().attempt?.retakeReady).toBe(true);
    await f.control.start();
    expect(f.control.snapshot().started).toBe(true);
    expect(f.control.snapshot().attempt?.retakeReady).toBe(false);
  });
  it("shows a proctor-finalized submission when closure hides the student's GET", async () => {
    const f = await started(); f.close();
    await f.control.refresh();
    expect(f.control.snapshot().attempt?.state).toBe("SUBMITTED");
    expect(f.control.snapshot().examState).toBe("CLOSED");
    expect(f.control.snapshot().error).toBeUndefined();
    f.control.choose(0, "A"); expect(saves(f)).toHaveLength(0);
  });
  it("observes closure even when offline answers and activity reports are still queued", async () => {
    const f = await started();
    f.post.mockRejectedValueOnce(new Error("Offline")); f.control.choose(1, "B");
    await vi.waitFor(() => expect(f.control.snapshot().offline).toBe(true));
    f.close(); await f.control.refresh();
    expect(f.control.snapshot().attempt?.state).toBe("SUBMITTED");
    expect(f.control.snapshot().examState).toBe("CLOSED");
    expect(f.control.snapshot().answers[1]).toBe("");
    expect(f.control.snapshot().pendingCount).toBe(0);
    expect(f.control.snapshot().pendingEvents).toBe(0);
  });
  it("recovers a submission whose response was lost without replaying offline activity forever", async () => {
    const f = await started();
    f.post.mockImplementationOnce(async body => { await f.server(body); throw new Error("Response lost"); });
    await f.control.submit();
    expect(f.control.snapshot().offline).toBe(true);
    await f.control.refresh();
    expect(f.control.snapshot().attempt?.state).toBe("SUBMITTED");
    expect(f.control.snapshot().pendingEvents).toBe(0);
    await vi.waitFor(() => expect(f.draft).toBeNull());
  });
  it("learns about a retake even when the old session has queued activity", async () => {
    const f = await started();
    f.post.mockRejectedValueOnce(new Error("Offline")); f.control.choose(1, "B");
    await vi.waitFor(() => expect(f.control.snapshot().offline).toBe(true));
    f.setAttempt({ attemptNumber: 2, retakeReady: true, state: "PAUSED", revision: 20 });
    await f.control.refresh();
    expect(f.control.snapshot().started).toBe(false);
    expect(f.control.snapshot().attempt?.retakeReady).toBe(true);
    expect(f.control.snapshot().pendingCount).toBe(0);
    expect(f.control.snapshot().pendingEvents).toBe(0);
    await f.control.start();
    expect(f.control.snapshot().started).toBe(true);
    expect(f.control.snapshot().attempt?.retakeReady).toBe(false);
    expect(f.control.snapshot().paused).toBe(false);
  });
  it("stops accepting local choices when another session takes ownership", async () => {
    const f = await started();
    f.post.mockRejectedValue(new ApiError("Another answering session owns this attempt.", 409));
    await f.control.refresh();
    expect(f.control.snapshot().started).toBe(false);
    expect(f.control.snapshot().paused).toBe(true);
    f.control.choose(0, "A"); expect(saves(f)).toHaveLength(0);
  });
  it("verifies ownership after a failed save even before the next heartbeat is due", async () => {
    const f = await started(); await f.control.refresh();
    f.post.mockRejectedValue(new ApiError("Another answering session owns this attempt.", 409));
    f.control.choose(0, "A");
    await vi.waitFor(() => expect(f.control.snapshot().paused).toBe(true));
    await f.control.refresh();
    expect(f.control.snapshot().started).toBe(false);
    expect(f.control.snapshot().paused).toBe(true);
    f.control.choose(1, "B"); expect(f.control.snapshot().answers[1]).toBe("");
  });
  it("keeps answering blocked until ownership verification finishes", async () => {
    const f = await started(); await f.control.refresh();
    let finish!: () => void;
    const delay = new Promise<void>(resolve => { finish = resolve; });
    f.setAttempt({ revision: 20 });
    f.post.mockImplementation(async body => { if (body.action === "heartbeat") await delay; return f.server(body); });
    f.control.choose(0, "A");
    await vi.waitFor(() => expect(f.control.snapshot().paused).toBe(true));
    const refresh = f.control.refresh();
    await vi.waitFor(() => expect(f.post.mock.calls.filter(([body]) => body.action === "heartbeat")).toHaveLength(2));
    expect(f.control.snapshot().paused).toBe(true);
    f.control.choose(1, "B"); expect(f.control.snapshot().answers[1]).toBe("");
    finish(); await refresh;
    expect(f.control.snapshot().paused).toBe(false);
    expect(f.control.snapshot().pendingCount).toBe(0);
  });
  it("pauses on server errors and requires clearance after recovery", async () => {
    const f = await started();
    f.post.mockRejectedValueOnce(new ApiError("Service unavailable", 503));
    f.control.choose(0, "A");
    await vi.waitFor(() => expect(f.control.snapshot().offline).toBe(true));
    await f.control.refresh();
    expect(f.control.snapshot().paused).toBe(true);
    expect(f.control.snapshot().pendingCount).toBe(1);
  });
  it("waits for answers, submits once, clears encrypted drafts, and locks final answers", async () => {
    const f = await started();
    f.control.choose(0, "A"); await f.control.submit();
    expect(f.control.snapshot().attempt?.state).toBe("SUBMITTED");
    expect(f.control.snapshot().answers[0]).toBe("A");
    await vi.waitFor(() => expect(f.draft).toBeNull());
    f.control.choose(0, "B"); await f.control.submit();
    expect(f.control.snapshot().answers[0]).toBe("A");
    expect(f.post.mock.calls.filter(([body]) => body.action === "submit")).toHaveLength(1);
  });
  it("does not send answers before start, after access revocation, or outside configured choices", async () => {
    const f = fixture(); await f.control.refresh();
    f.control.choose(0, "A"); expect(saves(f)).toHaveLength(0);
    await f.control.start();
    for (const [question, answer] of [[0, "H"], [-1, "A"], [50, "A"], [0, "invalid"]] as const) f.control.choose(question, answer);
    await f.control.refresh(); expect(saves(f)).toHaveLength(0);
    f.getView.mockRejectedValueOnce(new ApiError("Forbidden", 403));
    await f.control.refresh();
    expect(f.control.snapshot().view).toBeUndefined();
    f.control.choose(0, "A"); expect(saves(f)).toHaveLength(0);
  });
});

describe("native monitoring controls and discovery", () => {
  it("never exposes Prep monitoring to Sunday School-only servants, mentors, or parents", () => {
    for (const role of ["SERVANT", "MENTOR", "PARENT", undefined]) expect(liveExamAudience(role)).toBeNull();
    expect(liveExamAudience("PRIEST")).toBe("staff");
    expect(liveExamAudience("SERVANT_PREP")).toBe("staff");
    expect(liveExamAudience("STUDENT")).toBe("student");
  });
  it("requires server management permission and a visible, connected paused attempt to unlock", () => {
    const f = fixture(); const view = f.view(); view.canManage = true;
    const row = { student: { id: "student", name: "Student" }, eligible: true,
      attempt: { ...view.attempt!, state: "PAUSED" as const, stale: false, pageVisible: true, answeredCount: 4, events: [] } };
    expect(canUnlockStudent(view, row)).toBe(true);
    for (const override of [{ stale: true }, { pageVisible: false }, { retakeReady: true }, { state: "SUBMITTED" as const }])
      expect(canUnlockStudent(view, { ...row, attempt: { ...row.attempt, ...override } })).toBe(false);
    expect(canUnlockStudent({ ...view, canManage: false }, row)).toBe(false);
    expect(canUnlockStudent({ ...view, sheet: { ...view.sheet!, state: "CLOSED" } }, row)).toBe(false);
  });
  it("requires all 50 valid keys with A–B through A–H choices", () => {
    expect(completeAnswerKey(Array<number>(50).fill(8), Array<string>(50).fill("H"))).toBe(true);
    expect(completeAnswerKey(Array<number>(50).fill(2), Array<string>(50).fill("B"))).toBe(true);
    expect(completeAnswerKey(Array<number>(50).fill(2), Array<string>(50).fill("C"))).toBe(false);
    expect(completeAnswerKey(Array<number>(50).fill(4), Array<string>(50).fill(""))).toBe(false);
  });
  it("sorts open dashboards first and distinguishes released results from closed exams", () => {
    const exam = fixture().view().exam;
    const exams: DigitalExamList["exams"] = [
      { ...exam, id: "released", digitalSheet: { state: "CLOSED", releasedAt: "2026-10-14", attempts: [] } },
      { ...exam, id: "new", digitalSheet: null },
      { ...exam, id: "open", digitalSheet: { state: "OPEN", releasedAt: null, attempts: [] } },
    ];
    expect(filterLiveExams(exams, "Bible").map(row => row.id)).toEqual(["open", "new", "released"]);
    expect(monitoringState(exams[0])).toBe("RELEASED");
    expect(filterLiveExams(exams, "2026", "OPEN")).toHaveLength(1);
    expect(examCalendarDate("2026-10-14T00:00:00Z")).toBe("Oct 14, 2026");
  });
});


// The server requires a church-location fix on start, save and submit (lib/digital-exam-service.ts), never on heartbeats or reports.
describe("native live exam church-location requirement", () => {
  const AT_CHURCH: ExamPosition = { latitude: 40.71602, longitude: -74.0867, accuracy: 8, timestamp: 100000 };
  const OUTSIDE: ExamPosition = { ...AT_CHURCH, latitude: 40.73 };
  /** A server that checks the position the way lib/exam-geofence.ts does, in front of the usual fixture server. */
  function withGeofence(f: ReturnType<typeof fixture>) {
    f.post.mockImplementation(async body => {
      if (["start", "save", "submit"].includes(String(body.action))) {
        const position = body.position as ExamPosition | undefined;
        if (!position) throw new ApiError("Enable precise location and try again. A location captured within two minutes and accurate to within 100 meters is required.", 400);
        if (Math.abs(position.latitude - AT_CHURCH.latitude) > 0.002) throw new ApiError("Online exams must be taken within 150 meters of 427 Westside Ave, Jersey City, NJ. Your saved answers are preserved.", 403);
      } else if (body.position !== undefined) throw new Error("heartbeats and reports must not carry a position");
      return f.server(body);
    });
  }
  async function startedAtChurch(locate = vi.fn(async (_mode: string) => AT_CHURCH)) {
    const f = fixture();
    const control = f.create({ locate });
    withGeofence(f);
    await control.refresh(); await control.start();
    return { f, control, locate };
  }
  const sent = (f: ReturnType<typeof fixture>, action: string) => f.post.mock.calls.filter(([body]) => body.action === action).map(([body]) => body);

  it("sends a fresh position with Start and Submit, a reusable one with saves, and none with heartbeats or reports", async () => {
    const { f, control, locate } = await startedAtChurch();
    expect(control.snapshot().started).toBe(true);
    expect(sent(f, "start")[0].position).toEqual(AT_CHURCH);
    expect(locate).toHaveBeenLastCalledWith("fresh");
    control.choose(2, "B");
    await vi.waitFor(() => expect(sent(f, "save")).toHaveLength(1));
    expect(sent(f, "save")[0].position).toEqual(AT_CHURCH);
    expect(locate).toHaveBeenLastCalledWith("reuse");
    await control.refresh();
    await control.submit();
    expect(sent(f, "submit")[0].position).toEqual(AT_CHURCH);
    expect(locate).toHaveBeenLastCalledWith("fresh");
    for (const body of f.post.mock.calls.map(([b]) => b).filter(b => ["heartbeat", "events"].includes(String(b.action)))) expect(body.position).toBeUndefined();
    expect(control.snapshot().attempt?.state).toBe("SUBMITTED");
  });

  it("never writes a position into the encrypted draft", async () => {
    const { f, control } = await startedAtChurch();
    control.choose(0, "A");
    await vi.waitFor(() => expect(sent(f, "save")).toHaveLength(1));
    expect(f.draft ?? "").not.toMatch(/latitude|longitude|accuracy/);
  });

  it("keeps a choice pending, and stays connected, while the device cannot give a position", async () => {
    let available = true;
    const locate = vi.fn(async (_mode: string) => { if (!available) throw new LocationUnavailable("Allow location access to take this exam. It is only checked, never stored."); return AT_CHURCH; });
    const { f, control } = await startedAtChurch(locate);
    available = false;
    control.choose(5, "D");
    await vi.waitFor(() => expect(control.snapshot().location).not.toBeNull());
    const state = control.snapshot();
    expect(state.location).toEqual({ message: expect.stringMatching(/Allow location access/), settings: false });
    expect(state.pendingCount).toBe(1); // the choice is still on the device
    expect(state.offline).toBe(false); // not a lost connection
    expect(state.paused).toBe(false); // and not a pause
    expect(state.attempt).not.toBeNull(); // and not a revoked session
    expect(sent(f, "events").flatMap(b => b.events as { kind: string }[]).filter(e => e.kind === "OFFLINE")).toHaveLength(0);
    expect(sent(f, "save")).toHaveLength(0);
    // Once the position works, the next tap saves it and clears the notice.
    available = true;
    control.choose(5, "D");
    await vi.waitFor(() => expect(sent(f, "save")).toHaveLength(1));
    await vi.waitFor(() => expect(control.snapshot().location).toBeNull());
    expect(control.snapshot().pendingCount).toBe(0);
  });

  it("does not retry the sensor on every refresh after a location problem, but a tap retries at once", async () => {
    const locate = vi.fn(async (_mode: string): Promise<ExamPosition> => { throw new LocationUnavailable("Could not get your location."); });
    const { control } = await startedAtChurch(vi.fn(async () => AT_CHURCH));
    // Rebuild with a failing locator after Start.
    const f = fixture();
    const c = f.create({ locate: vi.fn(async () => AT_CHURCH) });
    withGeofence(f);
    await c.refresh(); await c.start();
    expect(control.snapshot().started).toBe(true);
    const failing = f.create({ locate });
    withGeofence(f);
    await failing.refresh(); await failing.start();
    expect(failing.snapshot().started).toBe(false);
    expect(locate).toHaveBeenCalledTimes(1);
    await failing.refresh(); await failing.refresh();
    expect(locate).toHaveBeenCalledTimes(1); // nothing to flush, and no new attempt
  });

  it("does not let the server's 'outside the boundary' 403 look like lost access", async () => {
    let position = AT_CHURCH;
    const { f, control } = await startedAtChurch(vi.fn(async () => position));
    position = OUTSIDE;
    control.choose(7, "C");
    await vi.waitFor(() => expect(control.snapshot().location).not.toBeNull());
    const state = control.snapshot();
    expect(state.location?.message).toMatch(/within 150 meters of 427 Westside Ave/);
    expect(state.view).toBeDefined(); // a real 403 clears the view; this must not
    expect(state.attempt).not.toBeNull();
    expect(state.pendingCount).toBe(1);
    expect(state.started).toBe(true);
    // Back at church, the same pending choice saves without being re-entered.
    position = AT_CHURCH;
    control.choose(8, "A");
    await vi.waitFor(() => expect(state.pendingCount === 1 && control.snapshot().pendingCount).toBe(0));
    expect(control.snapshot().answers[7]).toBe("C");
    expect(control.snapshot().answers[8]).toBe("A");
    expect(f.draft ?? "").not.toContain('"7"');
  });

  it("a real 403 (access revoked) still ends the session", async () => {
    const { f, control } = await startedAtChurch();
    f.post.mockImplementation(async () => { throw new ApiError("Forbidden", 403); });
    control.choose(1, "B");
    await vi.waitFor(() => expect(control.snapshot().view).toBeUndefined());
    expect(control.snapshot().location).toBeNull();
  });

  it("Start without a position stays on the notice, with Settings offered when only Settings can fix it", async () => {
    const f = fixture();
    const control = f.create({ locate: vi.fn(async () => { throw new LocationUnavailable("Location access is off for this app. Turn it on in Settings to take this exam.", true); }) });
    withGeofence(f);
    await control.refresh(); await control.start();
    const state = control.snapshot();
    expect(state.started).toBe(false);
    expect(state.location).toEqual({ message: expect.stringMatching(/Settings/), settings: true });
    expect(sent(f, "start")).toHaveLength(0); // nothing was sent without a position
    expect(f.draft).not.toBeNull(); // the session token was still preserved first
  });

  it("without the church check configured the controller sends no position (older servers)", async () => {
    const f = fixture();
    await f.control.refresh(); await f.control.start();
    expect(sent(f, "start")[0].position).toBeUndefined();
  });
});
