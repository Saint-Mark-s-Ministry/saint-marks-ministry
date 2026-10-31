import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AttendanceEditor,
  summarize,
  type AttendanceRequest,
  type DraftStore,
} from "../../apps/mobile/src/data/attendance-editor";
import {
  attendanceDraftStorageKey,
  attendanceFailure,
  mergeAttendanceDraft,
  parseDraft,
  saveStateOf,
  savedByLabel,
  serializeDraft,
} from "../../apps/mobile/src/data/attendance-draft";

type Body = { sessionId?: string; expectedUserId?: string; records: { childId: string; status: string; notes: string | null }[] };
type Child = { id: string; firstName: string; lastName: string; status?: string; notes?: string | null };
const KEY = attendanceDraftStorageKey("user1", "class1", "2026-10-11")!;

class ApiFailure extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
const offline = () => new Error("Could not reach the server. Check your connection and try again.");
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => ((resolve = done), (reject = fail)));
  return { promise, resolve, reject };
};

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const log: string[] = [];
  const store: DraftStore & { data: Map<string, string>; log: string[]; fail: boolean } = {
    data,
    log,
    fail: false,
    async get(key) {
      log.push(`get ${key}`);
      return data.get(key) ?? null;
    },
    async set(key, value) {
      log.push(`set ${key}`);
      if (store.fail) throw new Error("disk full");
      data.set(key, value);
    },
    async remove(key) {
      log.push(`remove ${key}`);
      if (store.fail) throw new Error("disk full");
      data.delete(key);
    },
  };
  return store;
}

/** A scripted server: a roster, optional existing session, and a hook to decide what a save answers. */
function server(roster: Child[], options: { session?: boolean; lastSavedBy?: unknown } = { session: true }) {
  const calls: { path: string; method: string; body?: Body; signal?: AbortSignal }[] = [];
  const state = { roster, hasSession: options.session !== false, onBatch: null as null | ((body: Body) => Promise<unknown> | unknown), onLoad: null as null | (() => Promise<void>) };
  const request: AttendanceRequest = async <T,>(path: string, method = "GET", body?: unknown, opts?: { signal?: AbortSignal }) => {
    calls.push({ path, method, body: body as Body, signal: opts?.signal });
    if (path.startsWith("/api/sunday-school/sessions?")) {
      await state.onLoad?.();
      return (state.hasSession ? [{ id: "session1" }] : []) as T;
    }
    if (path.startsWith("/api/sunday-school/sessions/session1/attendance"))
      return {
        session: { id: "session1" },
        lastSavedBy: options.lastSavedBy ?? null,
        roster: state.roster.map((child) => ({
          ...child,
          level: "GRADE_5",
          gender: null,
          profileImageUrl: null,
          attendance: child.status ? { id: `a-${child.id}`, childId: child.id, status: child.status, notes: child.notes ?? null } : null,
        })),
      } as T;
    if (path.startsWith("/api/sunday-school/children?"))
      return state.roster.map((child) => ({ ...child, level: "GRADE_5", gender: null, user: null })) as T;
    if (path === "/api/sunday-school/sessions") return { id: "session1" } as T;
    if (path === "/api/sunday-school/attendance/batch") {
      if (state.onBatch) return (await state.onBatch(body as Body)) as T;
      return { success: true, lastSavedBy: { savedAt: "2026-10-11T15:00:00.000Z", recorder: { id: "user1", name: "Mina Mark" } } } as T;
    }
    throw new Error(`unexpected ${method} ${path}`);
  };
  const batches = () =>
    calls.filter((call) => call.path === "/api/sunday-school/attendance/batch") as (typeof calls[number] & { body: Body })[];
  return { request, calls, batches, state };
}

const ROSTER: Child[] = [
  { id: "a", firstName: "Abe", lastName: "Aziz" },
  { id: "b", firstName: "Beth", lastName: "Bishai" },
  { id: "c", firstName: "Cara", lastName: "Costa" },
];

