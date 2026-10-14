export type FeedbackKind = "selection" | "action" | "success" | "error" | "warning";

/** Best-effort feedback, never queued. A shared cooldown prevents nested
 * controls from buzzing twice and keeps repeated proctor alerts unobtrusive. */
export function createFeedbackPolicy({ play, available, now = Date.now }: {
  play: (kind: FeedbackKind) => Promise<void>;
  available: () => boolean;
  now?: () => number;
}) {
  let last = -Infinity;
  let lastOutcome = -Infinity;
  let lastWarning = -Infinity;
  return (kind: FeedbackKind) => {
    const time = now();
    const outcome = kind === "success" || kind === "error";
    if (!available() || time - last < 220 || (outcome && time - lastOutcome < 1200)
      || (kind === "warning" && time - lastWarning < 8000)) return;
    last = time;
    if (outcome) lastOutcome = time;
    if (kind === "warning") lastWarning = time;
    try { void play(kind).catch(() => {}); } catch { /* Feedback must never interrupt an action. */ }
  };
}
