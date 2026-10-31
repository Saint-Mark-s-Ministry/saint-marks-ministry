import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MENTOR_ELIGIBILITY_NOTE,
  MENTOR_OPTIONS_PATH,
  NOT_PROVIDED,
  canAssignMentors,
  contactActions,
  dialable,
  enrollmentPath,
  fatherActions,
  fatherLine,
  fatherSummary,
  mentorAssignmentBody,
  mentorAssignmentError,
  mentorChangedMessage,
  mentorChoices,
  mentorLine,
  mentorSummary,
  validEmail,
  type PrepEnrollmentPeople,
  type PrepMentorOption,
} from "../../apps/mobile/src/data/roster-contacts";
import { filterRosterSegment, mentorWorkload, type RosterEnrollment } from "../../apps/mobile/src/data/prep-roster";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const staleRaw = { id: "m-old", name: "Old Mentor", email: "old@church.org", phone: "111" };
const confirmed = { name: "Abouna Peter", email: "peter@church.org", phone: "(555) 010-2000" };

describe("the mentor to show", () => {
  it("prefers the resolved contact, with its own email and phone, over the stale raw account", () => {
    const summary = mentorSummary({ mentor: staleRaw, mentorContact: confirmed });
    expect(summary).toEqual({ state: "assigned", name: "Abouna Peter", email: "peter@church.org", phone: "(555) 010-2000" });
    // A new name never inherits the old mentor's contact details.
    expect(JSON.stringify(summary)).not.toMatch(/old@church|Old Mentor|111/);
  });

  it("treats a null resolved contact as no current mentor, even when a stale raw mentor is present", () => {
    const summary = mentorSummary({ mentor: staleRaw, mentorContact: null });
    expect(summary.name).toBeNull();
    expect(summary.state).toBe("none");
  });

  it("says a Year 2 student is awaiting this year's confirmation", () => {
    const people: PrepEnrollmentPeople = {
      mentor: null,
      mentorContact: null,
      mentorForm: { status: "REQUIRED", submission: null },
    };
    expect(mentorSummary(people).state).toBe("awaiting-confirmation");
    expect(mentorLine(people)).toBe("Mentor awaiting this year's confirmation");
  });

  it("falls back to the raw assigned mentor only when the server sent no resolved contact at all", () => {
    expect(mentorSummary({ mentor: staleRaw }).name).toBe("Old Mentor");
    expect(mentorSummary({}).state).toBe("none");
  });

  it("reads a missing mentor, name or contact as Not provided", () => {
    expect(mentorLine({})).toBe("Mentor Not provided");
    expect(mentorSummary({ mentorContact: { name: "  ", email: null, phone: null } }).name).toBeNull();
    const partial = mentorSummary({ mentorContact: { name: "Abouna John", email: null, phone: "" } });
    expect(partial).toEqual({ state: "assigned", name: "Abouna John", email: null, phone: null });
    expect(NOT_PROVIDED).toBe("Not provided");
  });

  it("names the mentor in the row line", () => {
    expect(mentorLine({ mentorContact: confirmed })).toBe("Mentor Abouna Peter");
  });
});

describe("the father of confession", () => {
  it("shows name, church and phone, and Not provided when there is none", () => {
    const father = { id: "f1", name: "Fr. Mark", church: "St. Mark", phone: "555 0100" };
    expect(fatherSummary({ fatherOfConfession: father })).toEqual({ name: "Fr. Mark", church: "St. Mark", phone: "555 0100" });
    expect(fatherLine({ fatherOfConfession: father })).toBe("Father of confession Fr. Mark");
    expect(fatherLine({})).toBe("Father of confession Not provided");
    expect(fatherLine({ fatherOfConfession: null })).toBe("Father of confession Not provided");
    expect(fatherSummary({ fatherOfConfession: { id: "f", name: "Fr. X", church: null, phone: null } })).toEqual({ name: "Fr. X", church: null, phone: null });
  });

  it("offers a call and never an email or message, because only a phone is on file", () => {
    expect(fatherActions({ phone: "555 0100" }).map((a) => a.kind)).toEqual(["call"]);
    expect(fatherActions({ phone: null })).toEqual([]);
  });
});

