const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  avenue: 'Ave', ave: 'Ave', street: 'St', st: 'St', road: 'Rd', rd: 'Rd',
  drive: 'Dr', dr: 'Dr', boulevard: 'Blvd', blvd: 'Blvd', lane: 'Ln', ln: 'Ln',
  court: 'Ct', ct: 'Ct', place: 'Pl', pl: 'Pl', terrace: 'Ter', ter: 'Ter',
  parkway: 'Pkwy', pkwy: 'Pkwy', apartment: 'Apt', appt: 'Apt', apt: 'Apt',
  floor: 'Fl', flr: 'Fl', fl: 'Fl', unit: 'Unit',
}

const LOCALITIES = [
  'Jersey City', 'Staten Island', 'East Brunswick', 'North Arlington',
  'South Orange', 'East Hanover', 'Berkeley Heights', 'Morris Plains',
  'Cedar Grove', 'West Orange', 'Bayonne', 'Elizabeth', 'Rutherford',
  'Secaucus', 'Woodbridge', 'Union', 'Fairview', 'Matawan', 'Denville',
  'Fairfield', 'Watchung', 'Hillsborough', 'Paramus', 'Parsippany',
  'Weehawken', 'Sayreville',
]

const STATE_CODES = 'AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|PR'

/** Presentation only: never supply missing address components or correct names/numbers. */
export function normalizeHomeAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null
  let address = value.trim().replace(/\s+/g, ' ')
  if (!address) return null

  address = address
    .replace(/\bJC\b/gi, 'Jersey City')
    .replace(/\bNew Jersey\b/gi, 'NJ')
    .replace(/\bNew York\b(?=\s*[, ]\s*\d{5}(?:-\d{4})?\b)/gi, 'NY')
    .replace(/\b(apt|apartment|appt|unit|fl|flr|floor)[.:]\s*/gi, '$1 ')
    .replace(/\b(apt|apartment|appt)\s*#\s*/gi, '$1 ')
    .replace(/\b(apt|fl)(?=\d)/gi, '$1 ')
    .replace(/^(\d+)([a-z]{3,})\b/i, '$1 $2')
    .replace(/\b(\d+)\s+(nd|rd|th)\b/gi, '$1$2')
    .replace(/\b(\d+)(st|nd|rd|th)\b/gi, (_, number: string, suffix: string) => number + suffix.toLowerCase())
    .replace(/\p{L}[\p{L}\p{M}'’-]*/gu, (word, offset: number, source: string) => {
      const lower = word.toLowerCase()
      if (offset > 0 && /\d/.test(source[offset - 1])) {
        if (/^(st|nd|rd|th)$/.test(lower)) return lower
        return word.length <= 2 ? word.toUpperCase() : lower[0].toUpperCase() + lower.slice(1)
      }
      const abbreviation = ADDRESS_ABBREVIATIONS[lower]
      if (abbreviation) return abbreviation
      if (/^(nj|ny|jfk|po|nw|ne|sw|se|n|s|e|w)$/.test(lower)) return lower.toUpperCase()
      if (/^(and|or)$/.test(lower)) return lower
      return lower.replace(/(^|['’-])\p{L}/gu, letter => letter.toUpperCase())
    })
    .replace(/\bMcadoo\b/g, 'McAdoo')
    .replace(/\b(\d+)([a-z])\b/gi, (_, number: string, letter: string) => number + letter.toUpperCase())
    .replace(/\b(Ave|St|Rd|Dr|Blvd|Ln|Ct|Pl|Ter|Pkwy|Apt|Fl)\./g, '$1')
    .replace(/\b(NJ|NY)(?=\d)/g, '$1 ')
    .replace(/\b(NJ|NY)\s*,\s*(?=\d)/g, '$1 ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/(?:,\s*){2,}/g, ', ')
    .replace(/^,\s*|,\s*$/g, '')

  // Recognize local city names only when they are not part of the street name.
  const cities = new RegExp(`\\b(${LOCALITIES.join('|')})\\b`, 'g')
  for (const match of [...address.matchAll(cities)].reverse()) {
    const index = match.index
    if (index === 0 || /^\s+(?:St|Ave|Rd|Dr|Ln|Ct|Pl|Blvd)\b/.test(address.slice(index + match[0].length))) continue
    const before = address.slice(0, index).replace(/[.,\s]+$/, '')
    address = `${before}, ${address.slice(index)}`
  }
  address = address
    .replace(/\s+(?=(?:Apt|Unit|Fl)\s+[^,\s]+)/g, ', ')
    .replace(/([^,\s])\s+(NJ|NY)\b/g, '$1, $2')
    .replace(/\s+/g, ' ')
    .replace(/(?:,\s*){2,}/g, ', ')
    .replace(new RegExp(`\\b(${STATE_CODES})\\b(?=\\s*[,]?\\s*(?:\\d{5}(?:-\\d{4})?)?\\s*$)`, 'i'), state => state.toUpperCase())
    .replace(new RegExp(`([^,\\s])\\s+(${STATE_CODES})\\b(?=\\s*(?:\\d{5}(?:-\\d{4})?)?\\s*$)`), '$1, $2')
  return address
}
