import type { DigitalExamList, DigitalExamView } from "@stmark/contracts";

export const EXAM_CHOICES = "ABCDEFGH";
export const EXAM_QUESTIONS = 50;
export const digitalExamPath = (id: string) => `/api/digital-exams/${encodeURIComponent(id)}`;

// Navigation affordances only. The existing APIs resolve current database tags.
export function liveExamAudience(role?: string | null) {
  if (role && ["SUPER_ADMIN", "SERVANT_PREP", "PRIEST"].includes(role)) return "staff";
  return role === "STUDENT" ? "student" : null;
}

export type MonitoringState = "OPEN" | "DRAFT" | "UNCONFIGURED" | "CLOSED" | "RELEASED";
export const MONITORING_LABELS: Record<MonitoringState, string> = {
  OPEN: "Proctoring open", DRAFT: "Ready to open", UNCONFIGURED: "Needs setup",
  CLOSED: "Closed", RELEASED: "Results released",
};
const stateOrder: MonitoringState[] = ["OPEN", "DRAFT", "UNCONFIGURED", "CLOSED", "RELEASED"];
export function monitoringState(exam: DigitalExamList["exams"][number]): MonitoringState {
  if (!exam.digitalSheet) return "UNCONFIGURED";
  if (exam.digitalSheet.state === "CLOSED" && exam.digitalSheet.releasedAt) return "RELEASED";
  return stateOrder.includes(exam.digitalSheet.state as MonitoringState)
    ? exam.digitalSheet.state as MonitoringState : "UNCONFIGURED";
}
export function filterLiveExams(exams: DigitalExamList["exams"], search: string, filter = "all") {
  const term = search.trim().toLowerCase();
  return exams.filter(exam => (filter === "all" || monitoringState(exam) === filter)
    && `${exam.examSection.displayName} ${exam.academicYear.name} ${exam.yearLevel.replaceAll("_", " ")}`.toLowerCase().includes(term))
    .sort((a, b) => stateOrder.indexOf(monitoringState(a)) - stateOrder.indexOf(monitoringState(b)) || b.examDate.localeCompare(a.examDate));
}
export type ProctorRow = NonNullable<DigitalExamView["roster"]>[number];
export function canUnlockStudent(view: DigitalExamView, row: ProctorRow) {
  return view.canManage === true && view.sheet?.state === "OPEN" && row.attempt?.state === "PAUSED"
    && !row.attempt.retakeReady && !row.attempt.stale && row.attempt.pageVisible !== false;
}
export function proctorStatus(row: ProctorRow) {
  const attempt = row.attempt;
  if (!attempt || attempt.retakeReady) return attempt?.retakeReady ? "Retake ready" : "Not started";
  if (attempt.state === "SUBMITTED") return "Submitted";
  if (attempt.state === "PAUSED") return "Paused";
  return attempt.stale ? "Connection stale" : "Answering";
}
export function completeAnswerKey(counts: number[], key: string[]) {
  return counts.length === EXAM_QUESTIONS && key.length === EXAM_QUESTIONS && counts.every((count, index) =>
    Number.isInteger(count) && count >= 2 && count <= 8 && /^[A-H]$/.test(key[index]) && EXAM_CHOICES.indexOf(key[index]) < count);
}
export function examCalendarDate(date: string) {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}