describe("native contact actions", () => {
  it("builds tel, sms and mailto links from what is on file", () => {
    expect(contactActions(confirmed)).toEqual([
      { kind: "call", label: "Call", url: "tel:5550102000" },
      { kind: "message", label: "Message", url: "sms:5550102000" },
      { kind: "email", label: "Email", url: "mailto:peter@church.org" },
    ]);
  });

  it("offers only the actions that have something behind them", () => {
    expect(contactActions({ email: "a@b.co", phone: null }).map((a) => a.kind)).toEqual(["email"]);
    expect(contactActions({ email: null, phone: "555" }).map((a) => a.kind)).toEqual(["call", "message"]);
    expect(contactActions({ email: null, phone: null })).toEqual([]);
    expect(contactActions({ email: "not an email", phone: "---" })).toEqual([]);
  });

  it("keeps a leading plus and drops everything else a dialer can't use", () => {
    expect(dialable("+1 (555) 010-2000 ext. 4")).toBe("+15550102000" + "4");
    expect(dialable("  ")).toBeNull();
    expect(dialable(null)).toBeNull();
    expect(validEmail(" a@b.co ")).toBe("a@b.co");
    expect(validEmail("a@b")).toBeNull();
  });
});

describe("mentor candidates", () => {
  const options: PrepMentorOption[] = [
    { id: "p1", name: "Abouna Peter", email: "peter@church.org", profileImageUrl: null, role: "MENTOR" },
    // A tagged Sunday School servant whose legacy primary role is not a Prep mentor role.
    { id: "s1", name: "Mina Servant", email: "mina@church.org", profileImageUrl: null, role: "SERVANT" },
    { id: "f1", name: "Fr. Michael", email: "michael@church.org", profileImageUrl: null, role: "PRIEST" },
  ];

  it("uses the server's mentor-options list", () => {
    expect(MENTOR_OPTIONS_PATH).toBe("/api/mentor-options");
  });

  it("keeps an eligible Sunday School servant selectable whatever their primary role", () => {
    const choices = mentorChoices(options, null);
    expect(choices.map((c) => c.option.id)).toEqual(["p1", "s1", "f1"]);
    expect(mentorChoices(options, null, "mina").map((c) => c.option.id)).toEqual(["s1"]);
  });

  it("flags the current mentor and searches by name or email", () => {
    expect(mentorChoices(options, "p1").map((c) => c.current)).toEqual([true, false, false]);
    expect(mentorChoices(options, null, "MICHAEL@church").map((c) => c.option.id)).toEqual(["f1"]);
    expect(mentorChoices(options, null, "nobody")).toEqual([]);
  });

  it("says plainly that being a candidate grants no Servants Prep access", () => {
    expect(MENTOR_ELIGIBILITY_NOTE).toMatch(/doesn't give Servants Prep access/);
  });

  it("lets only the roles the server allows open the picker", () => {
    for (const role of ["SUPER_ADMIN", "PRIEST", "SERVANT_PREP"]) expect(canAssignMentors(role)).toBe(true);
    // Not a mentor, a student, a Sunday School servant, or someone merely listed as a candidate.
    for (const role of ["MENTOR", "STUDENT", "SERVANT", "PARENT", undefined, null]) expect(canAssignMentors(role)).toBe(false);
  });
});

describe("assigning and removing a mentor", () => {
  it("sends only the mentor id, and null to remove", () => {
    expect(mentorAssignmentBody("s1")).toEqual({ mentorId: "s1" });
    expect(mentorAssignmentBody(null)).toEqual({ mentorId: null });
    expect(mentorAssignmentBody("")).toEqual({ mentorId: null });
    expect(enrollmentPath("e/1")).toBe("/api/enrollments/e%2F1");
  });

  it("reports the change in words", () => {
    expect(mentorChangedMessage("Mina Servant")).toBe("Mentor changed to Mina Servant.");
    expect(mentorChangedMessage(null)).toBe("Mentor removed.");
  });

  it("explains each server refusal and never calls a failure a success", () => {
    expect(mentorAssignmentError(400, "Selected user cannot be assigned as a mentor")).toMatch(/no longer be assigned as a mentor/);
    expect(mentorAssignmentError(500, "Submit the current Year 2 mentor form before assigning a mentor")).toMatch(/hasn't confirmed this year's mentor details/);
    expect(mentorAssignmentError(403)).toMatch(/Only Servants Prep administrators/);
    expect(mentorAssignmentError(404)).toMatch(/no longer available/);
    expect(mentorAssignmentError(401)).toMatch(/session expired/);
    expect(mentorAssignmentError(null)).toMatch(/not changed/);
    expect(mentorAssignmentError(418, "Teapot")).toBe("Teapot");
    expect(mentorAssignmentError(500, "boom")).toMatch(/not changed/);
  });
});

describe("the roster", () => {
  const row = (over: Partial<RosterEnrollment>): RosterEnrollment => ({
    id: "e1",
    studentId: "s1",
    isActive: true,
    status: "ACTIVE",
    yearLevel: "YEAR_1",
    isAsyncStudent: false,
    student: { id: "s1", name: "Student" },
    ...over,
  });

  it("counts mentor workload from the assigned account and ignores rows without one", () => {
    const rows = [row({ mentor: { id: "m1", name: "M1" } }), row({ studentId: "s2", mentor: { id: "m1", name: "M1" } }), row({ studentId: "s3", mentor: null }), row({ studentId: "s4" })];
    expect(mentorWorkload(rows)).toEqual([{ id: "m1", name: "M1", count: 2 }]);
    expect(filterRosterSegment(rows, "active")).toHaveLength(4);
  });
});

describe("wiring", () => {
  it("the roster rows show mentor and father lines and the enroll sheet uses mentor-options", () => {
    const roster = read("apps/mobile/src/app/prep-roster.tsx");
    expect(roster).toContain("mentorLine(enrollment)");
    expect(roster).toContain("fatherLine(enrollment)");
    expect(roster).toContain("useResource<PrepMentorOption[]>(MENTOR_OPTIONS_PATH)");
    expect(roster).not.toContain("/api/users?role=MENTOR");
    expect(roster).not.toContain("/api/users?role=SERVANT_PREP");
    expect(roster).not.toContain("isEligibleMentorRole");
  });

  it("the student list rows read the enrollments' people fields", () => {
    const list = read("apps/mobile/src/app/(prep)/students/index.tsx");
    expect(list).toContain('"/api/enrollments"');
    expect(list).toContain("mentorLine(");
    expect(list).toContain("fatherLine(");
  });

  it("the staff detail shows the people card and can change the mentor only for those who may assign", () => {
    const detail = read("apps/mobile/src/app/prep-student/[id].tsx");
    expect(detail).toContain("<EnrollmentPeople");
    expect(detail).toContain("canAssign && enrollment.isActive");
    expect(detail).toContain("<MentorPickerSheet");
    // After a change everything that depends on it is refreshed, not just the sheet.
    expect(detail).toMatch(/onChanged=\{\(message\) => \{[\s\S]*refresh\(\);/);
  });

  it("the mentee and student screens read the resolved contact, not the raw mentor", () => {
    expect(read("apps/mobile/src/app/prep-mentee/[id].tsx")).toContain("<EnrollmentPeople");
    const progress = read("apps/mobile/src/app/prep-progress.tsx");
    expect(progress).toContain("<EnrollmentPeople");
    expect(progress).not.toContain("progress.enrollment.mentor");
  });

  it("the picker sends the mentor id and never a role, and re-loads candidates after a refusal", () => {
    const sheet = read("apps/mobile/src/components/enrollment-people.tsx");
    expect(sheet).toContain("mentorAssignmentBody(mentor?.id ?? null)");
    expect(sheet).toContain("mentorAssignmentError(");
    expect(sheet).toContain("void options.refresh()");
    expect(sheet).not.toMatch(/\.role\b/);
  });

  it("the shapes are shared type-only contracts", () => {
    expect(read("packages/contracts/src/prep-roster.ts")).not.toMatch(/^import(?! type)/m);
    expect(read("packages/contracts/src/index.ts")).toContain('export type * from "./prep-roster"');
  });
});
