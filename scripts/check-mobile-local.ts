/** Local-only integration check. Creates isolated fixtures and removes them in finally. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import {
  PortalApi,
  ApiError,
  type CookieJar,
} from "../apps/mobile/src/data/api-client";

const env = parse(readFileSync(".env.local"));
const dbUrl = new URL(env.SP_DATABASE_URL);
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(dbUrl.hostname),
  "This check is restricted to a local database.",
);
assert.equal(
  dbUrl.pathname,
  "/servants_prep",
  "Expected the local servants_prep copy.",
);
const origin = new URL(env.NEXTAUTH_URL);
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname),
  "This check is restricted to a local API.",
);
const db = new PrismaClient({ datasourceUrl: dbUrl.href });
const suffix = randomUUID();
const servantId = `mobile-check-servant-${suffix}`;
const priestId = `mobile-check-priest-${suffix}`;
const adminId = `mobile-check-admin-${suffix}`;
const classId = `mobile-check-class-${suffix}`;
const childId = `mobile-check-child-${suffix}`;
const lessonId = `mobile-check-lesson-${suffix}`;
const password = randomUUID();
let cookies: CookieJar = {};
const storage = {
  load: async () => cookies,
  save: async (value: CookieJar) => {
    cookies = value;
  },
};
const client = new PortalApi(origin.origin, fetch, storage, true);
const post = (value: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});
const patch = (value: unknown): RequestInit => ({ ...post(value), method: "PATCH" });
const denied = (err: unknown) => err instanceof ApiError && err.status === 403;
try {
  const year = await db.academicYear.findFirstOrThrow({
    where: { isActive: true },
  });
  const schoolYear = await db.sundaySchoolYear.findFirstOrThrow({
    where: { status: "OPEN" },
  });
  const hashed = await bcrypt.hash(password, 10);
  await db.$transaction(async (tx) => {
    for (const [id, role] of [
      [servantId, "SERVANT"],
      [priestId, "PRIEST"],
      [adminId, "SUPER_ADMIN"],
    ] as const) {
      await tx.user.create({
        data: {
          id,
          email: `${id}@example.invalid`,
          name: "Mobile integration fixture",
          password: hashed,
          role,
          mustChangePassword: false,
          roleAssignments: { create: { tag: role === "SUPER_ADMIN" ? "SUPER_ADMIN" : role === "PRIEST" ? "PRIEST" : "SUNDAY_SCHOOL_SERVANT", source: "SYSTEM" } },
        },
      });
    }
    await tx.sundaySchoolClass.create({
      data: {
        id: classId,
        name: classId,
        level: "GRADE_4",
        academicYearId: year.id,
        sundaySchoolYearId: schoolYear.id,
        sectionName: suffix,
      },
    });
    await tx.sundaySchoolChild.create({
      data: {
        id: childId,
        firstName: "Mobile",
        lastName: "Fixture",
        level: "GRADE_4",
        classId,
      },
    });
    await tx.sundaySchoolServantAssignment.create({
      data: {
        userId: servantId,
        classId,
        academicYearId: year.id,
        sundaySchoolYearId: schoolYear.id,
        authority: "SERVANT",
      },
    });
    await tx.sundaySchoolWeeklyLesson.create({ data: { id: lessonId, classId, sundayDate: new Date("2026-09-19T00:00:00Z"), ownerId: servantId } });
  });
  await assert.rejects(
    client.request("/api/sunday-school/classes"),
    (err: unknown) => err instanceof ApiError && err.status === 401,
  );
  const user = await client.signIn(`${servantId}@example.invalid`, password);
  assert.equal(user.id, servantId);
  const classes = await client.request<{ id: string; canServe: boolean }[]>(
    "/api/sunday-school/classes?isActive=true",
  );
  assert.deepEqual(
    classes.map((cls) => cls.id),
    [classId],
  );
  assert.equal(classes[0].canServe, true);
  const restored = new PortalApi(origin.origin, fetch, storage, true);
  await restored.restore();
  assert.equal((await restored.session())?.id, servantId);
  const session = await client.request<{ id: string }>(
    "/api/sunday-school/sessions",
    post({ classId, date: "2026-09-19" }),
  );
  await client.request(
    "/api/sunday-school/attendance/batch",
    post({
      sessionId: session.id,
      records: [{ childId, status: "LATE", notes: "Integration fixture" }],
    }),
  );
  const persisted = await db.sundaySchoolChildAttendance.findUniqueOrThrow({
    where: { sessionId_childId: { sessionId: session.id, childId } },
  });
  assert.equal(persisted.status, "LATE");
  assert.equal(persisted.notes, "Integration fixture");
  const reread = await restored.request<{
    roster: { attendance: { status: string } }[];
  }>(`/api/sunday-school/sessions/${session.id}/attendance`);
  assert.equal(reread.roster[0].attendance.status, "LATE");
  const child = await client.request<{ id: string; attendance: unknown[] }>(`/api/sunday-school/children/${childId}`);
  assert.equal(child.id, childId); assert.equal(child.attendance.length, 1);
  await client.request(`/api/sunday-school/children/${childId}`, patch({ guardianName: "Fixture guardian", notes: "Native roster edit" }));
  assert.equal((await db.sundaySchoolChild.findUniqueOrThrow({ where: { id: childId } })).notes, "Native roster edit");
  await client.request(`/api/sunday-school/lessons/${lessonId}`, patch({ title: "Native lesson check", resources: [{ title: "Example resource", url: "https://example.com/lesson" }] }));
  const lessonList = await client.request<{ lessons: { id: string; resources: unknown[]; canEdit: boolean }[] }>(`/api/sunday-school/lessons?scope=year&classId=${classId}`);
  assert.equal(lessonList.lessons.find(l => l.id === lessonId)?.resources.length, 1);
  await assert.rejects(client.request(`/api/sunday-school/lessons/${lessonId}`, patch({ ownerId: null })), denied);
  await assert.rejects(client.request(`/api/sunday-school/classes/${classId}`, patch({ name: "Forbidden rename" })), denied);
  const servantTeam = await client.request<{ canEdit: boolean }>(`/api/sunday-school/servant-attendance?classId=${classId}&date=2026-09-19`);
  assert.equal(servantTeam.canEdit, true);
  await assert.rejects(client.request("/api/sunday-school/organization"), denied);
  // No confidential note is created here: doing so would notify unrelated priests.
  await client.request("/api/sunday-school/visitations", post({ childId, status: "DONE", visitedAt: "2026-09-19", notes: "Native visitation check" }));
  const visits = await client.request<{ classes: { children: { id: string; visitations: { notes: string }[] }[] }[] }>(`/api/sunday-school/visitations?classId=${classId}`);
  assert.equal(visits.classes[0].children[0].visitations[0].notes, "Native visitation check");
  const idea = await client.request<{ id: string; type: string }>("/api/sunday-school/feedback", post({ type: "IDEA", title: `Native check ${suffix}`, description: "Disposable integration fixture" }));
  assert.equal(idea.type, "IDEA");
  await client.request(`/api/sunday-school/feedback/${idea.id}`, patch({ title: `Updated native check ${suffix}` }));
  await assert.rejects(client.request(`/api/sunday-school/feedback/${idea.id}/vote`, { ...post({ vote: "UP" }), method: "PUT" }), denied);
  await assert.rejects(client.request(`/api/sunday-school/feedback/${idea.id}`, patch({ status: "COMPLETED" })), denied);
  await client.signOut();
  assert.equal(await client.session(), null);
  await client.signIn(`${priestId}@example.invalid`, password);
  for (const [path, body] of [
    [`/api/sunday-school/children/${childId}`, { notes: "Forbidden" }],
    [`/api/sunday-school/lessons/${lessonId}`, { title: "Forbidden" }],
    [`/api/sunday-school/classes/${classId}`, { name: "Forbidden" }],
  ] as const) await assert.rejects(client.request(path, patch(body)), denied);
  await assert.rejects(client.request("/api/sunday-school/visitations", post({ childId, status: "NOT_DONE" })), denied);
  await assert.rejects(client.request("/api/sunday-school/servant-attendance/batch", post({ classId, date: "2026-09-19", records: [{ servantId, status: "PRESENT" }] })), denied);
  await client.request(`/api/sunday-school/feedback/${idea.id}/vote`, { ...post({ vote: "UP" }), method: "PUT" });
  await assert.rejects(
    client.request(
      "/api/sunday-school/attendance/batch",
      post({
        sessionId: session.id,
        records: [{ childId, status: "PRESENT" }],
      }),
    ),
    (err: unknown) => err instanceof ApiError && err.status === 403,
  );
  await client.signOut();
  await client.signIn(`${adminId}@example.invalid`, password);
  await client.request(`/api/sunday-school/classes/${classId}`, patch({ name: `Updated ${classId}` }));
  await client.request("/api/sunday-school/servant-attendance/batch", post({ classId, date: "2026-09-19", records: [{ servantId, status: "PRESENT" }] }));
  const team = await client.request<{ roster: { attendance: { status: string } | null }[] }>(`/api/sunday-school/servant-attendance?classId=${classId}&date=2026-09-19`);
  assert.equal(team.roster[0].attendance?.status, "PRESENT");
  await client.request(`/api/sunday-school/lessons/${lessonId}`, patch({ ownerId: servantId }));
  await client.request(`/api/sunday-school/feedback/${idea.id}`, patch({ status: "PLANNED" }));
  for (const path of ["/api/sunday-school/dashboard", "/api/sunday-school/age-groups", "/api/sunday-school/organization", "/api/sunday-school/child-registrations?status=PENDING", "/api/servant-applications?status=PENDING", "/api/users?page=1&limit=5", "/api/admin/audit-log?page=1&pageSize=5"]) await client.request(path);
  await client.request("/api/sunday-school/servant-assignments", post({ userId: servantId, classId, authority: "COORDINATOR", academicYearId: year.id }));
  await client.signOut();
  await client.signIn(`${servantId}@example.invalid`, password);
  const coordinatorClasses = await client.request<{ id: string; canCoordinate: boolean; canTakeServantAttendance: boolean }[]>("/api/sunday-school/classes");
  assert.equal(coordinatorClasses[0].canCoordinate, true);
  assert.equal(coordinatorClasses[0].canTakeServantAttendance, true);
  await client.request(`/api/sunday-school/classes/${classId}`, patch({ name: `Coordinator ${classId}` }));
  await client.request(`/api/sunday-school/servant-attendance?classId=${classId}&date=2026-09-19`);
  console.log("PASS: native roster/lesson/visitation saves, feedback voting/moderation, servant attendance, administrator queues, coordinator scope, and priest/servant write restrictions.");
  console.log(
    "PASS: local sign-in, cookie restoration, scoped classes, attendance save/read-back, sign-out, and priest write denial.",
  );
} finally {
  await client.signOut().catch(() => {});
  await db.$transaction(async (tx) => {
    await tx.sundaySchoolFeedbackIdea.deleteMany({ where: { submittedById: servantId } });
    await tx.sundaySchoolVisitation.deleteMany({ where: { childId } });
    await tx.sundaySchoolWeeklyLesson.deleteMany({ where: { id: lessonId } });
    await tx.sundaySchoolChildAttendance.deleteMany({ where: { childId } });
    await tx.sundaySchoolSession.deleteMany({ where: { classId } });
    await tx.sundaySchoolChild.deleteMany({ where: { id: childId } });
    await tx.sundaySchoolServantAssignment.deleteMany({
      where: { userId: servantId, classId },
    });
    await tx.sundaySchoolClass.deleteMany({ where: { id: classId } });
    await tx.userRoleAssignment.deleteMany({
      where: { userId: { in: [servantId, priestId, adminId] } },
    });
    await tx.user.deleteMany({ where: { id: { in: [servantId, priestId, adminId] } } });
  });
  await db.$disconnect();
  console.log(
    "Removed temporary mobile integration fixtures; existing ministry records were preserved.",
  );
}
