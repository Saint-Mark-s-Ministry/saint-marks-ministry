const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "md", "phd", "esq"]);

/**
 * Two-letter monogram for a person: the first letter of the first and last
 * name. Tokens that aren't names — a parenthetical like "(SMM-92)", a
 * generational suffix like "Jr." — are skipped, so "Prep Reviewer (SMM-92)"
 * is "PR", not "P(". A single name gives one letter.
 */
export function initialsFor(name?: string | null): string {
  if (!name) return "?";
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word))
    .filter((word) => !SUFFIXES.has(word.replace(/[.,]/g, "").toLowerCase()));
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0];
  if (words.length === 1) return first.toLocaleUpperCase();
  const last = Array.from(words[words.length - 1])[0];
  return (first + last).toLocaleUpperCase();
}
