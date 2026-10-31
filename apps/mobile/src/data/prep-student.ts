// The "SP Student" indicator beside a Sunday School child. The server decides it:
// `isServantsPrepStudent` is true when the child's linked account is enabled and
// has an active Servants Prep enrollment, including after grade 12. The app only
// displays that flag. It never guesses from grade, role or name, never looks the
// student up in the other program, and never treats the badge as permission: it
// grants nothing and creates no staff assignment. Pure helpers.

export const PREP_STUDENT_LABEL = "SP Student";

/** Only the server's flag, and only when it is exactly true (a missing or malformed value shows nothing). */
export function showsPrepStudentBadge(child: { isServantsPrepStudent?: boolean | null }): boolean {
  return child.isServantsPrepStudent === true;
}

/** "Mina Mark, SP Student" for a screen reader. */
export function withPrepStudentSpoken(name: string, child: { isServantsPrepStudent?: boolean | null }): string {
  return showsPrepStudentBadge(child) ? `${name}, ${PREP_STUDENT_LABEL}` : name;
}
