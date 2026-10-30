// The Sunday School attendance editor's engine (SMM-111), the native counterpart of the web's
// hooks/useSundaySchoolAttendance.ts. Plain TypeScript with injected request and storage, so every
// rule (draft, debounce, acknowledgment, retry, recovery) is testable without React or a device.
//
//  - Every tap is kept at once in a draft scoped to account + class + date, then sent after a short pause.
//  - Acknowledgment clears only what was submitted; a tap made while a save was in flight stays pending.
//  - Automatic saves send only marks a person made. Only the explicit save marks the rest absent.
//  - Transient failures retry on their own while this roster is open. A permission, validation or roster
//    failure waits for a person (retry, or reload the roster).
//  - A draft found on the device is only offered back after a fresh authorized roster load, and only
//    sent once the person chooses to resume.
//  - A different account, class or date is a different editor; the old one aborts its work.
//  - Read-only (including View As) never reads, writes or sends anything.

import type {
  AttendanceSaveInfo,
  SundaySchoolAttendanceBatchResponse,
  SundaySchoolChild,
  SundaySchoolSession,
  SundaySchoolSessionAttendance,
} from "@stmark/contracts";
import {
  afterAcknowledgment,
  attendanceDraftStorageKey,
  attendanceFailure,
  emptyDraft,
  mergeAttendanceDraft,
  parseDraft,
  resolveAttendanceNote,
  saveStateOf,
  savedMarksOf,
  savedNotesOf,
  serializeDraft,
  type AttendanceMarks,
  type AttendanceSaveState,
  type SavableStatus,
  type StoredDraft,
} from "./attendance-draft";

export interface DraftStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export type AttendanceRequest = <T>(
  path: string,
  method?: string,
  body?: unknown,
  options?: { signal?: AbortSignal },
) => Promise<T>;

export interface EditorOptions {
  userId: string;
  classId: string;
  date: string;
  /** False for a read-only servant and for View As: nothing is read from, written to or sent from this device. */
  canEdit: boolean;
  request: AttendanceRequest;
  store: DraftStore;
  /** After the server confirms a save (reminders and cached lists refresh). */
  onSaved?: () => void;
  /** Pause after the last tap before sending. */
  debounceMs?: number;
  /** Waits between automatic retries of a transient failure; the last one repeats. */
  retryDelaysMs?: readonly number[];
}

export interface EditorState {
  /** `loading` before the first roster, `error` when there is none to show, else `ready`. */
  phase: "loading" | "ready" | "error";
  loadError: string | null;
  /** A refresh while a roster is on screen: the marks stay visible. */
  refreshing: boolean;
  refreshError: string | null;
  attendance: SundaySchoolSessionAttendance | null;
  /** What the screen shows: the server's marks with this device's pending taps over them. */
  marks: AttendanceMarks;
  /** What the server last confirmed. */
  saved: AttendanceMarks;
  /** Taps the server has not confirmed. Persisted on every change. */
  pending: AttendanceMarks;
  /** Notes typed here that the server has not confirmed, by child. */
  notes: Record<string, string>;
  /** Notes the server holds, by child; a save sends these back or the server would clear them. */
  savedNotes: Record<string, string | null>;
  saving: boolean;
  /** The explicit save is running: taps wait for it. */
  finalizing: boolean;
  saveError: string | null;
  /** Whether trying again unaided can help (offline, timeout, server error). */
  retryable: boolean;
  storageError: boolean;
  /** A draft came back from the device; it is held until the person chooses to resume. */
  recovered: boolean;
  removedCount: number;
  /** The server's word on who saved last and when; undefined until a roster has loaded. */
  lastSavedBy: AttendanceSaveInfo | null | undefined;
}

export const INITIAL_EDITOR_STATE: EditorState = {
  phase: "loading",
  loadError: null,
  refreshing: false,
  refreshError: null,
  attendance: null,
  marks: {},
  saved: {},
  pending: {},
  notes: {},
  savedNotes: {},
  saving: false,
  finalizing: false,
  saveError: null,
  retryable: false,
  storageError: false,
  recovered: false,
  removedCount: 0,
  lastSavedBy: undefined,
};

export const DEBOUNCE_MS = 600;
export const RETRY_DELAYS_MS = [5000, 10000, 20000, 30000] as const;

/** A 200 that did not say "success": nothing was confirmed, and trying the same thing again will not change that. */
class UnconfirmedSave extends Error {
  readonly retryable = false;
  constructor() {
    super("The server did not confirm attendance was saved. Your marks are kept on this device.");
  }
}

