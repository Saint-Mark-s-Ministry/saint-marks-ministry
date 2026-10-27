import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PortalApi } from "../../apps/mobile/src/data/api-client";
import { canChangeContactBookAccess } from "../../apps/mobile/src/data/people";
import { canSeeContactBook } from "../../apps/mobile/src/data/contact-book";
import { canViewActivity } from "../../apps/mobile/src/data/prep-activity";
import { canReviewServantApplications, canReviewRegistrations, canManageInviteCodes } from "../../apps/mobile/src/data/prep-registrations";
import { canManageAttendance, canEditSession } from "../../apps/mobile/src/data/prep-attendance";
import { canManageStudentRecord } from "../../apps/mobile/src/data/prep-students";
import { canManageEnrollments } from "../../apps/mobile/src/data/prep-roster";
import { canManageCurriculum } from "../../apps/mobile/src/data/prep-curriculum";
import { canManageExams } from "../../apps/mobile/src/data/prep-exams";
import { canManageCalendar } from "../../apps/mobile/src/data/prep-calendar";
import { canReviewRotationForms, canSeeAsyncRotations } from "../../apps/mobile/src/data/async-rotations";
import { liveExamAudience } from "../../apps/mobile/src/data/live-exams";
import { canEditChild } from "../../apps/mobile/src/data/sunday-school-roster";
import { canEditPriority } from "../../apps/mobile/src/data/visitation-priority";
import { canChangeChildPhoto } from "../../apps/mobile/src/data/child-photo";
import { ministryAccess } from "../../apps/mobile/src/data/ministry";

