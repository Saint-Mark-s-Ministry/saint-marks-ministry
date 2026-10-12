/**
 * Servants Prep cohort-year labels. An async student has no cohort year (their
 * enrollment's yearLevel is null on the server), so null is a real, expected
 * value here, not missing data and never "Year 1".
 */
const LABELS: Record<string, string> = { YEAR_1: "Year 1", YEAR_2: "Year 2" };

export function yearLevelLabel(level: string | null | undefined): string {
  if (!level) return "No cohort year";
  return LABELS[level] ?? level;
}
