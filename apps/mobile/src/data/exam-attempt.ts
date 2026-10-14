import type { AttemptResponse, DigitalExamView, ExamAttemptView } from "@stmark/contracts";
import { ApiError } from "./api-client";
import { EXAM_CHOICES, EXAM_QUESTIONS } from "./live-exams";

type EventKind = "HIDDEN" | "RETURNED" | "BLUR" | "FOCUS" | "OFFLINE" | "RECONNECTED";
type PendingEvent = { id: string; kind: EventKind; at: string };
type Draft = { token: string; attemptNumber: number; answers: Record<string, string>; events: PendingEvent[]; starredQuestions: number[] };
export type ExamDraftStore = { load: () => Promise<string | null>; save: (value: string | null) => Promise<void> };
type Dependencies = {
  getView: () => Promise<DigitalExamView>;
  post: (body: Record<string, unknown>) => Promise<AttemptResponse>;
  store: ExamDraftStore;
  uuid: () => string;
  now?: () => number;
};
export type AnsweringState = {
  view?: DigitalExamView; attempt: ExamAttemptView | null; answers: string[];
  started: boolean; busy: boolean; paused: boolean; offline: boolean; visible: boolean;
  pendingCount: number; pendingEvents: number; message: string; error?: string;
  examState: string; loading: boolean;
  starredQuestions: number[];
};

/** One native answering session. Every request is serialized, including heartbeats,
 * so a slow heartbeat cannot race a save's revision. Pending choices are never
 * sent while hidden, disconnected, or waiting for a proctor's clearance. */
export class ExamAttemptController {
  private state: AnsweringState = {
    attempt: null, answers: Array<string>(EXAM_QUESTIONS).fill(""), started: false,
    busy: false, paused: false, offline: false, visible: true, pendingCount: 0,
    pendingEvents: 0, message: "", examState: "", loading: true, starredQuestions: [],
  };
  private draft: Draft;
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private writes: Promise<void> = Promise.resolve();
  private owned = false;
  private draftLoaded = false;
  private stopped = false;
  private syncing: Promise<void> | null = null;
  private lastHeartbeat = 0;
  private now: () => number;

