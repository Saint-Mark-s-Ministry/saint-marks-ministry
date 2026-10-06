import { describe, expect, it } from "vitest";
import {
  actorLabel,
  canViewActivity,
  filterByResult,
  formatAction,
  formatReason,
  metadataEntries,
  resultLabel,
  resultTone,
  shortId,
  targetLabel,
  type AuditEvent,
} from "../../apps/mobile/src/data/prep-activity";

const event = (overrides: Partial<AuditEvent>): AuditEvent => ({
  id: "clx9abc123def456f2a",
  action: "AUTH_LOGIN",
  entityType: "User",
  entityId: "clx9abc123def456f2a",
  result: "SUCCESS",
  reason: null,
  requestId: null,
  createdAt: "2026-10-05T13:41:00.000Z",
  actor: { id: "u1", name: "Kamal Youssef", email: "kamal@example.com" },
  target: null,
  metadata: null,
  ...overrides,
});

describe("Activity log (SMM-41)", () => {
  describe("happy path", () => {
    it("filters by result, with the empty filter passing everything through (the 'All' segment)", () => {
      const rows = [event({ id: "a", result: "SUCCESS" }), event({ id: "b", result: "DENIED" }), event({ id: "c", result: "FAILED" })];
      expect(filterByResult(rows, "").map((r) => r.id)).toEqual(["a", "b", "c"]);
      expect(filterByResult(rows, "DENIED").map((r) => r.id)).toEqual(["b"]);
      expect(filterByResult(rows, "FAILED").map((r) => r.id)).toEqual(["c"]);
    });

    it("labels the real, confirmed action types and falls back to a readable transform for anything else", () => {
      expect(formatAction("AUTH_LOGIN")).toBe("Sign-in");
      expect(formatAction("user.role_tags.update")).toBe("Updated access tags");
      expect(formatAction("sunday_school.priest_note.create")).toBe("Added confidential note");
      expect(formatAction("some.future_action")).toBe("Some future action");
    });

    it("maps result to tone/label matching the design source's OK/Denied/Failed pills", () => {
      expect(resultTone("SUCCESS")).toBe("success");
      expect(resultTone("DENIED")).toBe("warning");
      expect(resultTone("FAILED")).toBe("danger");
      expect(resultLabel("SUCCESS")).toBe("OK");
      expect(resultLabel("DENIED")).toBe("Denied");
      expect(resultLabel("FAILED")).toBe("Failed");
    });

    it("formats known reason codes readably and passes free-text reasons (e.g. an admin's note) through unchanged", () => {
      expect(formatReason("ACCOUNT_DISABLED")).toBe("Account disabled");
      expect(formatReason("Granted for the Fall mentor rollout")).toBe("Granted for the Fall mentor rollout");
      expect(formatReason(null)).toBeNull();
    });

    it("builds actor and affected-record labels, truncating long ids the way the design source does", () => {
      expect(actorLabel(event({ actor: null }))).toBe("Unknown");
      expect(actorLabel(event({ actor: { id: "u1", name: null, email: "a@b.com" } }))).toBe("a@b.com");
      expect(targetLabel(event({ entityType: "User", target: { id: "t1", name: "Abakir Hanna", email: "a@b.com" } }))).toBe("User · Abakir Hanna");
      expect(targetLabel(event({ entityType: "SundaySchoolPriestNote", entityId: "clx9abc123def456f2a", target: null }))).toBe("SundaySchoolPriestNote · clx9…f2a");
      expect(shortId("short")).toBe("short");
    });

    it("flattens metadata into readable rows, formatting arrays/objects/null sensibly", () => {
      const rows = metadataEntries({
        previousTags: ["SERVANTS_PREP_SERVANT"],
        grantedTags: [],
        previousCompatibilityRole: null,
        compatibilityRole: "PRIEST",
      });
      expect(rows).toEqual([
        { key: "previousTags", value: "SERVANTS_PREP_SERVANT" },
        { key: "grantedTags", value: "none" },
        { key: "previousCompatibilityRole", value: "—" },
        { key: "compatibilityRole", value: "PRIEST" },
      ]);
    });
  });

  describe("highest-risk path", () => {
    it("gates the whole screen to SUPER_ADMIN only — the real server-side check is RoleTag-based and stricter still", () => {
      expect(canViewActivity("SUPER_ADMIN")).toBe(true);
      expect(canViewActivity("SERVANT_PREP")).toBe(false);
      expect(canViewActivity("PRIEST")).toBe(false);
      expect(canViewActivity(null)).toBe(false);
    });

    it("never surfaces a sensitive-looking metadata key even if a future action writes one before the server allowlist catches up", () => {
      const rows = metadataEntries({ token: "abc", apiSecret: "xyz", password: "hunter2", safeField: "ok" });
      expect(rows).toEqual([{ key: "safeField", value: "ok" }]);
    });
  });
});