export class AttendanceEditor {
  /** Account, class and date: the identity of this editor. */
  readonly key: string;
  private readonly storageKey: string | null;
  private state: EditorState = INITIAL_EDITOR_STATE;
  private readonly listeners = new Set<() => void>();
  private readonly abort = new AbortController();
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private loadId = 0;
  private writing = false;
  private writeAgain = false;
  private writeDone: Promise<void> = Promise.resolve();

  constructor(private readonly options: EditorOptions) {
    this.key = `${options.userId}|${options.classId}|${options.date}`;
    this.storageKey = attendanceDraftStorageKey(options.userId, options.classId, options.date);
  }

  getState = (): EditorState => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Resolves when the draft on the device matches the latest state (for tests and orderly shutdown). */
  settled = () => this.writeDone;

  start() {
    if (!this.disposed) void this.load(false);
  }

  /** Abort in-flight work and stop timers. The draft on the device is left exactly as the last write made it. */
  dispose() {
    this.disposed = true;
    this.abort.abort();
    this.clearTimer();
    this.listeners.clear();
  }

  /** The explicit "Reload roster and recover marks": drops removed children, leaves new ones unmarked, keeps what was marked. */
  reload() {
    if (this.disposed || this.state.saving) return;
    void this.load(false);
  }

  /** A person marks one child. */
  mark(childId: string, status: SavableStatus) {
    this.applyMarks({ [childId]: status });
  }

  /** "Mark rest present": only children with no mark yet, never anyone who was marked. */
  markRestPresent() {
    const roster = this.state.attendance?.roster ?? [];
    const updates: AttendanceMarks = {};
    for (const child of roster) if (!this.state.marks[child.id]) updates[child.id] = "PRESENT";
    this.applyMarks(updates);
  }

  /** A typed note. A note on an already-marked child is sent with that child's mark. */
  setNote(childId: string, text: string) {
    const s = this.state;
    if (!this.editable() || s.finalizing || !s.attendance?.roster.some((child) => child.id === childId)) return;
    const pending = s.marks[childId] ? { ...s.pending, [childId]: s.marks[childId] } : s.pending;
    this.set({ notes: { ...s.notes, [childId]: text }, pending });
    this.persistDraft();
    this.rearm();
  }

  /**
   * Send. `finalize` is the explicit save: every child still unmarked is recorded absent, and the whole
   * roster is sent. Without it only the marks a person made are sent, and nobody is marked absent.
   */
  async save(finalize = false): Promise<boolean> {
    const s = this.state;
    const attendance = s.attendance;
    // Not while a refresh is in flight: its answer was read before this save and would put old marks back.
    if (!this.editable() || s.phase !== "ready" || s.saving || s.refreshing || !attendance) return false;
    const signal = this.abort.signal;
    const sent: AttendanceMarks = finalize
      ? Object.fromEntries(attendance.roster.map((child) => [child.id, s.marks[child.id] ?? "ABSENT"]))
      : { ...s.pending };
    if (!Object.keys(sent).length) return false;
    const sentNotes = { ...s.notes };
    this.clearTimer();
    // Keep the exact submission on the device before it leaves, so an interruption mid-save loses nothing.
    this.set({
      marks: { ...s.marks, ...sent },
      pending: { ...s.pending, ...sent },
      saving: true,
      finalizing: finalize,
      saveError: null,
      retryable: false,
    });
    this.persistDraft();
    try {
      let session: SundaySchoolSession | null = attendance.session;
      if (!session) {
        session = await this.options.request<SundaySchoolSession>(
          "/api/sunday-school/sessions",
          "POST",
          { classId: this.options.classId, date: this.options.date, expectedUserId: this.options.userId },
          { signal },
        );
        if (signal.aborted) return false;
        this.set({ attendance: { ...this.state.attendance!, session } });
      }
      const response = await this.options.request<SundaySchoolAttendanceBatchResponse>(
        "/api/sunday-school/attendance/batch",
        "POST",
        {
          sessionId: session.id,
          expectedUserId: this.options.userId,
          records: Object.entries(sent).map(([childId, status]) => ({
            childId,
            status,
            // A save with no note sent would clear the one already there.
            notes: resolveAttendanceNote(s.savedNotes[childId], sentNotes[childId]),
          })),
        },
        { signal },
      );
      if (signal.aborted) return false;
      if (response?.success !== true) throw new UnconfirmedSave();
      const latest = this.state;
      const remaining = afterAcknowledgment(latest, sent, sentNotes);
      const savedNotes = { ...latest.savedNotes };
      for (const childId of Object.keys(sent)) savedNotes[childId] = resolveAttendanceNote(savedNotes[childId], sentNotes[childId]);
      this.failures = 0;
      this.set({
        ...remaining,
        saved: { ...latest.saved, ...sent },
        savedNotes,
        saving: false,
        finalizing: false,
        recovered: false,
        removedCount: 0,
        saveError: null,
        retryable: false,
        lastSavedBy: response.lastSavedBy ?? latest.lastSavedBy,
      });
      this.persistDraft();
      this.options.onSaved?.();
      // A tap made during this save still needs its own acknowledgment.
      this.rearm();
      // Quietly re-read the roster after the explicit save; the marks on screen stay put meanwhile.
      if (finalize) void this.load(true);
      return true;
    } catch (error) {
      if (signal.aborted) return false;
      const failure = attendanceFailure(error);
      if (failure.retryable) this.failures++;
      this.set({
        saving: false,
        finalizing: false,
        saveError: failure.message,
        retryable: failure.retryable,
      });
      // Only a transient failure retries by itself; anything else waits for a person.
      this.rearm();
      return false;
    }
  }

