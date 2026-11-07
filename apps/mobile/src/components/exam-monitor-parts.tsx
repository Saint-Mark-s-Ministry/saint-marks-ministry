import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import type { DigitalExamView, ExamActivity } from "@stmark/contracts";
import { examActivityMessage, latestPauseActivity } from "@stmark/domain";
import { Card, Copy } from "@/components/ui";
import { Choice } from "@/components/forms";
import { ExamActionButton } from "@/components/exam-action-button";
import { ExamAnswerChoices } from "@/components/exam-answer-choices";
import { EXAM_CHOICES, canUnlockStudent, completeAnswerKey, type ProctorRow } from "@/data/live-exams";
import { answerCells, contactAge, resultLine, studentTile, unlockBlocker, type TileTone } from "@/data/exam-monitor";
import { useAppTheme } from "@/theme";

export function Activity({ event }: { event: ExamActivity }) {
  return (
    <View accessible style={{ gap: 2, paddingVertical: 4 }}>
      <Copy kind="caption" style={{ fontWeight: "600" }}>{examActivityMessage(event.kind, event).title}</Copy>
      <Copy kind="caption">{new Date(event.createdAt).toLocaleString()}</Copy>
    </View>
  );
}

export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Copy style={{ fontWeight: "600" }}>{open ? "▾" : "▸"} {title}</Copy>
      </Pressable>
      {open && children}
    </Card>
  );
}

function toneColors(tone: TileTone, colors: ReturnType<typeof useAppTheme>["colors"]) {
  switch (tone) {
    case "alert": return { fg: colors.danger, bg: colors.dangerSoft, border: colors.danger };
    case "warn": return { fg: colors.warning, bg: colors.warningSoft, border: colors.warning };
    case "done": return { fg: colors.success, bg: colors.successSoft, border: colors.border };
    case "active": return { fg: colors.info, bg: colors.infoSoft, border: colors.border };
    default: return { fg: colors.muted, bg: colors.surface, border: colors.border };
  }
}