function open(
  s: ReturnType<typeof server>,
  store: ReturnType<typeof memoryStore>,
  overrides: Partial<ConstructorParameters<typeof AttendanceEditor>[0]> = {},
) {
  const editor = new AttendanceEditor({
    userId: "user1",
    classId: "class1",
    date: "2026-10-11",
    canEdit: true,
    request: s.request,
    store,
    ...overrides,
  });
  editor.start();
  return editor;
}
async function ready(editor: AttendanceEditor) {
  await vi.waitFor(() => expect(editor.getState().phase).not.toBe("loading"));
  await editor.settled();
}
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("draft kept on every tap", () => {
  it("is scoped to account, class and date, and written before any network call", async () => {
    const s = server(ROSTER);
    const store = memoryStore();
    const editor = open(s, store);
    await ready(editor);
    editor.mark("a", "PRESENT");
    await editor.settled();
    expect(store.data.get(KEY)).toBe(serializeDraft({ marks: { a: "PRESENT" }, notes: {} }));
    expect(s.batches()).toHaveLength(0);
    expect(attendanceDraftStorageKey("user2", "class1", "2026-10-11")).not.toBe(KEY);
    expect(attendanceDraftStorageKey("user1", "class2", "2026-10-11")).not.toBe(KEY);
    expect(attendanceDraftStorageKey("user1", "class1", "2026-10-18")).not.toBe(KEY);
    // SecureStore only allows these characters.
    expect(KEY).toMatch(/^[\w.-]+$/);
    editor.dispose();
  });

  it("refuses to build a key from anything but plain identifiers", () => {
    expect(attendanceDraftStorageKey("u:1", "class1", "2026-10-11")).toBeNull();
    expect(attendanceDraftStorageKey("user1", "class1", "10/11/2026")).toBeNull();
    expect(attendanceDraftStorageKey("", "class1", "2026-10-11")).toBeNull();
  });

  it("keeps child IDs and marks only, never names or contacts", async () => {
    const s = server(ROSTER);
    const store = memoryStore();
    const editor = open(s, store);
    await ready(editor);
    editor.mark("a", "LATE");
    await editor.settled();
    const raw = store.data.get(KEY)!;
    expect(raw).not.toMatch(/Abe|Aziz|phone|email/i);
    editor.dispose();
  });
});

describe("autosave", () => {
  it("waits for a pause, sends every pending mark once, with the signed-in account, and never infers absence", async () => {
    const s = server(ROSTER);
    const editor = open(s, memoryStore());
    await ready(editor);
    editor.mark("a", "PRESENT");
    await tick(300);
    editor.mark("b", "LATE");
    await tick(500);
    expect(s.batches()).toHaveLength(0); // the pause restarted with the second tap
    await tick(200);
    expect(s.batches()).toHaveLength(1);
    expect(s.batches()[0].body).toEqual({
      sessionId: "session1",
      expectedUserId: "user1",
      records: [
        { childId: "a", status: "PRESENT", notes: null },
        { childId: "b", status: "LATE", notes: null },
      ],
    });
    expect(editor.getState().marks.c).toBeUndefined(); // "c" was never marked absent
    expect(editor.getState().pending).toEqual({});
    editor.dispose();
  });

  it("creates the session first when the date has none, naming the account", async () => {
    const s = server(ROSTER, { session: false });
    const editor = open(s, memoryStore());
    await ready(editor);
    editor.mark("a", "PRESENT");
    await tick(600);
    const create = s.calls.find((call) => call.path === "/api/sunday-school/sessions" && call.method === "POST")!;
    expect(create.body).toEqual({ classId: "class1", date: "2026-10-11", expectedUserId: "user1" });
    expect(s.batches()[0].body.sessionId).toBe("session1");
    // The next autosave reuses it.
    editor.mark("b", "PRESENT");
    await tick(600);
    expect(s.calls.filter((call) => call.path === "/api/sunday-school/sessions" && call.method === "POST")).toHaveLength(1);
    editor.dispose();
  });

  it("clears only the submitted revision: a tap during the save stays pending and is sent next", async () => {
    const s = server(ROSTER);
    const gate = deferred<unknown>();
    s.state.onBatch = () => gate.promise;
    const store = memoryStore();
    const editor = open(s, store);
    await ready(editor);
    editor.mark("a", "PRESENT");
    await tick(600);
    expect(editor.getState().saving).toBe(true);
    // While the first save is in flight: change A and mark B.
    editor.mark("a", "LATE");
    editor.mark("b", "PRESENT");
    expect(editor.getState().marks).toMatchObject({ a: "LATE", b: "PRESENT" });
    s.state.onBatch = null;
    gate.resolve({ success: true, lastSavedBy: { savedAt: "2026-10-11T15:00:00.000Z", recorder: { id: "user1", name: "Mina Mark" } } });
    await vi.waitFor(() => expect(editor.getState().saving).toBe(false));
    expect(editor.getState().pending).toEqual({ a: "LATE", b: "PRESENT" });
    await editor.settled();
    expect(JSON.parse(store.data.get(KEY)!).marks).toEqual({ a: "LATE", b: "PRESENT" });
    await tick(600);
    expect(s.batches()).toHaveLength(2);
    expect(s.batches()[1].body.records.map((r) => [r.childId, r.status])).toEqual([["a", "LATE"], ["b", "PRESENT"]]);
    expect(editor.getState().pending).toEqual({});
    editor.dispose();
  });

  it("a repeat of the same value during a save is acknowledged, not re-sent", async () => {
    const s = server(ROSTER);
    const gate = deferred<unknown>();
    s.state.onBatch = () => gate.promise;
    const editor = open(s, memoryStore());
    await ready(editor);
    editor.mark("a", "PRESENT");
    await tick(600);
    editor.mark("a", "PRESENT");
    gate.resolve({ success: true });
    await vi.waitFor(() => expect(editor.getState().saving).toBe(false));
    await tick(2000);
    expect(s.batches()).toHaveLength(1);
    editor.dispose();
  });

  it("sends back the note the server already holds, so an autosave never clears it", async () => {
    const s = server([{ ...ROSTER[0], status: "ABSENT", notes: "Sick" }, ROSTER[1], ROSTER[2]]);
    const editor = open(s, memoryStore());
    await ready(editor);
    editor.mark("a", "PRESENT");
    await tick(600);
    expect(s.batches()[0].body.records).toEqual([{ childId: "a", status: "PRESENT", notes: "Sick" }]);
    editor.dispose();
  });

  it("keeps a typed note in the draft and sends it with the mark", async () => {
    const s = server(ROSTER);
    const store = memoryStore();
    const editor = open(s, store);
    await ready(editor);
    editor.mark("a", "LATE");
    editor.setNote("a", "Came after the reading");
    await editor.settled();
    expect(JSON.parse(store.data.get(KEY)!).notes).toEqual({ a: "Came after the reading" });
    await tick(600);
    expect(s.batches()[0].body.records[0]).toEqual({ childId: "a", status: "LATE", notes: "Came after the reading" });
    expect(editor.getState().notes).toEqual({});
    editor.dispose();
  });

  it("a note edited during the save keeps its child pending", async () => {
    const s = server(ROSTER);
    const gate = deferred<unknown>();
    s.state.onBatch = () => gate.promise;
    const editor = open(s, memoryStore());
    await ready(editor);
    editor.mark("a", "LATE");
    editor.setNote("a", "first");
    await tick(600);
    editor.setNote("a", "second");
    s.state.onBatch = null;
    gate.resolve({ success: true });
    await vi.waitFor(() => expect(editor.getState().saving).toBe(false));
    expect(editor.getState().pending).toEqual({ a: "LATE" });
    expect(editor.getState().notes).toEqual({ a: "second" });
    await tick(600);
    expect(s.batches()[1].body.records[0].notes).toBe("second");
    editor.dispose();
  });
});