  /** "Resume saving marks": the person has reviewed what was recovered. */
  resume() {
    if (!this.editable()) return Promise.resolve(false);
    this.set({ recovered: false });
    return this.save(false);
  }

  /** "Retry pending marks": an explicit try, also for a failure that is never retried on its own. */
  retry() {
    this.failures = 0;
    return this.save(false);
  }

  /** The app came back, or is leaving: send what is waiting now rather than after the pause. */
  flushNow() {
    if (!this.canAutosave()) return;
    this.clearTimer();
    void this.save(false);
  }

  // ---- internals ----

  private editable() {
    return this.options.canEdit && !this.disposed && !!this.storageKey;
  }

  private hasPending() {
    return Object.keys(this.state.pending).length > 0;
  }

  /** Auto-saving is allowed only for marks a person made, never for a recovered draft, never after a refusal. */
  private canAutosave() {
    const s = this.state;
    return (
      this.editable() &&
      s.phase === "ready" &&
      !!s.attendance &&
      !s.saving &&
      !s.refreshing &&
      !s.recovered &&
      this.hasPending() &&
      !(s.saveError && !s.retryable)
    );
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private rearm() {
    this.clearTimer();
    if (!this.canAutosave()) return;
    const delays = this.options.retryDelaysMs ?? RETRY_DELAYS_MS;
    const wait = this.failures > 0
      ? delays[Math.min(this.failures, delays.length) - 1]
      : (this.options.debounceMs ?? DEBOUNCE_MS);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.save(false);
    }, wait);
  }

  private set(patch: Partial<EditorState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private applyMarks(updates: AttendanceMarks) {
    const s = this.state;
    if (!this.editable() || s.phase !== "ready" || s.finalizing || !s.attendance) return;
    const roster = new Set(s.attendance.roster.map((child) => child.id));
    const marks = { ...s.marks };
    const pending = { ...s.pending };
    let changed = false;
    for (const [id, status] of Object.entries(updates)) {
      if (!roster.has(id) || marks[id] === status) continue;
      marks[id] = status;
      pending[id] = status;
      changed = true;
    }
    if (!changed) return;
    // A new tap leaves a transient failure standing (the retry below still applies) and never clears a refusal.
    this.set({ marks, pending });
    this.persistDraft();
    this.rearm();
  }

  /** Write the latest draft to the device. Writes run one at a time, each taking the newest state. */
  private persistDraft() {
    if (!this.editable()) return;
    if (this.writing) {
      this.writeAgain = true;
      return;
    }
    this.writeDone = this.writeLoop();
  }

  private async writeLoop() {
    const key = this.storageKey!;
    this.writing = true;
    try {
      do {
        this.writeAgain = false;
        const draft: StoredDraft = { marks: this.state.pending, notes: this.state.notes };
        let failed = false;
        try {
          if (!Object.keys(draft.marks).length && !Object.keys(draft.notes).length) await this.options.store.remove(key);
          else await this.options.store.set(key, serializeDraft(draft));
        } catch {
          failed = true;
        }
        if (this.state.storageError !== failed) this.set({ storageError: failed });
      } while (this.writeAgain);
    } finally {
      this.writing = false;
    }
  }

  private async fetchRoster(signal: AbortSignal): Promise<SundaySchoolSessionAttendance> {
    const { classId, date, request } = this.options;
    const sessions = await request<SundaySchoolSession[]>(
      `/api/sunday-school/sessions?classId=${encodeURIComponent(classId)}&from=${date}&to=${date}`,
      "GET",
      undefined,
      { signal },
    );
    if (sessions[0]) {
      return request<SundaySchoolSessionAttendance>(
        `/api/sunday-school/sessions/${encodeURIComponent(sessions[0].id)}/attendance`,
        "GET",
        undefined,
        { signal },
      );
    }
    const children = await request<SundaySchoolChild[]>(
      `/api/sunday-school/children?classId=${encodeURIComponent(classId)}&isActive=true`,
      "GET",
      undefined,
      { signal },
    );
    // Roster fields only, never guardian contacts.
    return {
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

  /**
   * Load or refresh the roster. A refresh with a roster on screen keeps its marks visible. `silent` is the
   * quiet re-read after an explicit save: it never turns the pending marks into a "recovered" draft.
   */
  private async load(silent: boolean) {
    const id = ++this.loadId;
    const signal = this.abort.signal;
    const hadRoster = !!this.state.attendance;
    this.set(hadRoster ? { refreshing: true, refreshError: null } : { phase: "loading", loadError: null });
    try {
      const attendance = await this.fetchRoster(signal);
      if (signal.aborted || id !== this.loadId) return;
      const ids = attendance.roster.map((child) => child.id);
      const saved = savedMarksOf(attendance.roster);
      let stored = emptyDraft();
      let storageError = false;
      // Recovery waits for this fresh, authorized roster: an old ID can never rejoin a class.
      if (this.editable() && !silent && !hadRoster) {
        try {
          stored = parseDraft(await this.options.store.get(this.storageKey!));
        } catch {
          storageError = true;
        }
        if (signal.aborted || id !== this.loadId) return;
      }
      // Taps made since the request began (or before a reload) are folded in, newer over stored.
      const carried = this.editable() ? { marks: this.state.pending, notes: this.state.notes } : emptyDraft();
      const merged = mergeAttendanceDraft(
        saved,
        { marks: { ...stored.marks, ...carried.marks }, notes: { ...stored.notes, ...carried.notes } },
        ids,
      );
      const hasPending = Object.keys(merged.pending).length > 0;
      const wasSilentSave = silent && hadRoster;
      this.set({
        phase: "ready",
        loadError: null,
        refreshing: false,
        refreshError: null,
        attendance,
        marks: merged.marks,
        saved,
        savedNotes: savedNotesOf(attendance.roster),
        pending: merged.pending,
        notes: merged.notes,
        removedCount: wasSilentSave ? this.state.removedCount : merged.removedCount,
        storageError: storageError || this.state.storageError,
        recovered: wasSilentSave ? this.state.recovered : hasPending,
        lastSavedBy: attendance.lastSavedBy ?? null,
        // A reload is the explicit recovery for a failed save; the person resumes from a clean slate.
        ...(wasSilentSave ? {} : { saveError: null, retryable: false }),
      });
      // Persist the cleaned draft (removed children dropped), or clear it when nothing is left.
      // Rewrite the device's copy when this load changed it (children dropped, marks already saved).
      const touched = [stored, carried].some((draft) => Object.keys(draft.marks).length || Object.keys(draft.notes).length);
      if (this.editable() && !storageError && touched) this.persistDraft();
      this.rearm();
    } catch (error) {
      if (signal.aborted || id !== this.loadId) return;
      const message = error instanceof Error && error.message ? error.message : "Unable to load attendance.";
      const revoked = (error as { status?: unknown })?.status === 403;
      if (hadRoster && !revoked) {
        this.set({ refreshing: false, refreshError: message });
      } else {
        // No roster to show, or access ended: nothing may stay on screen as if still editable.
        this.set({
          phase: "error",
          loadError: message,
          refreshing: false,
          attendance: null,
          marks: {},
          saved: {},
          savedNotes: {},
        });
      }
    }
  }
}

export interface EditorSummary {
  rosterIds: string[];
  markedCount: number;
  unmarkedCount: number;
  pendingCount: number;
  saveState: AttendanceSaveState;
  /** The explicit save is available: something is unsent or unmarked. */
  canFinalize: boolean;
}

/** Counts and flags the screen and save area read from a state. */
export function summarize(state: EditorState, canEdit: boolean): EditorSummary {
  const rosterIds = state.attendance?.roster.map((child) => child.id) ?? [];
  const markedCount = rosterIds.filter((id) => state.marks[id]).length;
  const unmarkedCount = rosterIds.length - markedCount;
  const pendingCount = Object.keys(state.pending).length;
  const ready = state.phase === "ready" && rosterIds.length > 0;
  return {
    rosterIds,
    markedCount,
    unmarkedCount,
    pendingCount,
    saveState: saveStateOf({
      canEdit,
      saving: state.saving,
      failed: !!state.saveError,
      recovered: state.recovered,
      pendingCount,
      hasSavedMarks: Object.keys(state.saved).length > 0,
    }),
    canFinalize: canEdit && ready && !state.saving && !state.refreshing && (unmarkedCount > 0 || pendingCount > 0),
  };
}
