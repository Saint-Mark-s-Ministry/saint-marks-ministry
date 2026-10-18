import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (file: string) => readFileSync(join(__dirname, "../../apps/mobile/src", file), "utf8");

// Native push silently stopped working once because the hook that registers
// the device was defined but no longer called. These guard the wiring.
describe("native push wiring", () => {
  const layout = src("app/_layout.tsx");

  it("registers the device from the root layout", () => {
    expect(layout).toMatch(/import \{ usePushNotificationRegistration \} from "@\/data\/push-notifications"/);
    expect(layout).toMatch(/usePushNotificationRegistration\(/);
  });

  it("never binds the device to a viewed-as account (highest-risk path)", () => {
    const call = layout.slice(layout.indexOf("usePushNotificationRegistration("));
    const args = call.slice(0, call.indexOf(");") + 2);
    expect(args).toContain("viewingAs?.originalId");
    // The viewed user's id must not be the fallback while viewing as.
    expect(args.indexOf("viewingAs?.originalId")).toBeLessThan(args.indexOf("user.id"));
  });

  it("does not register before the password change the account still owes", () => {
    const call = layout.slice(layout.indexOf("usePushNotificationRegistration("));
    expect(call.slice(0, call.indexOf(");") + 2)).toContain("mustChangePassword");
  });

  it("opens a tapped push through the shared routing, with its lesson id", () => {
    const push = src("data/push-notifications.ts");
    expect(push).toContain("addNotificationResponseReceivedListener");
    expect(push).toContain("targetFromPushData(");
  });

  it("refreshes the feed when a push arrives or the app resumes", () => {
    const portal = src("data/portal-provider.tsx");
    expect(portal).toContain("addNotificationReceivedListener");
    expect(portal).toMatch(/AppState\.addEventListener\("change"/);
  });
});
