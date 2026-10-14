/** Display percentages with at most two decimal places; calculations keep the original value. */
export function formatPercent(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : `${Number(value.toFixed(2))}%`;
}
