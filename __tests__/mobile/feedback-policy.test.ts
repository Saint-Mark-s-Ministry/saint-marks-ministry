import { describe, expect, it, vi } from "vitest";
import { createFeedbackPolicy } from "../../apps/mobile/src/data/feedback-policy";

function fixture() {
  let time = 0;
  let active = true;
  const play = vi.fn(async () => {});
  const feedback = createFeedbackPolicy({ play, now: () => time, available: () => active });
  return { feedback, play, advance: (ms: number) => { time += ms; }, active: (value: boolean) => { active = value; } };
}

describe("restrained interaction feedback", () => {
  it("uses one cue when nested controls or rapid taps report the same interaction", () => {
    const f = fixture();
    f.feedback("action"); f.feedback("selection"); f.advance(100); f.feedback("action");
    expect(f.play.mock.calls).toEqual([["action"]]);
    f.advance(300); f.feedback("selection");
    expect(f.play.mock.calls).toEqual([["action"], ["selection"]]);
  });
  it("does not queue feedback while the app is in the background", () => {
    const f = fixture(); f.active(false);
    f.feedback("success"); f.feedback("warning");
    expect(f.play).not.toHaveBeenCalled();
    f.active(true); f.feedback("selection");
    expect(f.play.mock.calls).toEqual([["selection"]]);
  });
  it("keeps a fast action from producing both a tap and an immediate completion buzz", () => {
    const f = fixture(); f.feedback("action"); f.advance(50); f.feedback("success");
    expect(f.play).toHaveBeenCalledTimes(1);
  });
  it("allows a meaningful completion cue after an asynchronous action", () => {
    const f = fixture(); f.feedback("action"); f.advance(600); f.feedback("success");
    expect(f.play.mock.calls).toEqual([["action"], ["success"]]);
  });
  it("limits bursts of completion and error alerts", () => {
    const f = fixture(); f.feedback("error"); f.advance(500); f.feedback("success");
    expect(f.play.mock.calls).toEqual([["error"]]);
    f.advance(1000); f.feedback("success");
    expect(f.play.mock.calls).toEqual([["error"], ["success"]]);
  });
  it("spaces proctor warning pulses while letting ordinary selections continue", () => {
    const f = fixture(); f.feedback("warning"); f.advance(2000); f.feedback("warning");
    f.feedback("selection");
    expect(f.play.mock.calls).toEqual([["warning"], ["selection"]]);
    f.advance(7000); f.feedback("warning");
    expect(f.play.mock.calls).toEqual([["warning"], ["selection"], ["warning"]]);
  });
  it("does not let unsupported hardware or native failures interrupt the user action", async () => {
    const f = fixture(); f.play.mockRejectedValueOnce(new Error("Unsupported hardware"));
    expect(() => f.feedback("selection")).not.toThrow();
    await Promise.resolve();
    f.advance(500);
    f.play.mockImplementationOnce(() => { throw new Error("Native module unavailable"); });
    expect(() => f.feedback("action")).not.toThrow();
    f.advance(500); f.feedback("selection");
    expect(f.play).toHaveBeenCalledTimes(3);
  });
});
