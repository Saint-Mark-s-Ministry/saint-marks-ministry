import { describe, expect, it, vi } from "vitest";
import {
  POLL_MS, connectExamChannel, examChannelName, pollInterval, realtimeSettings, shouldSubscribe, statusLine,
  type RealtimeStatus, type SocketLike,
} from "../../apps/mobile/src/data/exam-realtime";
import { ApiError } from "../../apps/mobile/src/data/api-client";

class FakeSocket implements SocketLike {
  onopen: SocketLike["onopen"] = null; onmessage: SocketLike["onmessage"] = null; onerror: SocketLike["onerror"] = null; onclose: SocketLike["onclose"] = null;
  sent: { event: string; data: unknown }[] = [];
  closed = false;
  constructor(readonly url: string) {}
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.closed = true; }
  push(event: string, data: unknown = {}) { this.onmessage?.({ data: JSON.stringify({ event, data: typeof data === "string" ? data : JSON.stringify(data) }) }); }
}
function harness(authorize = vi.fn(async () => ({ auth: "key:signature" }))) {
  const sockets: FakeSocket[] = [];
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  const statuses: RealtimeStatus[] = [];
  const onChange = vi.fn();
  const connection = connectExamChannel({
    settings: { key: "abcdef123456", cluster: "us2" }, examId: "exam_1", authorize, onChange, onStatus: (s) => statuses.push(s),
    open: (url) => { const s = new FakeSocket(url); sockets.push(s); return s; },
    timers: { set: (fn, ms) => { const t = { fn, ms, live: true }; timers.push(t); return t; }, clear: (h) => { if (h) (h as { live: boolean }).live = false; } },
    backoff: (n) => 1000 * 2 ** n,
  });
  const fire = () => { const t = [...timers].reverse().find((x) => x.live && x.ms < 60000); if (t) { t.live = false; t.fn(); } };
  const connect = async (socket = sockets.at(-1)!) => {
    socket.push("pusher:connection_established", { socket_id: "123.456", activity_timeout: 120 });
    await Promise.resolve(); await Promise.resolve();
    socket.push("pusher_internal:subscription_succeeded");
  };
  return { sockets, timers, statuses, onChange, connection, authorize, fire, connect };
}

describe("the private staff channel for one exam", () => {
  it("connects to the configured cluster, authorizes the private channel, and subscribes", async () => {
    const h = harness();
    expect(h.sockets[0].url).toBe("wss://ws-us2.pusher.com:443/app/abcdef123456?protocol=7&client=stmark-ios&version=1.0&flash=false");
    await h.connect();
    expect(h.authorize).toHaveBeenCalledWith("123.456", "private-digital-exam-exam_1");
    expect(h.sockets[0].sent).toEqual([{ event: "pusher:subscribe", data: { channel: "private-digital-exam-exam_1", auth: "key:signature" } }]);
    expect(h.statuses).toEqual(["connecting", "live"]);
  });
  it("re-reads on each change ping and once on connect, answers pings, and ignores other channels' junk", async () => {
    const h = harness();
    await h.connect();
    expect(h.onChange).toHaveBeenCalledTimes(1);
    h.sockets[0].push("changed", { examId: "exam_1" });
    h.sockets[0].push("changed", { examId: "exam_1" });
    expect(h.onChange).toHaveBeenCalledTimes(3);
    h.sockets[0].push("pusher:ping");
    expect(h.sockets[0].sent.at(-1)).toEqual({ event: "pusher:pong", data: {} });
    h.sockets[0].onmessage?.({ data: "not json" });
    h.sockets[0].onmessage?.({ data: 42 });
    h.sockets[0].push("something-else");
    expect(h.onChange).toHaveBeenCalledTimes(3);
  });
  it("falls back to polling and retries with backoff when the connection drops", async () => {
    const h = harness();
    await h.connect();
    h.sockets[0].onclose?.();
    expect(h.statuses.at(-1)).toBe("connecting");
    expect(h.timers.at(-1)).toMatchObject({ ms: 1000, live: true });
    h.fire();
    expect(h.sockets).toHaveLength(2);
    h.sockets[1].onclose?.();
    expect(h.timers.at(-1)!.ms).toBe(2000);
    h.fire();
    await h.connect(h.sockets[2]);
    expect(h.statuses.at(-1)).toBe("live");
    h.sockets[2].onclose?.();
    expect(h.timers.at(-1)!.ms).toBe(1000);
  });
  it("gives up quietly, staying on polling, when the server will not authorize (not staff, not configured)", async () => {
    for (const status of [403, 503, 404]) {
      const h = harness(vi.fn(async () => { throw new ApiError("no", status); }));
      h.sockets[0].push("pusher:connection_established", { socket_id: "123.456", activity_timeout: 120 });
      await Promise.resolve(); await Promise.resolve();
      expect(h.statuses.at(-1)).toBe("unavailable");
      expect(h.sockets).toHaveLength(1);
      expect(h.sockets[0].closed).toBe(true);
    }
  });
  it("retries when authorization fails only because the network did", async () => {
    const h = harness(vi.fn(async () => { throw new TypeError("Network request failed"); }));
    h.sockets[0].push("pusher:connection_established", { socket_id: "123.456", activity_timeout: 120 });
    await Promise.resolve(); await Promise.resolve();
    expect(h.statuses.at(-1)).toBe("connecting");
    h.fire();
    expect(h.sockets).toHaveLength(2);
  });
  it("stops for a rejected subscription or a fatal Pusher error, but not for a reconnectable one", async () => {
    const a = harness(); a.sockets[0].push("pusher:subscription_error"); expect(a.statuses.at(-1)).toBe("unavailable");
    const b = harness(); b.sockets[0].push("pusher:error", { code: 4001, message: "no app" }); expect(b.statuses.at(-1)).toBe("unavailable");
    const c = harness(); c.sockets[0].push("pusher:error", { code: 4201, message: "pong timeout" }); expect(c.statuses.at(-1)).toBe("connecting"); expect(c.sockets[0].closed).toBe(false);
  });
  it("treats a silent socket as dead and reconnects", async () => {
    const h = harness();
    await h.connect();
    const watchdog = [...h.timers].reverse().find((t) => t.live && t.ms === 150000);
    expect(watchdog).toBeDefined();
    watchdog!.fn();
    expect(h.statuses.at(-1)).toBe("connecting");
  });
  it("rejects a malformed socket id instead of sending it for authorization", async () => {
    const h = harness();
    h.sockets[0].push("pusher:connection_established", { socket_id: "../x", activity_timeout: 120 });
    await Promise.resolve();
    expect(h.authorize).not.toHaveBeenCalled();
  });
  it("close() is final and silent: no reconnect, no status, no more change callbacks", async () => {
    const h = harness();
    await h.connect();
    const before = h.statuses.length;
    const socket = h.sockets[0];
    h.connection.close();
    expect(socket.closed).toBe(true);
    socket.onclose?.();
    socket.onmessage?.({ data: JSON.stringify({ event: "changed", data: "{}" }) });
    expect(h.statuses).toHaveLength(before);
    expect(h.onChange).toHaveBeenCalledTimes(1);
    h.fire();
    expect(h.sockets).toHaveLength(1);
  });
  it("refuses an exam id the server would not accept as a channel", () => {
    expect(examChannelName("exam_1-A")).toBe("private-digital-exam-exam_1-A");
    for (const id of ["", "a b", "a/b", "../x", "a;b"]) expect(examChannelName(id)).toBeNull();
    const statuses: RealtimeStatus[] = [];
    const open = vi.fn();
    connectExamChannel({ settings: { key: "abcdef123456", cluster: "us2" }, examId: "a/b", authorize: vi.fn(), onChange: vi.fn(), onStatus: (s) => statuses.push(s), open });
    expect(open).not.toHaveBeenCalled();
    expect(statuses).toEqual(["unavailable"]);
  });
});

