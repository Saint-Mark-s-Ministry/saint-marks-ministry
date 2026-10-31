export type AttendanceRosterNameOrder = "last" | "first";

export type AttendanceRosterPerson = {
  id: string;
  firstName: string;
  lastName: string;
  gender?: "MALE" | "FEMALE" | null;
};

export type AttendanceRosterGroup<T> = {
  key: "all" | "MALE" | "FEMALE" | "UNSPECIFIED";
  label: string | null;
  entries: T[];
};

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function organizeAttendanceRoster<T extends AttendanceRosterPerson>(
  roster: readonly T[],
  options: {
    nameOrder: AttendanceRosterNameOrder;
    groupByGender: boolean;
  },
): AttendanceRosterGroup<T>[] {
  const compare = (left: T, right: T) => {
    const primary = options.nameOrder === "first" ? "firstName" : "lastName";
    const secondary = primary === "firstName" ? "lastName" : "firstName";
    return (
      collator.compare(left[primary], right[primary]) ||
      collator.compare(left[secondary], right[secondary]) ||
      collator.compare(left.id, right.id)
    );
  };
  const sorted = [...roster].sort(compare);

  if (!options.groupByGender) {
    return [{ key: "all", label: null, entries: sorted }];
  }

  const definitions = [
    { key: "MALE" as const, label: "Boys" },
    { key: "FEMALE" as const, label: "Girls" },
    { key: "UNSPECIFIED" as const, label: "Gender not specified" },
  ];

  return definitions.flatMap(group => {
    const entries = sorted.filter(entry =>
      group.key === "UNSPECIFIED" ? !entry.gender : entry.gender === group.key,
    );
    return entries.length ? [{ ...group, entries }] : [];
  });
}