describe("transient failures", () => {
  it("retries on its own with growing waits while the roster stays open, then recovers", async () => {
    const s = server(ROSTER);
    let attempts = 0;
    s.state.onBatch = () => {
      attempts++;
      if (attempts < 3) throw offline();
      return { success: true };
    };
    const store = memoryStore();
    const editor = open(s, store);
    await ready(editor);
    editor.mark("a", "PRESENT");
    await tick(600);
    expect(editor.getState()).toMatchObject({ saveError: expect.stringContaining("Could not reach"), retryable: true, saving: false });
    expect(editor.getState().pending).toEqual({ a: "PRESENT" });
    expect(editor.getState().marks.a).toBe("PRESENT"); // still visible
    expect(JSON.parse(store.data.get(KEY)!).marks).toEqual({ a: "PRESENT" }); // still on the device
    await tick(4900);
    expect(attempts).toBe(1);
    await tick(200); // 5 s
    expect(attempts).toBe(2);
    await tick(9800);
    expect(attempts).toBe(2);
    await tick(400); // 10 s after the second failure
    expect(attempts).toBe(3);
    expect(editor.getState()).toMatchObject({ saveError: null, pending: {} });
    editor.dispose();
  });

  it("retries a server error, a timeout and a rate limit, but not a refusal", () => {
    expect(attendanceFailure(new ApiFailure("Server error", 503)).retryable).toBe(true);
    expect(attendanceFailure(new ApiFailure("Timeout", 408)).retryable).toBe(true);
    expect(attendanceFailure(new ApiFailure("Slow down", 429)).retryable).toBe(true);
    expect(attendanceFailure(offline()).retryable).toBe(true);
    for (const status of [400, 401, 403, 404, 409, 422]) expect(attendanceFailure(new ApiFailure("no", status)).retryable).toBe(false);
  });

  it("the foreground flush sends right away instead of waiting out the delay", async () => {
    const s = server(ROSTER);
    let attempts = 0;
    s.state.onBatch = () => {
      if (++attempts === 1) throw offline();
      return { success: true };
    };
    const editor = open(s, memoryStore());
    await ready(editor);
    editor.mark("a", "PRESENT");
    await tick(600);
    expect(attempts).toBe(1);
    editor.flushNow(); // the app came back to the foreground
    await vi.waitFor(() => expect(attempts).toBe(2));
    await vi.waitFor(() => expect(editor.getState().pending).toEqual({}));
    editor.dispose();
  });

  it("an interruption during the save loses nothing: the draft is still there and resending is the same request", async () => {
    const s = server(ROSTER);
    s.state.onBatch = () => new Promise(() => undefined); // the app is killed with the request in flight
    const store = memoryStore();
    const first = open(s, store);
    await ready(first);
    first.mark("a", "PRESENT");
    first.mark("b", "ABSENT");
    await tick(600);
    first.dispose();
    expect(JSON.parse(store.data.get(KEY)!).marks).toEqual({ a: "PRESENT", b: "ABSENT" });
    // Next launch: recovered, held for review, resumed by the person.
    const again = server(ROSTER);
    const second = open(again, store);
    await ready(second);
    expect(second.getState().recovered).toBe(true);
    await tick(10000);
    expect(again.batches()).toHaveLength(0);
    await second.resume();
    expect(again.batches()[0].body.records).toEqual([
      { childId: "a", status: "PRESENT", notes: null },
      { childId: "b", status: "ABSENT", notes: null },
    ]);
    second.dispose();
  });
});

