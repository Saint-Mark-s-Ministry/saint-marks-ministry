import type { DigitalExamView, ExamActivity } from "@stmark/contracts";
import type { ProctorRow } from "../../apps/mobile/src/data/live-exams";

type Attempt = NonNullable<ProctorRow["attempt"]>;
export const NOW = Date.parse("2026-10-14T12:00:30Z");

export function event(id: string, kind: string, createdAt = "2026-10-14T12:00:00Z", extra: Partial<ExamActivity> = {}): ExamActivity {
  return { id, kind, createdAt, clientAt: null, actorId: "student", attemptNumber: 1, ...extra };
}
export function attempt(extra: Partial<Attempt> = {}): Attempt {
  return {
    id: "attempt", state: "ACTIVE", answers: Array<string>(50).fill(""), revision: 1, startedAt: "2026-10-14T11:00:00Z",
    lastSeenAt: "2026-10-14T12:00:25Z", pausedAt: null, submittedAt: null, attemptNumber: 1,
    stale: false, pageVisible: true, answeredCount: 0, events: [], ...extra,
  };
}
export function row(name: string, extra: Partial<Attempt> | null, eligible = true): ProctorRow {
  return { student: { id: name.toLowerCase(), name }, eligible, attempt: extra === null ? null : attempt({ id: `attempt-${name}`, ...extra }) };
}
export function view(extra: Partial<DigitalExamView> = {}, roster: ProctorRow[] = []): DigitalExamView {
  return {
    exam: { id: "exam", examDate: "2026-10-14T00:00:00Z", yearLevel: "YEAR_1", totalPoints: 100, examSection: { displayName: "Bible" }, academicYear: { name: "2026-27" } },
    sheet: { state: "OPEN", choiceCounts: Array<number>(50).fill(4), openedAt: "2026-10-14T10:00:00Z", closedAt: null, releasedAt: null },
    canManage: true, realtimeConfigured: true, hasAttempts: roster.some((r) => r.attempt), pendingResults: 0, roster, ...extra,
  };
}
