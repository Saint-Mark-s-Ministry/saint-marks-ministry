import { describe, expect, it, vi } from "vitest";
import type { AttemptResponse, DigitalExamList, DigitalExamView, ExamAttemptView } from "@stmark/contracts";
import { ExamAttemptController } from "../../apps/mobile/src/data/exam-attempt";
import { ApiError } from "../../apps/mobile/src/data/api-client";
import { canUnlockStudent, completeAnswerKey, examCalendarDate, filterLiveExams, liveExamAudience, monitoringState } from "../../apps/mobile/src/data/live-exams";

function fixture() {
  let attempt: ExamAttemptView = { id: "attempt", state: "ACTIVE", answers: Array<string>(50).fill(""), revision: 1,
    startedAt: "2026-10-14T12:00:00Z", lastSeenAt: "2026-10-14T12:00:00Z", pausedAt: null, submittedAt: null, attemptNumber: 1 };
  let examState = "OPEN";
  let draft: string | null = null;
  let serial = 1;
  const view = (): DigitalExamView => ({
    exam: { id: "exam", examDate: "2026-10-14T00:00:00Z", yearLevel: "YEAR_1", totalPoints: 100, examSection: { displayName: "Bible" }, academicYear: { name: "2026-27" } },
    sheet: { state: examState as "OPEN", choiceCounts: Array<number>(50).fill(4), openedAt: "2026-10-14T00:00:00Z", closedAt: null, releasedAt: null },
    attempt: structuredClone(attempt),
  });
  const getView = vi.fn(async () => {
    if (examState !== "OPEN") throw new ApiError("Not found", 404);
    return view();
  });
  const server = async (body: Record<string, unknown>): Promise<AttemptResponse> => {
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
  const create = () => new ExamAttemptController({ getView, post, now: () => 100000,
    uuid: () => `00000000-0000-4000-8000-${String(serial++).padStart(12, "0")}`,
    store: { load: async () => draft, save } });
  const control = create();
  return { control, create, post, getView, save, server, view, get draft() { return draft; },
    setDraft: (value: string) => { draft = value; },
    setAttempt: (value: Partial<ExamAttemptView>) => { attempt = { ...attempt, ...value }; },
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
