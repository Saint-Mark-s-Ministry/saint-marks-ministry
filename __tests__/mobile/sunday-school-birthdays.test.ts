import { describe, expect, it } from "vitest";
import {
  birthdayCaption,
  classesIn,
  daysUntilBirthday,
  filterBirthdays,
  formatBirthdayDay,
  isToday,
  upcomingBirthdays,
  type Birthday,
} from "../../apps/mobile/src/data/sunday-school-birthdays";

const now = new Date("2026-10-06T12:00:00.000Z");
const child = (id: string, firstName: string, birthDate: string, classId: string | null = "c1"): Birthday => ({
  id,
  firstName,
  lastName: "Doe",
  birthDate,
  classId,
  class: classId ? { id: classId, name: classId === "c1" ? "Grade 3 Boys" : "Kindergarten", level: "GRADE_3" } : null,
});

describe("UTC calendar values", () => {
  it("shows the stored day regardless of device time zone", () => {
    expect(formatBirthdayDay("2019-03-14T00:00:00.000Z")).toBe("Mar 14");
  });

  it("recognizes a Today birthday by UTC day", () => {
    expect(isToday("2019-10-06T00:00:00.000Z", now)).toBe(true);
    expect(isToday("2019-10-07T00:00:00.000Z", now)).toBe(false);
  });
});

describe("upcoming order", () => {
  it("counts days to the next birthday, wrapping into next year", () => {
    expect(daysUntilBirthday("2019-10-06T00:00:00.000Z", now)).toBe(0);
    expect(daysUntilBirthday("2019-10-10T00:00:00.000Z", now)).toBe(4);
    expect(daysUntilBirthday("2019-01-02T00:00:00.000Z", now)).toBe(88);
  });

  it("lists the nearest birthdays first, and the limit trims the rest", () => {
    const list = [child("a", "Ann", "2019-12-01T00:00:00.000Z"), child("b", "Ben", "2019-10-06T00:00:00.000Z"), child("c", "Cy", "2019-10-09T00:00:00.000Z")];
    expect(upcomingBirthdays(list, now, 2).map((b) => b.id)).toEqual(["b", "c"]);
  });
});

describe("filters and labels", () => {
  const list = [
    child("a", "Ann", "2019-03-14T00:00:00.000Z", "c1"),
    child("b", "Ben", "2019-03-02T00:00:00.000Z", "c2"),
    child("c", "Cy", "2019-10-06T00:00:00.000Z", "c1"),
  ];

  it("filters by month and by class together", () => {
    expect(filterBirthdays(list, { month: 3, classId: null }).map((b) => b.id)).toEqual(["a", "b"]);
    expect(filterBirthdays(list, { month: 3, classId: "c1" }).map((b) => b.id)).toEqual(["a"]);
    expect(filterBirthdays(list, { month: null, classId: null })).toHaveLength(3);
  });

  it("lists each class once for the class filter", () => {
    expect(classesIn(list)).toEqual([{ id: "c1", name: "Grade 3 Boys" }, { id: "c2", name: "Kindergarten" }]);
  });

  it("says Today and the age turned, in words", () => {
    expect(birthdayCaption("2019-10-06T00:00:00.000Z", now)).toBe("Today · turns 7");
    expect(birthdayCaption("2019-03-14T00:00:00.000Z", now)).toBe("Mar 14 · turns 7");
  });
});
