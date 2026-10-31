import { describe, expect, it } from "vitest";
import type { IndividualAttendanceResponse } from "@stmark/contracts";
import { buildIndividualAttendance } from "../../lib/sunday-school-individual-attendance";
import {
  childMeetings,
  childSpoken,
  classHistoryProblem,
  filterChildren,
  individualAttendancePath,
  individualAttendanceScope,
  isHistoryForClass,
  markLabel,
  rateText,
  recentMeetings,
  visibleChildren,
} from "../../apps/mobile/src/data/individual-attendance";

const child = (id: string, firstName: string, lastName: string) => ({ id, firstName, lastName });
const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

// Built by the real server function, so the app is tested against the real payload shape.
const built = buildIndividualAttendance(
  [child("a", "Mina", "Zaki"), child("b", "Mina", "Adly")],
  [
    { date: day("2026-10-04"), attendance: [{ child: child("a", "Mina", "Zaki"), status: "PRESENT" }, { child: child("f", "Fady", "Former"), status: "ABSENT" }] },
    { date: day("2026-10-11"), attendance: [{ child: child("a", "Mina", "Zaki"), status: "LATE" }, { child: child("b", "Mina", "Adly"), status: "EXCUSED" }] },
  ],
  [day("2026-10-18")],
);
const response: IndividualAttendanceResponse = { classroom: { id: "c1", name: "Grade 2" }, ...built };

describe("individual attendance helpers", () => {
  it("reads the server payload: unrecorded dates, former children, server counts", () => {
    expect(response.dates).toEqual(["2026-10-04", "2026-10-11", "2026-10-18"]);
    const former = response.children.find((c) => c.id === "f")!;
    expect(former.onRoster).toBe(false);
    const mina = response.children.find((c) => c.id === "a")!;
    expect(mina.counts).toEqual({ present: 1, late: 1, absent: 0, excused: 0 });
    // Late earns half credit: (1 + 0.5) / 2 = 75%. The app shows the server's number.
    expect(rateText(mina.rate)).toBe("75%");
  });

  it("lists a child's meetings newest first and leaves blank cells unrecorded", () => {
    const mina = response.children.find((c) => c.id === "a")!;
    const meetings = childMeetings(response, mina);
    expect(meetings.map((m) => m.date)).toEqual(["2026-10-18", "2026-10-11", "2026-10-04"]);
    expect(meetings[0].status).toBeUndefined();
    expect(markLabel(meetings[0].status)).toBe("Unrecorded");
    expect(recentMeetings(response, mina, 2).map((m) => m.date)).toEqual(["2026-10-18", "2026-10-11"]);
  });

  it("keeps excused marks and excludes them from the rate; an all-excused child has no rate", () => {
    const b = response.children.find((c) => c.id === "b")!;
    expect(b.attendance["2026-10-11"]).toBe("EXCUSED");
    expect(b.counts.excused).toBe(1);
    expect(rateText(b.rate)).toBe("—");
    expect(childSpoken(b)).toContain("Excused 1");
  });

  it("searches by full name, ignoring case", () => {
    expect(filterChildren(response.children, "ADLY").map((c) => c.id)).toEqual(["b"]);
    expect(filterChildren(response.children, "  ").length).toBe(3);
    expect(filterChildren(response.children, "nobody")).toEqual([]);
  });

  it("sorts by last name or first name", () => {
    const last = visibleChildren(response, { query: "", nameOrder: "last" }).map((c) => c.lastName);
    expect(last).toEqual(["Adly", "Former", "Zaki"]);
    const first = visibleChildren(response, { query: "", nameOrder: "first" }).map((c) => c.firstName);
    expect(first).toEqual(["Fady", "Mina", "Mina"]);
  });

  it("keeps two children with the same name apart by ID", () => {
    const twins = { children: [{ ...response.children[0], id: "t1" }, { ...response.children[0], id: "t2" }] };
    expect(visibleChildren(twins, { query: "", nameOrder: "last" }).map((c) => c.id)).toEqual(["t1", "t2"]);
  });

  it("asks for the class by encoded ID and scopes the cache to viewer and class", () => {
    expect(individualAttendancePath("c 1/x")).toBe("/api/sunday-school/attendance/history?classId=c%201%2Fx");
    expect(individualAttendanceScope({ id: "u1" }, "c1")).not.toBe(individualAttendanceScope({ id: "u2" }, "c1"));
    expect(individualAttendanceScope({ id: "u1" }, "c1")).not.toBe(individualAttendanceScope({ id: "u1" }, "c2"));
    expect(individualAttendanceScope({ id: "u1", originalId: "admin" }, "c1")).not.toBe(individualAttendanceScope({ id: "u1" }, "c1"));
  });

  it("only accepts an answer for the class that was asked for", () => {
    expect(isHistoryForClass(response, "c1")).toBe(true);
    expect(isHistoryForClass(response, "c2")).toBe(false);
    expect(isHistoryForClass({ classroom: { id: "c1" } }, "c1")).toBe(false);
    expect(isHistoryForClass(null, "c1")).toBe(false);
  });

  it("separates refused, gone and retryable failures", () => {
    expect(classHistoryProblem(403)).toBe("denied");
    expect(classHistoryProblem(404)).toBe("gone");
    expect(classHistoryProblem(500)).toBe("retry");
    expect(classHistoryProblem(undefined)).toBe("retry");
  });

  it("carries no contacts, attendance notes or pastoral notes", () => {
    const text = JSON.stringify(response).toLowerCase();
    for (const word of ["phone", "email", "notes", "guardian", "pastoral"]) expect(text).not.toContain(word);
  });
});