/** One student on the grid. Red and labelled "Needs unlock" when a proctor can act; the label, not only the color, says so. */
export function StudentTileButton({ view, row, now, onPress }: { view: DigitalExamView; row: ProctorRow; now: number; onPress: () => void }) {
  const { colors } = useAppTheme();
  const tile = studentTile(view, row);
  const tint = toneColors(tile.tone, colors);
  const attempt = row.attempt;
  const answered = attempt?.retakeReady ? 0 : attempt?.answeredCount ?? 0;
  const latest = attempt?.events.filter((event) => event.kind === "ANSWER_SAVED").at(-1);
  const started = attempt && !attempt.retakeReady;
  const contact = started && attempt.state !== "SUBMITTED" ? `Last contact ${contactAge(attempt.lastSeenAt, now)}` : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.student.name}. ${tile.label}. ${answered} of 50 answered.${contact ? ` ${contact}.` : ""}${tile.detail ? ` ${tile.detail}` : ""}`}
      accessibilityHint="Opens this student's monitoring and answers"
      onPress={onPress}
      style={({ pressed }) => ({
        flexGrow: 1, flexBasis: "46%", minWidth: 150, minHeight: 44, borderRadius: 18, padding: 14, gap: 6,
        borderWidth: tile.tone === "alert" ? 2 : 1, borderColor: tint.border,
        backgroundColor: tile.tone === "alert" || tile.tone === "warn" ? tint.bg : colors.surface, opacity: pressed ? 0.65 : 1,
      })}
    >
      <Copy style={{ fontWeight: "600" }}>{row.student.name}</Copy>
      <Copy kind="caption" color={tint.fg} style={{ fontWeight: "700" }}>{tile.label}</Copy>
      <Copy kind="caption">{answered}/50 answered</Copy>
      {contact && <Copy kind="caption">{contact}</Copy>}
      {latest && <Copy kind="caption">{examActivityMessage(latest.kind, latest).title}</Copy>}
      {!row.eligible && <Copy kind="caption">Historical attempt</Copy>}
    </Pressable>
  );
}

/** The sheet for one student: status, connection, the unlock decision, saved answers, and activity history. */
export function StudentDetails({ view, row, busy, manage, now, unlock }: { view: DigitalExamView; row: ProctorRow; busy: boolean; manage: boolean; now: number; unlock: () => void }) {
  const { colors } = useAppTheme();
  const attempt = row.attempt;
  const tile = studentTile(view, row);
  const pause = attempt ? latestPauseActivity(attempt.events) : null;
  const blocker = unlockBlocker(view, row);
  const result = attempt?.state === "SUBMITTED" ? resultLine(attempt) : null;
  return (
    <>
      <Copy accessibilityLabel={`${tile.label}, ${attempt?.retakeReady ? 0 : attempt?.answeredCount ?? 0} of 50 answered${row.eligible ? "" : ", historical attempt"}`}>
        {tile.label} · {attempt?.retakeReady ? 0 : attempt?.answeredCount ?? 0}/50 answered{row.eligible ? "" : " · Historical attempt"}
      </Copy>
      {attempt && !attempt.retakeReady && (
        <Copy kind="caption">
          Last contact {contactAge(attempt.lastSeenAt, now)} ({new Date(attempt.lastSeenAt).toLocaleTimeString()})
          {attempt.submittedAt ? ` · Submitted ${new Date(attempt.submittedAt).toLocaleTimeString()}` : ""}
          {(attempt.attemptNumber ?? 1) > 1 ? ` · Attempt ${attempt.attemptNumber}` : ""}
        </Copy>
      )}
      {!!result && <Copy kind="caption">{result} (private until results are released)</Copy>}
      {attempt?.retakeReady && <Copy kind="caption">An individual retake is approved. It opens a blank sheet when the student starts.</Copy>}
      {attempt?.state === "PAUSED" && !attempt.retakeReady && (
        <Card style={{ backgroundColor: colors.dangerSoft }}>
          <Copy style={{ fontWeight: "600" }} color={colors.danger}>Answering paused: proctor clearance required</Copy>
          {pause ? <Activity event={pause} /> : <Copy kind="caption">Review the interruption before unlocking.</Copy>}
          <Copy kind="caption">{blocker ?? "Student connected. Review before unlocking."}</Copy>
          {manage
            ? <ExamActionButton label="Unlock student" disabled={busy || !canUnlockStudent(view, row)} onPress={unlock} />
            : <Copy kind="caption">A Servants Prep servant must unlock this student. Your access here is read-only.</Copy>}
        </Card>
      )}
      {tile.tone === "warn" && <Copy color={colors.warning}>No contact for more than 30 seconds.</Copy>}
      {attempt && !attempt.retakeReady && (
        <Disclosure title="Saved answers">
          <Copy kind="caption">Exactly what the server has saved. Grades are calculated by the server, never on this device.</Copy>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {answerCells(attempt.answers).map((cell) => (
              <View
                key={cell.question}
                accessible
                accessibilityLabel={`Question ${cell.question}: ${cell.choice || "blank"}`}
                style={{ minWidth: 62, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: cell.choice ? colors.hover : colors.surface }}
              >
                <Copy kind="caption" style={{ textAlign: "center" }}>{cell.question}: {cell.choice || "—"}</Copy>
              </View>
            ))}
          </View>
        </Disclosure>
      )}
      <Disclosure title={`Activity history (${attempt?.events.length ?? 0})`}>
        {!attempt?.events.length && <Copy kind="caption">No activity recorded yet.</Copy>}
        {attempt?.events.map((event) => <Activity key={event.id} event={event} />)}
      </Disclosure>
    </>
  );
}

/** The 50-question answer key editor: choices A–B to A–H per question, and the key answer. Locks at first opening (server rule). */
export function Configuration({ view, busy, save }: { view: DigitalExamView; busy: boolean; save: (counts: number[], key: string[]) => void }) {
  const [counts, setCounts] = useState<number[]>(view.sheet?.choiceCounts ?? Array<number>(50).fill(4));
  const [key, setKey] = useState<string[]>(view.answerKey ?? Array<string>(50).fill(""));
  return (
    <>
      <Copy accessibilityLabel={`${key.filter(Boolean).length} of 50 key answers entered`}>{key.filter(Boolean).length}/50 key answers entered</Copy>
      {key.map((answer, question) => (
        <View key={question} style={{ gap: 10, paddingVertical: 8 }}>
          <Choice
            label={`Question ${question + 1} choices`}
            value={String(counts[question])}
            disabled={busy}
            options={[2, 3, 4, 5, 6, 7, 8].map((count) => ({ value: String(count), label: `A–${EXAM_CHOICES[count - 1]}` }))}
            onChange={(value) => {
              const next = [...counts]; next[question] = Number(value); setCounts(next);
              if (EXAM_CHOICES.indexOf(key[question]) >= Number(value)) { const answers = [...key]; answers[question] = ""; setKey(answers); }
            }}
          />
          <ExamAnswerChoices question={question} answer={answer} count={counts[question]} disabled={busy} choose={(choice) => { const next = [...key]; next[question] = choice; setKey(next); }} />
        </View>
      ))}
      <ExamActionButton label={busy ? "Saving…" : "Save answer sheet setup"} disabled={busy || !completeAnswerKey(counts, key)} onPress={() => save(counts, key)} />
    </>
  );
}