const src = (file: string) => readFileSync(join(__dirname, "../../apps/mobile/src", file), "utf8");
const code = (file: string) => src(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// The October 16 policy: a priest edits ministry records in both programs. Account
// and user administration, access tags, the Contact Book, MCP tokens and feedback
// moderation are separate powers that ministry editing never confers.
describe("priest ministry editing on iOS", () => {
  it("offers the Servants Prep editing controls to a priest", () => {
    for (const can of [canManageAttendance, canManageStudentRecord, canManageEnrollments, canManageCurriculum, canManageExams, canManageCalendar, canReviewRegistrations, canManageInviteCodes, canReviewRotationForms]) {
      expect(can("PRIEST")).toBe(true);
    }
    expect(canEditSession("PRIEST", "2026-10-01", "2026-10-09")).toBe(true);
    expect(canSeeAsyncRotations("PRIEST")).toBe(true);
    expect(liveExamAudience("PRIEST")).toBe("staff");
  });

  it("still withholds them from mentors, students, servants and parents", () => {
    for (const role of ["MENTOR", "STUDENT", "SERVANT", "PARENT", null, undefined]) {
      for (const can of [canManageAttendance, canManageStudentRecord, canManageEnrollments, canManageCurriculum, canManageExams, canReviewRegistrations, canReviewRotationForms]) {
        expect(can(role)).toBe(false);
      }
    }
  });

  it("offers the Sunday School editing controls to a priest from the server's own flags, not the role name", () => {
    const priest = ministryAccess({ standing: { isAdmin: true, readOnly: false, coordinatesAnyAgeGroup: false }, ageGroups: [], attendanceTrend: {} } as never, [{ canServe: true }] as never);
    expect(priest.admin).toBe(true);
    expect(priest.canAddChild).toBe(true);
    // A child with no class is editable only by an administrator (the server's loadChildForUser rule).
    expect(canEditChild({ classId: null }, [], priest.admin)).toBe(true);
    expect(canEditChild({ classId: null }, [{ id: "c1", canServe: true }], false)).toBe(false);
    expect(canEditChild({ classId: "c1" }, [{ id: "c1", canServe: true }], false)).toBe(true);
    expect(canEditChild({ classId: "c2" }, [{ id: "c1", canServe: true }], false)).toBe(false);
    expect(canEditPriority({ classCanEdit: true, viewingAs: false })).toBe(true);
    expect(canChangeChildPhoto({ canEdit: true, isActive: true, viewingAs: false })).toBe(true);
  });

  it("does not infer Sunday School editing from the role name anywhere it can use the server's flag", () => {
    for (const file of ["app/roster.tsx", "app/child/[id].tsx", "app/age-groups.tsx", "app/visitations.tsx", "app/visitation/[childId].tsx", "app/homework.tsx", "app/attendance/[classId].tsx"]) {
      expect(code(file)).not.toMatch(/role\s*===\s*["']SUPER_ADMIN["']/);
    }
    expect(code("data/use-ministry-admin.ts")).toContain("standing.isAdmin");
  });

  it("keeps account, access-tag, Contact Book, audit and servant-application administration with their own rules", () => {
    expect(canChangeContactBookAccess({ actorRole: "PRIEST" })).toBe(false);
    expect(canChangeContactBookAccess({ actorRole: "SUPER_ADMIN" })).toBe(true);
    expect(canSeeContactBook({ role: "PRIEST" })).toBe(false);
    expect(canViewActivity("PRIEST")).toBe(false);
    expect(canReviewServantApplications("PRIEST")).toBe(false);
    for (const file of ["app/people.tsx", "app/person/[id].tsx", "app/organization.tsx", "app/activity.tsx", "app/applications.tsx"]) {
      expect(src(file)).toContain('"SUPER_ADMIN"');
      expect(code(file)).not.toMatch(/PRIEST|isAdminLike|useMinistryAdmin/);
    }
    // View As: the screens ask the shared helper, which allows a Super Admin or the server's per-account
    // grant. A Priest role never opens it; "PRIEST" appears only as the target's tag on the grant switch.
    expect(code("app/view-as.tsx")).not.toMatch(/PRIEST|isAdminLike|useMinistryAdmin/);
    expect(src("app/view-as.tsx")).toContain("canStartViewAs");
    expect(src("data/view-as.ts")).toContain('"SUPER_ADMIN"');
    expect(src("data/view-as.ts")).toContain("canUseViewAs === true");
    expect(code("data/view-as.ts").match(/PRIEST/g)).toHaveLength(1);
  });

  it("leaves feedback moderation and the check-in assignment rule to the server's flags", () => {
    expect(code("app/feedback/[id].tsx")).toContain("viewer.canModerate");
    expect(code("app/feedback/[id].tsx")).not.toMatch(/PRIEST|SUPER_ADMIN/);
  });
});

describe("View as stays read-only for a priest", () => {
  const viewed = { user: { id: "student", role: "STUDENT" }, impersonating: { originalId: "priest", readOnly: true, expiresAt: Date.now() + 60000 } };
  const response = (body: unknown) => ({ status: 200, ok: true, headers: new Headers(), json: async () => body });

  it("refuses every ministry write before it is sent, whoever the actor is", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(viewed));
    const client = new PortalApi("https://example.com", fetcher, { load: async () => ({}), save: vi.fn(async () => {}) }, false);
    await client.session();
    const writes = [
      "/api/attendance/batch", "/api/sunday-school/attendance/batch", "/api/lessons", "/api/exams", "/api/enrollments",
      "/api/sunday-school/visitations", "/api/sunday-school/phone-calls", "/api/sunday-school/children", "/api/sunday-school/homework",
      "/api/sunday-school/servants-meetings", "/api/sunday-school/children/kid-1/photo",
    ];
    for (const path of writes) {
      for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
        await expect(client.request(path, { method })).rejects.toMatchObject({ status: 403, code: "ViewAsReadOnly" });
      }
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("hides the editing controls it owns while viewing as", () => {
    expect(canEditPriority({ classCanEdit: true, viewingAs: true })).toBe(false);
    expect(canChangeChildPhoto({ canEdit: true, isActive: true, viewingAs: true })).toBe(false);
  });
});

describe("phone calls keep the server's priest rule", () => {
  it("hides Log a call for a priest (the route refuses them) and for View as, and offers it to class servants", async () => {
    const { canLogPhoneCalls } = await import("../../apps/mobile/src/data/sunday-school-phone-calls");
    expect(canLogPhoneCalls({ classCanEdit: true, role: "SERVANT", viewingAs: false })).toBe(true);
    expect(canLogPhoneCalls({ classCanEdit: true, role: "SUPER_ADMIN", viewingAs: false })).toBe(true);
    expect(canLogPhoneCalls({ classCanEdit: true, role: "PRIEST", viewingAs: false })).toBe(false);
    // A Super Admin who also holds the Priest tag reports isPriest only when private notes are readable.
    expect(canLogPhoneCalls({ classCanEdit: true, role: "SERVANT", standingIsPriest: true, viewingAs: false })).toBe(false);
    expect(canLogPhoneCalls({ classCanEdit: false, role: "SERVANT", viewingAs: false })).toBe(false);
    expect(canLogPhoneCalls({ classCanEdit: true, role: "SERVANT", viewingAs: true })).toBe(false);
  });

  it("records a visit and a priority for a priest, but never offers a call or a recorded visit while viewing as", () => {
    const detail = code("app/visitation/[childId].tsx");
    expect(detail).toContain("const canRecord = !!cls?.canEdit && !viewingAs");
    expect(detail).toContain("canLogPhoneCalls(");
    expect(detail).toContain("{canCall && (");
  });
});