describe("when the app subscribes at all", () => {
  const ok = { audience: "staff" as const, manage: true, viewingAs: false, realtimeConfigured: true, hasSheet: true, settings: { key: "abcdef123456", cluster: "us2" } };
  it("only for staff who can manage, with the server and this build both configured", () => {
    expect(shouldSubscribe(ok)).toBe(true);
    expect(shouldSubscribe({ ...ok, audience: "student" })).toBe(false);
    expect(shouldSubscribe({ ...ok, audience: null })).toBe(false);
    expect(shouldSubscribe({ ...ok, manage: false })).toBe(false);
    expect(shouldSubscribe({ ...ok, viewingAs: true })).toBe(false);
    expect(shouldSubscribe({ ...ok, realtimeConfigured: false })).toBe(false);
    expect(shouldSubscribe({ ...ok, realtimeConfigured: undefined })).toBe(false);
    expect(shouldSubscribe({ ...ok, hasSheet: false })).toBe(false);
    expect(shouldSubscribe({ ...ok, settings: null })).toBe(false);
  });
  it("accepts only the key and cluster shapes Pusher issues", () => {
    expect(realtimeSettings({ key: " abcdef123456 ", cluster: "us2" })).toEqual({ key: "abcdef123456", cluster: "us2" });
    expect(realtimeSettings({ key: "abcdef123456" })).toBeNull();
    expect(realtimeSettings({})).toBeNull();
    expect(realtimeSettings({ key: "abc", cluster: "us2" })).toBeNull();
    expect(realtimeSettings({ key: "abcdef123456", cluster: "us2.evil.com/x" })).toBeNull();
    expect(realtimeSettings({ key: "abcdef123456&x=1", cluster: "us2" })).toBeNull();
  });
  it("polls every 2 seconds on its own and slower only while the channel is live", () => {
    expect(pollInterval("live")).toBe(POLL_MS.backup);
    for (const status of ["off", "connecting", "unavailable"] as const) expect(pollInterval(status)).toBe(POLL_MS.polling);
    expect(statusLine("live", true)).toMatch(/connected · refresh backup/);
    expect(statusLine("off", false)).toBe("Refreshing every 2 seconds");
    expect(statusLine("unavailable", true)).toMatch(/unavailable/);
    expect(statusLine("connecting", true)).toMatch(/Connecting/);
  });
});