  constructor(private dependencies: Dependencies) {
    this.now = dependencies.now ?? Date.now;
    this.draft = { token: dependencies.uuid(), attemptNumber: 1, answers: {}, events: [], starredQuestions: [] };
  }
  snapshot = () => this.state;
  activate() { this.stopped = false; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<AnsweringState> = {}) {
    const answers = [...(this.state.attempt?.answers ?? Array<string>(EXAM_QUESTIONS).fill(""))];
    for (const [question, answer] of Object.entries(this.draft.answers)) answers[Number(question)] = answer;
    this.state = { ...this.state, ...patch, answers,
      pendingCount: Object.keys(this.draft.answers).length, pendingEvents: this.draft.events.length,
      starredQuestions: [...this.draft.starredQuestions] };
    this.listeners.forEach(listener => listener());
  }
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private persist() {
    const raw = this.state.attempt?.state === "SUBMITTED" ? null : JSON.stringify(this.draft);
    this.writes = this.writes.catch(() => {}).then(() => this.dependencies.store.save(raw)).catch(() => {
      this.update({ message: "This device could not preserve pending changes. Keep this screen open until all answers save." });
    });
    this.update();
    return this.writes;
  }
  private apply(attempt: ExamAttemptView) {
    const previous = this.state.attempt;
    if (previous && attempt.revision < previous.revision) return;
    if (this.draftLoaded && (attempt.attemptNumber ?? 1) !== this.draft.attemptNumber) {
      this.draft = { ...this.draft, attemptNumber: attempt.attemptNumber ?? 1, answers: {}, events: [], starredQuestions: [] };
      // An approval invalidates the old session. Require an explicit Start retake.
      this.owned = false; this.update({ started: false });
      void this.persist();
    }
    this.state = { ...this.state, attempt };
    if (attempt.state === "SUBMITTED") {
      this.draft.answers = {}; this.draft.events = []; this.draft.starredQuestions = []; this.owned = false;
      void this.persist();
    }
    this.update({ ...(attempt.retakeReady ? { started: false } : {}), paused: attempt.state === "PAUSED" || (this.state.paused
      && !(attempt.state === "ACTIVE" && !this.draft.events.length && !this.state.offline && this.state.visible)) });
  }
  private event(kind: EventKind) {
    if (!this.owned || this.state.attempt?.state === "SUBMITTED") return;
    if (["HIDDEN", "BLUR", "OFFLINE", "RECONNECTED"].includes(kind)) this.update({ paused: true });
    this.draft.events.push({ id: this.dependencies.uuid(), kind, at: new Date(this.now()).toISOString() });
    void this.persist();
  }
  private failure(error: unknown) {
    const message = error instanceof Error ? error.message : "Could not save. Please try again.";
    if (error instanceof ApiError) {
      if (error.status === 401 || error.status === 403) {
        this.owned = false;
        this.state = { ...this.state, attempt: null };
        this.update({ view: undefined, started: false, paused: true, error: message, message });
        return;
      }
    } else if (!this.state.offline) {
      this.update({ offline: true, paused: true });
      this.event("OFFLINE");
    }
    this.update({ message });
  }
  private reconnected() {
    if (!this.state.offline) return;
    this.update({ offline: false });
    this.event("RECONNECTED");
    if (this.state.visible) this.event("RETURNED");
  }
  private async post(body: Record<string, unknown>) {
    const result = await this.dependencies.post({ ...body, sessionToken: this.draft.token, visible: this.state.visible });
    this.reconnected();
    this.update({ examState: result.examState });
    this.apply(result.attempt);
    if (result.blocked) this.update({ paused: true });
    return result;
  }
  private async flushEvents() {
    while (this.owned && this.draft.events.length && this.state.attempt?.state !== "SUBMITTED") {
      const batch = this.draft.events.slice(0, 100);
      await this.post({ action: "events", events: batch });
      const sent = new Set(batch.map(event => event.id));
      this.draft.events = this.draft.events.filter(event => !sent.has(event.id));
      await this.persist();
    }
  }
  private canAnswer() {
    return this.owned && this.state.started && !this.state.busy && !this.state.paused
      && !this.state.offline && this.state.visible && !this.draft.events.length
      && this.state.attempt?.state === "ACTIVE" && this.state.examState === "OPEN";
  }
  private async flushAnswers() {
    while (this.canAnswer() && Object.keys(this.draft.answers).length) {
      const question = Object.keys(this.draft.answers)[0];
      const answer = this.draft.answers[question];
      let result: AttemptResponse;
      try {
        result = await this.post({ action: "save", question: Number(question), answer, revision: this.state.attempt!.revision });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          const view = await this.dependencies.getView();
          this.update({ view, examState: view.sheet?.state ?? "" });
          if (view.attempt) this.apply(view.attempt);
        }
        throw error;
      }
      if (result.blocked || result.attempt.state !== "ACTIVE") break;
      if (this.draft.answers[question] === answer) delete this.draft.answers[question];
      await this.persist();
    }
  }
  refresh = (): Promise<void> => {
    if (this.stopped) return Promise.resolve();
    if (this.syncing) return this.syncing;
    this.syncing = this.serial(async () => {
      try {
        if (this.owned) {
          await this.flushEvents();
          if (this.state.visible && this.now() - this.lastHeartbeat >= 10000) {
            await this.post({ action: "heartbeat" }); this.lastHeartbeat = this.now();
            await this.flushEvents();
          }
          await this.flushAnswers();
        }
        if (!this.state.visible) return;
        try {
          const view = await this.dependencies.getView();
          if (this.stopped) return;
          this.reconnected();
          this.update({ view, examState: view.sheet?.state ?? "", error: undefined });
          if (view.attempt) this.apply(view.attempt);
          if (this.owned) await this.flushEvents();
        } catch (error) {
          // Closing hides the student's GET, but heartbeat returns the finalized
          // submission. Do not leave the last open sheet looking answerable.
          if (error instanceof ApiError && error.status === 404) {
            if (this.owned) await this.post({ action: "heartbeat" });
            this.update({ examState: "CLOSED", error: this.state.attempt?.state === "SUBMITTED" ? undefined : "This live exam is no longer open." });
          } else throw error;
        }
        if (!this.state.offline) this.update({ message: "" });
      } catch (error) { this.failure(error); }
      finally { this.update({ loading: false }); }
    }).finally(() => { this.syncing = null; });
    return this.syncing;
  };
  start = () => this.serial(async () => {
    if (this.stopped || this.owned || !this.state.visible || this.state.examState !== "OPEN") return;
    this.update({ busy: true, message: "" });
    try {
      const raw = await this.dependencies.store.load();
      if (raw) {
        let value: unknown;
        try { value = JSON.parse(raw); } catch { /* Recover from server answers if a local draft is damaged. */ }
        if (validDraft(value)) this.draft = { ...value, starredQuestions: value.starredQuestions ?? [] };
      }
      this.draftLoaded = true;
      const result = await this.post({ action: "start" });
      this.owned = result.attempt.state !== "SUBMITTED";
      this.update({ started: true });
      if (this.draft.events.length || Object.keys(this.draft.answers).length) {
        this.event("RECONNECTED"); if (this.state.visible) this.event("RETURNED");
        await this.flushEvents();
      }
      if (!this.state.visible) { this.event("HIDDEN"); await this.flushEvents(); }
      await this.persist();
    } catch (error) { this.failure(error); }
    finally { this.update({ busy: false }); }
  });
  choose(question: number, answer: string) {
    const choices = this.state.view?.sheet?.choiceCounts[question] ?? 0;
    if (!this.canAnswer() || !Number.isInteger(question) || question < 0 || question >= EXAM_QUESTIONS
      || !(answer === "" || /^[A-H]$/.test(answer) && EXAM_CHOICES.indexOf(answer) < choices)) return;
    this.draft.answers[String(question)] = answer;
    void this.persist();
    void this.serial(async () => {
      try { await this.flushEvents(); await this.flushAnswers(); }
      catch (error) { this.failure(error); }
    });
  }
  toggleStar(question: number) {
    if (!this.state.started || this.state.attempt?.state === "SUBMITTED" || !Number.isInteger(question) || question < 0 || question >= EXAM_QUESTIONS) return;
    this.draft.starredQuestions = this.draft.starredQuestions.includes(question)
      ? this.draft.starredQuestions.filter(value => value !== question)
      : [...this.draft.starredQuestions, question].sort((a, b) => a - b);
    void this.persist();
  }
  visibility(visible: boolean, focusLoss = false) {
    const changed = visible !== this.state.visible;
    this.update({ visible });
    if (!changed && !focusLoss) return;
    this.event(visible ? "RETURNED" : focusLoss ? "BLUR" : "HIDDEN");
    // Both signals matter: BLUR pauses and HIDDEN prevents premature unlock.
    if (!visible && focusLoss) this.event("HIDDEN");
    void this.serial(async () => {
      try { await this.flushEvents(); if (visible && this.owned) await this.post({ action: "heartbeat" }); }
      catch (error) { this.failure(error); }
    });
  }
  submit = () => this.serial(async () => {
    if (!this.canAnswer()) return;
    try {
      await this.flushAnswers();
      if (!this.canAnswer() || Object.keys(this.draft.answers).length || this.draft.events.length)
        throw new ApiError("Wait for all answers and activity reports to save before submitting.", 409);
      this.update({ busy: true });
      const result = await this.post({ action: "submit", revision: this.state.attempt!.revision });
      if (result.blocked) this.update({ message: "A proctor must unlock your exam before you can submit." });
    } catch (error) { this.failure(error); }
    finally { this.update({ busy: false }); }
  });
  stop() {
    this.visibility(false);
    this.stopped = true;
  }
}

function validDraft(value: unknown): value is Draft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<Draft>;
  return typeof draft.token === "string" && /^[a-f0-9-]{36,80}$/i.test(draft.token)
    && Number.isInteger(draft.attemptNumber) && (draft.attemptNumber ?? 0) > 0
    && !!draft.answers && typeof draft.answers === "object" && !Array.isArray(draft.answers)
    && Object.entries(draft.answers).every(([question, answer]) => /^\d+$/.test(question) && Number(question) < 50 && typeof answer === "string" && /^(?:[A-H])?$/.test(answer))
    && (draft.starredQuestions === undefined || Array.isArray(draft.starredQuestions) && draft.starredQuestions.every(question => Number.isInteger(question) && question >= 0 && question < EXAM_QUESTIONS))
    && Array.isArray(draft.events) && draft.events.every(event => event && typeof event.id === "string"
      && /^[a-f0-9-]{36}$/i.test(event.id) && ["HIDDEN", "RETURNED", "BLUR", "FOCUS", "OFFLINE", "RECONNECTED"].includes(event.kind) && typeof event.at === "string");
}
