// The private, staff-only live channel for one exam, where it is configured; polling stays on either way.
//
// The server publishes a bare `changed` ping on `private-digital-exam-<id>` after every committed exam change
// (lib/exam-realtime.ts). It carries only the exam id: never an answer, a key or a grade. The proctor screen re-reads the
// dashboard when one arrives. This speaks the Pusher Channels wire protocol over React Native's own WebSocket, so it adds no
// native module and no new build, and the channel is authorized by the existing staff-only POST /api/digital-exams/live-auth.
// Students never reach this file: only the Exam Monitoring screen imports it, and the server refuses a student's authorization.

export type RealtimeStatus = "off" | "connecting" | "live" | "unavailable";

export type RealtimeSettings = { key: string; cluster: string };

/** The public Pusher key and cluster for this build, or null when live alerts are not configured (the screen then only polls). */
export function realtimeSettings(env: { key?: string; cluster?: string }): RealtimeSettings | null {
  const key = env.key?.trim();
  const cluster = env.cluster?.trim();
  // Both end up in a URL, so accept only what Pusher itself issues.
  if (!key || !cluster || !/^[a-zA-Z0-9]{8,64}$/.test(key) || !/^[a-z0-9-]{2,32}$/.test(cluster)) return null;
  return { key, cluster };
}

/** The server accepts exactly this channel shape (app/api/digital-exams/live-auth). */
export const examChannelName = (examId: string) => (/^[a-zA-Z0-9_-]+$/.test(examId) ? `private-digital-exam-${examId}` : null);

/**
 * Whether this session may hold the channel at all. Only staff who can manage, with the server reporting realtime configured and an
 * answer sheet to watch. A student, a View As session (its authorization call is a blocked write) and a read-only account poll only.
 */
export function shouldSubscribe(input: {
  audience: "staff" | "student" | null;
  manage: boolean;
  viewingAs: boolean;
  realtimeConfigured: boolean | undefined;
  hasSheet: boolean;
  settings: RealtimeSettings | null;
}): boolean {
  return input.audience === "staff" && input.manage && !input.viewingAs && input.realtimeConfigured === true && input.hasSheet && input.settings !== null;
}

/** How often to read the dashboard: every 2 seconds on its own, a slower backup while the live channel is connected. */
export const POLL_MS = { polling: 2000, backup: 10000 } as const;
export const pollInterval = (status: RealtimeStatus) => (status === "live" ? POLL_MS.backup : POLL_MS.polling);

export function statusLine(status: RealtimeStatus, configured: boolean): string {
  if (status === "live") return "Live alerts connected · refresh backup active";
  if (status === "connecting") return "Connecting live alerts · refreshing every 2 seconds";
  if (status === "unavailable" || configured) return "Live alerts unavailable · refreshing every 2 seconds";
  return "Refreshing every 2 seconds";
}

export interface SocketLike {
  onopen: ((event?: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event?: unknown) => void) | null;
  onclose: ((event?: { code?: number }) => void) | null;
  send(data: string): void;
  close(): void;
}
export type Authorize = (socketId: string, channel: string) => Promise<{ auth: string }>;
type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void };

export type ExamChannelOptions = {
  settings: RealtimeSettings;
  examId: string;
  authorize: Authorize;
  onChange: () => void;
  onStatus: (status: RealtimeStatus) => void;
  open?: (url: string) => SocketLike;
  timers?: Timers;
  /** Delay before reconnect attempt n (0-based). */
  backoff?: (attempt: number) => number;
};

const defaultBackoff = (attempt: number) => Math.min(30000, 1000 * 2 ** attempt);
const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) };

/** Whether a failed authorization is final (not staff, or not configured on the server) rather than a connection problem. */
const finalRefusal = (error: unknown) => {
  const status = (error as { status?: unknown })?.status;
  return status === 400 || status === 401 || status === 403 || status === 404 || status === 503;
};

/**
 * Holds the exam's channel: connect, authorize, subscribe, call `onChange` for each `changed` ping, reconnect with backoff on a
 * dropped connection, and report the status. `close()` is final and silent. Anything unexpected only lowers the status to
 * "connecting" or "unavailable"; the screen's polling covers every gap.
 */