describe("refusals wait for a person", () => {
  it.each([
    [403, "Forbidden"],
    [400, "One or more children are not on this class's roster"],
    [409, "Your signed-in account changed. Reload attendance before saving."],
  ])("a %i is not retried, a new tap does not re-arm it, and explicit retry works", async (status, message) => {
    const s = server(ROSTER);
    let refuse = true;
    s.state.onBatch = () => {
      if (refuse) throw new ApiFailure(message, status);
      return { success: true };
    };
    const editor = open(s, memoryStore());
    await ready(editor);
    editor.mark("a", "PRESENT");
    await tick(600);
    expect(editor.getState().retryable).toBe(false);
    expect(editor.getState().saveError).toBeTruthy();
    await tick(120000);
    expect(s.batches()).toHaveLength(1); // not retried, however long we wait
    editor.mark("b", "PRESENT"); // still keeps the tap...
    await tick(120000);
    expect(s.batches()).toHaveLength(1); // ...but does not send it
    expect(editor.getState().pending).toEqual({ a: "PRESENT", b: "PRESENT" });
    refuse = false;
    await editor.retry();
    expect(s.batches()).toHaveLength(2);
    expect(editor.getState()).toMatchObject({ saveError: null, pending: {} });
    editor.dispose();
  });

  it("a 403 reads as a permission problem, not the server's one-word answer", () => {
    expect(attendanceFailure(new ApiFailure("Forbidden", 403)).message).toMatch(/can't save attendance for this class/i);
    expect(attendanceFailure(new ApiFailure("View as is read-only. Stop viewing as this user before making changes.", 403)).message).toMatch(/View as/);
  });

  it("a 200 without success is not a save", async () => {
    const s = server(ROSTER);
    s.state.onBatch = () => ({ ok: true });
    const editor = open(s, memoryStore());
    await ready(editor);
    editor.mark("a", "PRESENT");
    await tick(600);
    expect(editor.getState()).toMatchObject({ retryable: false, pending: { a: "PRESENT" } });
    expect(editor.getState().saveError).toMatch(/did not confirm/i);
    editor.dispose();
  });
});

describe("roster transfer", () => {
  it("a child moved out of the class blocks the save; reloading drops that child, keeps the rest, and the person resumes", async () => {
    const s = server(ROSTER);
    s.state.onBatch = (body) => {
      if (body.records.some((r) => r.childId === "b"))
        throw new ApiFailure("One or more children are not on this class's roster", 400);
      return { success: true };
    };
    const store = memoryStore();
    const editor = open(s, store);
    await ready(editor);
    editor.mark("a", "PRESENT");
    editor.mark("b", "PRESENT");
    await tick(600);
    expect(editor.getState().retryable).toBe(false);
    // The class changed on the server: "b" moved to another class, "d" joined.
    s.state.roster = [ROSTER[0], ROSTER[2], { id: "d", firstName: "Dina", lastName: "Dawood" }];
    editor.reload();
    await vi.waitFor(() => expect(editor.getState().refreshing).toBe(false));
    const after = editor.getState();
    expect(after.removedCount).toBe(1);
    expect(after.marks).toEqual({ a: "PRESENT" });
    expect(after.pending).toEqual({ a: "PRESENT" });
    expect(after.marks.d).toBeUndefined(); // the new child starts unmarked
    expect(after.saveError).toBeNull();
    expect(after.recovered).toBe(true);
    await editor.settled();
    expect(JSON.parse(store.data.get(KEY)!).marks).toEqual({ a: "PRESENT" }); // the removed child is gone from the device too
    await tick(10000);
    expect(s.batches()).toHaveLength(1); // held until resumed
    await editor.resume();
    expect(s.batches()[1].body.records.map((r) => r.childId)).toEqual(["a"]);
    editor.dispose();
  });
});

describe("recovered drafts", () => {
  const stored = (marks: Record<string, string>, notes: Record<string, string> = {}) =>
    memoryStore({ [KEY]: JSON.stringify({ v: 1, marks, notes }) });

  it("are not read, shown or sent until a current roster has loaded", async () => {
    const s = server(ROSTER);
    s.request = (async () => {
      throw offline();
    }) as AttendanceRequest;
    const store = stored({ a: "PRESENT" });
    const editor = open(s, store);
    await vi.waitFor(() => expect(editor.getState().phase).toBe("error"));
    expect(editor.getState().marks).toEqual({});
    expect(store.log.filter((entry) => entry.startsWith("get"))).toHaveLength(0);
    await tick(60000);
    expect(store.data.get(KEY)).toBeTruthy(); // kept for when the roster loads
    editor.dispose();
  });

  it("wait for Resume saving marks, send only what was marked, and never mark the rest absent", async () => {
    const s = server(ROSTER);
    const editor = open(s, stored({ a: "PRESENT", b: "LATE" }));
    await ready(editor);
    expect(editor.getState()).toMatchObject({ recovered: true, pending: { a: "PRESENT", b: "LATE" } });
    expect(editor.getState().marks).toMatchObject({ a: "PRESENT", b: "LATE" });
    await tick(30000);
    expect(s.batches()).toHaveLength(0);
    await editor.resume();
    expect(s.batches()).toHaveLength(1);
    expect(s.batches()[0].body.records.map((r) => r.childId)).toEqual(["a", "b"]);
    expect(editor.getState()).toMatchObject({ recovered: false, pending: {}, marks: { a: "PRESENT", b: "LATE" } });
    expect(editor.getState().marks.c).toBeUndefined();
    editor.dispose();
  });

  it("drop children who left the roster, and leave new children unmarked", async () => {
    const s = server([ROSTER[0], { id: "z", firstName: "New", lastName: "Kid" }]);
    const store = stored({ a: "ABSENT", gone: "PRESENT" });
    const editor = open(s, store);
    await ready(editor);
    expect(editor.getState().removedCount).toBe(1);
    expect(editor.getState().pending).toEqual({ a: "ABSENT" });
    expect(editor.getState().marks.z).toBeUndefined();
    await editor.settled();
    expect(JSON.parse(store.data.get(KEY)!).marks).toEqual({ a: "ABSENT" });
    editor.dispose();
  });

  it("do not resend a mark the server already holds", async () => {
    const s = server([{ ...ROSTER[0], status: "PRESENT" }, ROSTER[1]]);
    const store = stored({ a: "PRESENT" }); // saved just before the app was killed
    const editor = open(s, store);
    await ready(editor);
    expect(editor.getState().pending).toEqual({});
    expect(editor.getState().recovered).toBe(false);
    await editor.settled();
    expect(store.data.has(KEY)).toBe(false);
    editor.dispose();
  });

  it("are not offered under another account, class or date", async () => {
    const s = server(ROSTER);
    const store = stored({ a: "PRESENT" });
    const editor = open(s, store, { userId: "user2" });
    await ready(editor);
    expect(editor.getState().marks).toEqual({});
    expect(editor.getState().recovered).toBe(false);
    editor.dispose();
    const week = open(s, store, { date: "2026-10-18" });
    await ready(week);
    expect(week.getState().marks).toEqual({});
    week.dispose();
  });

  it("an unreadable draft is reported, not trusted, and the next tap replaces it", async () => {
    const s = server(ROSTER);
    const store = memoryStore({ [KEY]: "{not json" });
    const editor = open(s, store);
    await ready(editor);
    expect(editor.getState()).toMatchObject({ storageError: true, recovered: false, marks: {} });
    editor.mark("a", "PRESENT");
    await editor.settled();
    expect(JSON.parse(store.data.get(KEY)!).marks).toEqual({ a: "PRESENT" });
    expect(editor.getState().storageError).toBe(false);
    editor.dispose();
  });
});

describe("explicit save", () => {
  it("records every child still unmarked as absent and sends the whole roster", async () => {
    const s = server(ROSTER);
    const editor = open(s, memoryStore());
    await ready(editor);
    editor.mark("a", "PRESENT");
    expect(summarize(editor.getState(), true)).toMatchObject({ unmarkedCount: 2, canFinalize: true });
    await editor.save(true);
    expect(s.batches()).toHaveLength(1);
    expect(s.batches()[0].body.records).toEqual([
      { childId: "a", status: "PRESENT", notes: null },
      { childId: "b", status: "ABSENT", notes: null },
      { childId: "c", status: "ABSENT", notes: null },
    ]);
    expect(s.batches()[0].body.expectedUserId).toBe("user1");
    expect(editor.getState().marks).toEqual({ a: "PRESENT", b: "ABSENT", c: "ABSENT" });
    expect(editor.getState().pending).toEqual({});
    editor.dispose();
  });

  it("waits out taps while it runs, then quietly re-reads the roster without hiding the marks", async () => {
    const s = server(ROSTER);
    const gate = deferred<unknown>();
    s.state.onBatch = () => gate.promise;
    const editor = open(s, memoryStore());
    await ready(editor);
    const done = editor.save(true);
    expect(editor.getState().finalizing).toBe(true);
    editor.mark("a", "PRESENT"); // ignored: the explicit save is running
    expect(editor.getState().marks.a).toBe("ABSENT");
    s.state.roster = ROSTER.map((child) => ({ ...child, status: "ABSENT" }));
    gate.resolve({ success: true });
    await done;
    await vi.waitFor(() => expect(editor.getState().refreshing).toBe(false));
    expect(editor.getState().marks).toEqual({ a: "ABSENT", b: "ABSENT", c: "ABSENT" });
    editor.dispose();
  });

  it("a failed explicit save keeps the absences it was about to record, for the person to retry", async () => {
    const s = server(ROSTER);
    s.state.onBatch = () => {
      throw new ApiFailure("Forbidden", 403);
    };
    const editor = open(s, memoryStore());
    await ready(editor);
    await editor.save(true);
    expect(editor.getState().pending).toEqual({ a: "ABSENT", b: "ABSENT", c: "ABSENT" });
    expect(editor.getState().saveError).toBeTruthy();
    editor.dispose();
  });

  it("is not offered with nothing to send and every child saved", async () => {
    const s = server(ROSTER.map((child) => ({ ...child, status: "PRESENT" })));
    const editor = open(s, memoryStore());
    await ready(editor);
    expect(summarize(editor.getState(), true)).toMatchObject({ unmarkedCount: 0, pendingCount: 0, canFinalize: false, saveState: "saved" });
    editor.dispose();
  });

  it("Mark rest present marks only children with no mark, then autosaves them", async () => {
    const s = server([{ ...ROSTER[0], status: "ABSENT" }, ROSTER[1], ROSTER[2]]);
    const editor = open(s, memoryStore());
    await ready(editor);
    editor.markRestPresent();
    expect(editor.getState().marks).toEqual({ a: "ABSENT", b: "PRESENT", c: "PRESENT" });
    await tick(600);
    expect(s.batches()[0].body.records.map((r) => r.childId)).toEqual(["b", "c"]);
    editor.dispose();
  });
});

describe("account, class and date changes", () => {
  it("abort the old editor's request, and its late answer changes nothing", async () => {
    const s = server(ROSTER);
    const gate = deferred<unknown>();
    s.state.onBatch = () => gate.promise;
    const store = memoryStore();
    const old = open(s, store);
    await ready(old);
    old.mark("a", "PRESENT");
    await tick(600);
    const signal = s.batches()[0].signal!;
    expect(signal.aborted).toBe(false);
    old.dispose();
    expect(signal.aborted).toBe(true);
    const seen = old.getState();
    gate.resolve({ success: true });
    await tick(100);
    expect(old.getState()).toBe(seen);
    // The mark was never acknowledged here, so it is still on the device for the next time.
    expect(JSON.parse(store.data.get(KEY)!).marks).toEqual({ a: "PRESENT" });
  });

  it("a disposed editor ignores taps and starts no timers", async () => {
    const s = server(ROSTER);
    const editor = open(s, memoryStore());
    await ready(editor);
    editor.mark("a", "PRESENT");
    editor.dispose();
    await tick(10000);
    expect(s.batches()).toHaveLength(0);
    editor.mark("b", "PRESENT");
    expect(editor.getState().pending).toEqual({ a: "PRESENT" });
  });
});

describe("read-only (including View As)", () => {
  it("never reads, writes or sends, and ignores taps", async () => {
    const s = server([{ ...ROSTER[0], status: "PRESENT" }, ROSTER[1]], { session: true, lastSavedBy: { savedAt: "2026-10-11T15:00:00.000Z", recorder: { id: "t", name: "Teacher" } } });
    const store = memoryStore({ [KEY]: JSON.stringify({ v: 1, marks: { b: "PRESENT" }, notes: {} }) });
    const editor = open(s, store, { canEdit: false });
    await ready(editor);
    editor.mark("b", "PRESENT");
    editor.setNote("b", "x");
    editor.markRestPresent();
    await editor.save(true);
    await editor.resume();
    editor.flushNow();
    await tick(60000);
    expect(s.calls.every((call) => call.method === "GET")).toBe(true);
    expect(store.log).toEqual([]);
    expect(editor.getState().marks).toEqual({ a: "PRESENT" }); // the server's marks, not the device's draft
    expect(editor.getState().recovered).toBe(false);
    expect(summarize(editor.getState(), false)).toMatchObject({ saveState: "readonly", canFinalize: false });
    expect(editor.getState().lastSavedBy?.recorder?.name).toBe("Teacher"); // recorder context still shows
    editor.dispose();
  });
});

describe("refresh keeps marks visible", () => {
  it("a failed refresh leaves the roster and marks on screen", async () => {
    const s = server(ROSTER);
    const editor = open(s, memoryStore());
    await ready(editor);
    editor.mark("a", "PRESENT");
    await tick(600);
    s.state.onLoad = async () => {
      throw offline();
    };
    editor.reload();
    await vi.waitFor(() => expect(editor.getState().refreshError).toBeTruthy());
    expect(editor.getState().phase).toBe("ready");
    expect(editor.getState().marks.a).toBe("PRESENT");
    editor.dispose();
  });

  it("a refresh that finds access removed takes the roster off screen", async () => {
    const s = server(ROSTER);
    const editor = open(s, memoryStore());
    await ready(editor);
    s.state.onLoad = async () => {
      throw new ApiFailure("Forbidden", 403);
    };
    editor.reload();
    await vi.waitFor(() => expect(editor.getState().phase).toBe("error"));
    expect(editor.getState().attendance).toBeNull();
    expect(editor.getState().marks).toEqual({});
    editor.dispose();
  });

  it("a tap made while a refresh is reading is folded into its answer, not lost", async () => {
    const s = server(ROSTER);
    const editor = open(s, memoryStore());
    await ready(editor);
    const gate = deferred<void>();
    s.state.onLoad = () => gate.promise;
    editor.reload();
    editor.mark("a", "LATE");
    gate.resolve();
    await vi.waitFor(() => expect(editor.getState().refreshing).toBe(false));
    expect(editor.getState().marks.a).toBe("LATE");
    expect(editor.getState().pending).toEqual({ a: "LATE" });
    editor.dispose();
  });

  it("does not save while a refresh is reading, so old marks cannot come back over a saved one; the reloaded marks wait for Resume", async () => {
    const s = server(ROSTER);
    const editor = open(s, memoryStore());
    await ready(editor);
    const gate = deferred<void>();
    s.state.onLoad = () => gate.promise;
    editor.reload();
    editor.mark("a", "LATE");
    await tick(5000);
    expect(s.batches()).toHaveLength(0);
    s.state.onLoad = null;
    gate.resolve();
    await vi.waitFor(() => expect(editor.getState().refreshing).toBe(false));
    expect(editor.getState().recovered).toBe(true);
    await tick(5000);
    expect(s.batches()).toHaveLength(0);
    await editor.resume();
    expect(s.batches()).toHaveLength(1);
    editor.dispose();
  });

  it("the quiet re-read after an explicit save does not hold a new tap back for Resume", async () => {
    const s = server(ROSTER);
    const editor = open(s, memoryStore());
    await ready(editor);
    const slow = deferred<void>();
    s.state.onLoad = () => slow.promise; // the re-read after the save waits here
    await editor.save(true);
    editor.mark("a", "LATE");
    expect(editor.getState().refreshing).toBe(true);
    slow.resolve();
    await vi.waitFor(() => expect(editor.getState().refreshing).toBe(false));
    expect(editor.getState().recovered).toBe(false);
    await tick(600);
    expect(s.batches().at(-1)!.body.records.find((r) => r.childId === "a")?.status).toBe("LATE");
    editor.dispose();
  });

  it("a retired Excused record shows as unmarked, as on the web", async () => {
    const s = server([{ ...ROSTER[0], status: "EXCUSED" }, ROSTER[1]]);
    const editor = open(s, memoryStore());
    await ready(editor);
    expect(editor.getState().marks).toEqual({});
    editor.dispose();
  });
});

describe("recorder and save-time context", () => {
  it("uses the server's recorder from the roster, then from each acknowledgment", async () => {
    const s = server(ROSTER, { session: true, lastSavedBy: { savedAt: "2026-10-04T12:00:00.000Z", recorder: { id: "t", name: "Teacher One" } } });
    const editor = open(s, memoryStore());
    await ready(editor);
    expect(editor.getState().lastSavedBy).toEqual({ savedAt: "2026-10-04T12:00:00.000Z", recorder: { id: "t", name: "Teacher One" } });
    editor.mark("a", "PRESENT");
    await tick(600);
    expect(editor.getState().lastSavedBy).toEqual({ savedAt: "2026-10-11T15:00:00.000Z", recorder: { id: "user1", name: "Mina Mark" } });
    editor.dispose();
  });

  it("says nothing has been saved when the server has no record", async () => {
    const s = server(ROSTER, { session: false });
    const editor = open(s, memoryStore());
    await ready(editor);
    expect(savedByLabel(editor.getState().lastSavedBy)).toBe("Attendance not saved yet.");
    editor.dispose();
  });

  it("formats the recorder and time, and copes with a missing name or a bad time", () => {
    expect(savedByLabel({ savedAt: "2026-10-11T19:14:00.000Z", recorder: { id: "u", name: "Mina Mark" } })).toMatch(/^Last saved by Mina Mark · Oct 11, 2026, /);
    expect(savedByLabel({ savedAt: "2026-10-11T19:14:00.000Z", recorder: null })).toMatch(/an unknown recorder/);
    expect(savedByLabel({ savedAt: "nope", recorder: { id: "u", name: null } })).toMatch(/an unknown recorder · an unknown time/);
    expect(savedByLabel(undefined)).toBeNull();
  });
});

describe("save states", () => {
  const base = { canEdit: true, saving: false, failed: false, recovered: false, pendingCount: 0, hasSavedMarks: false };
  it("keeps local-only, saving, church-saved and failed apart", () => {
    expect(saveStateOf({ ...base, pendingCount: 2 })).toBe("local");
    expect(saveStateOf({ ...base, pendingCount: 2, saving: true })).toBe("saving");
    expect(saveStateOf({ ...base, hasSavedMarks: true })).toBe("saved");
    expect(saveStateOf({ ...base, pendingCount: 2, failed: true })).toBe("failed");
    expect(saveStateOf({ ...base, pendingCount: 2, recovered: true })).toBe("recovered");
    expect(saveStateOf(base)).toBe("idle");
    expect(saveStateOf({ ...base, canEdit: false, pendingCount: 2 })).toBe("readonly");
  });

  it("walks through them as a person works", async () => {
    const s = server(ROSTER);
    const gate = deferred<unknown>();
    s.state.onBatch = () => gate.promise;
    const editor = open(s, memoryStore());
    await ready(editor);
    const state = () => summarize(editor.getState(), true).saveState;
    expect(state()).toBe("idle");
    editor.mark("a", "PRESENT");
    expect(state()).toBe("local");
    await tick(600);
    expect(state()).toBe("saving");
    gate.reject(offline());
    await vi.waitFor(() => expect(state()).toBe("failed"));
    s.state.onBatch = null;
    await tick(5000);
    expect(state()).toBe("saved");
    editor.dispose();
  });
});

describe("storage trouble", () => {
  it("is reported while marks cannot be kept, and cleared once a write works", async () => {
    const s = server(ROSTER);
    const store = memoryStore();
    store.fail = true;
    const editor = open(s, store);
    await ready(editor);
    editor.mark("a", "PRESENT");
    await editor.settled();
    expect(editor.getState().storageError).toBe(true);
    store.fail = false;
    editor.mark("b", "PRESENT");
    await editor.settled();
    expect(editor.getState().storageError).toBe(false);
    editor.dispose();
  });

  it("writes one at a time and ends with the newest state", async () => {
    const s = server(ROSTER);
    const store = memoryStore();
    const editor = open(s, store);
    await ready(editor);
    editor.mark("a", "PRESENT");
    editor.mark("b", "LATE");
    editor.mark("c", "ABSENT");
    await editor.settled();
    expect(JSON.parse(store.data.get(KEY)!).marks).toEqual({ a: "PRESENT", b: "LATE", c: "ABSENT" });
    editor.dispose();
  });
});

describe("draft format", () => {
  it("round-trips and rejects anything unexpected", () => {
    const draft = { marks: { a: "PRESENT", b: "ABSENT" } as const, notes: { a: "hi" } };
    expect(parseDraft(serializeDraft({ marks: { ...draft.marks }, notes: draft.notes }))).toEqual(draft);
    expect(parseDraft(null)).toEqual({ marks: {}, notes: {} });
    for (const bad of [
      "[]",
      "{}",
      '{"v":2,"marks":{}}',
      '{"v":1,"marks":{"a":"EXCUSED"}}',
      '{"v":1,"marks":{"a b":"PRESENT"}}',
      '{"v":1,"marks":[]}',
      '{"v":1,"marks":{},"notes":{"a":5}}',
    ])
      expect(() => parseDraft(bad)).toThrow();
  });

  it("keeps a prototype-looking ID as a plain key", () => {
    const parsed = parseDraft('{"v":1,"marks":{"__proto__":"PRESENT"}}');
    expect(Object.keys(parsed.marks)).toEqual(["__proto__"]);
    expect(({} as Record<string, unknown>).PRESENT).toBeUndefined();
  });

  it("merges a draft over a roster", () => {
    const merged = mergeAttendanceDraft({ a: "PRESENT" }, { marks: { a: "LATE", x: "PRESENT" }, notes: { y: "n" } }, ["a", "b"]);
    expect(merged.marks).toEqual({ a: "LATE" });
    expect(merged.pending).toEqual({ a: "LATE" });
    expect(merged.removedCount).toBe(2);
  });
});