export function connectExamChannel(options: ExamChannelOptions): { close: () => void } {
  const channel = examChannelName(options.examId);
  const timers = options.timers ?? realTimers;
  const backoff = options.backoff ?? defaultBackoff;
  const open = options.open ?? ((url: string) => new WebSocket(url) as unknown as SocketLike);
  let closed = false;
  let socket: SocketLike | null = null;
  let attempt = 0;
  let retry: unknown;
  let watchdog: unknown;
  let activity = 120;
  let status: RealtimeStatus = "off";
  const setStatus = (next: RealtimeStatus) => {
    if (closed || next === status) return;
    status = next;
    options.onStatus(next);
  };
  if (!channel) {
    setStatus("unavailable");
    return { close() { closed = true; } };
  }

  const channelName: string = channel;
  const url = `wss://ws-${options.settings.cluster}.pusher.com:443/app/${options.settings.key}?protocol=7&client=stmark-ios&version=1.0&flash=false`;

  function drop(final = false) {
    timers.clear(watchdog);
    const current = socket;
    socket = null;
    if (current) {
      current.onopen = current.onmessage = current.onerror = current.onclose = null;
      try { current.close(); } catch { /* already closed */ }
    }
    if (closed) return;
    if (final) return setStatus("unavailable");
    setStatus("connecting");
    timers.clear(retry);
    retry = timers.set(connect, backoff(attempt++));
  }

  function arm() {
    // Pusher pings well inside its activity timeout; silence beyond it plus a margin means the socket is dead.
    timers.clear(watchdog);
    watchdog = timers.set(() => drop(), (activity + 30) * 1000);
  }

  function connect() {
    if (closed) return;
    setStatus("connecting");
    let ws: SocketLike;
    try { ws = open(url); } catch { return drop(); }
    socket = ws;
    arm();
    ws.onerror = () => { if (socket === ws) drop(); };
    ws.onclose = () => { if (socket === ws) drop(); };
    ws.onmessage = (event) => {
      if (socket !== ws || typeof event.data !== "string") return;
      arm();
      let message: { event?: unknown; data?: unknown };
      try { message = JSON.parse(event.data); } catch { return; }
      // Pusher wraps each payload as a JSON string inside the JSON message.
      const data = (() => {
        if (typeof message.data !== "string") return message.data;
        try { return JSON.parse(message.data); } catch { return undefined; }
      })() as Record<string, unknown> | undefined;
      switch (message.event) {
        case "pusher:connection_established": {
          const socketId = typeof data?.socket_id === "string" ? data.socket_id : "";
          activity = typeof data?.activity_timeout === "number" ? Math.min(Math.max(data.activity_timeout, 10), 600) : 120;
          arm();
          if (!/^\d+\.\d+$/.test(socketId)) return drop();
          options.authorize(socketId, channelName).then(
            (granted) => {
              if (socket !== ws) return;
              ws.send(JSON.stringify({ event: "pusher:subscribe", data: { channel: channelName, auth: granted.auth } }));
            },
            (error) => { if (socket === ws) drop(finalRefusal(error)); },
          );
          return;
        }
        case "pusher_internal:subscription_succeeded":
        case "pusher:subscription_succeeded":
          attempt = 0;
          setStatus("live");
          // A change may have happened while the channel was down: read once now.
          options.onChange();
          return;
        case "pusher:subscription_error":
          return drop(true);
        case "pusher:ping":
          ws.send(JSON.stringify({ event: "pusher:pong", data: {} }));
          return;
        case "pusher:error": {
          const code = typeof data?.code === "number" ? data.code : 0;
          // 4000-4099: do not reconnect (bad key, over the connection limit). 4200+ and the rest: reconnect.
          if (code >= 4000 && code < 4100) return drop(true);
          return;
        }
        case "changed":
          options.onChange();
          return;
        default:
      }
    };
  }

  connect();
  return {
    close() {
      closed = true;
      timers.clear(retry);
      drop(true);
    },
  };
}
