export const ROSTER_CSV_TEMPLATE_HEADERS = [
  'first_name',
  'last_name',
  'gender',
  'birth_date',
  'guardian_name',
  'guardian_phone',
  'guardian_email',
  'notes',
] as const

export interface SundaySchoolRosterCsvRow {
  rowNumber: number
  firstName: string
  lastName: string
  gender: 'MALE' | 'FEMALE' | null
  birthDate: string | null
  guardianName: string | null
  guardianPhone: string | null
  guardianEmail: string | null
  notes: string | null
}

export interface SundaySchoolRosterCsvError {
  rowNumber: number
  message: string
}

export interface ParsedSundaySchoolRosterCsv {
  rows: SundaySchoolRosterCsvRow[]
  errors: SundaySchoolRosterCsvError[]
}

const HEADER_ALIASES: Record<string, keyof Omit<SundaySchoolRosterCsvRow, 'rowNumber'>> = {
  first: 'firstName',
  firstname: 'firstName',
  first_name: 'firstName',
  'first name': 'firstName',
  last: 'lastName',
  lastname: 'lastName',
  last_name: 'lastName',
  'last name': 'lastName',
  gender: 'gender',
  sex: 'gender',
  birthdate: 'birthDate',
  birth_date: 'birthDate',
  'birth date': 'birthDate',
  dob: 'birthDate',
  guardian: 'guardianName',
  guardian_name: 'guardianName',
  'guardian name': 'guardianName',
  guardian_phone: 'guardianPhone',
  'guardian phone': 'guardianPhone',
  parent_phone: 'guardianPhone',
  'parent phone': 'guardianPhone',
  guardian_email: 'guardianEmail',
  'guardian email': 'guardianEmail',
  parent_email: 'guardianEmail',
  'parent email': 'guardianEmail',
  note: 'notes',
  notes: 'notes',
}

const FULL_NAME_HEADERS = new Set(['name', 'full_name', 'full name', 'student_name', 'student name'])
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function nullable(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed || null
}

export function normalizeRosterGender(value: string | null): 'MALE' | 'FEMALE' | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'male' || normalized === 'm' || normalized === 'boy') return 'MALE'
  if (normalized === 'female' || normalized === 'f' || normalized === 'girl') return 'FEMALE'
  return null
}

export function normalizeRosterBirthDate(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()

  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed)
  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed)
  const parts = isoMatch
    ? { year: Number(isoMatch[1]), month: Number(isoMatch[2]), day: Number(isoMatch[3]) }
    : usMatch
      ? { year: Number(usMatch[3]), month: Number(usMatch[1]), day: Number(usMatch[2]) }
      : null

  if (!parts) return null
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  if (
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() !== parts.month - 1 ||
    date.getUTCDate() !== parts.day
  ) return null

  return date.toISOString().slice(0, 10)
}

/** RFC 4180-style CSV reader with quoted commas, escaped quotes, and newlines. */
export function readCsv(text: string): Array<{ rowNumber: number; values: string[] }> {
  const source = text.replace(/^\uFEFF/, '')
  const rows: Array<{ rowNumber: number; values: string[] }> = []
  let values: string[] = []
  let field = ''
  let quoted = false
  let line = 1
  let rowStart = 1

  const finishRow = () => {
    values.push(field)
    if (values.some(value => value.trim())) rows.push({ rowNumber: rowStart, values })
    values = []
    field = ''
    rowStart = line + 1
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      values.push(field)
      field = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1
      finishRow()
      line += 1
    } else {
      field += character
      if (character === '\n') line += 1
    }
  }

  if (field.length > 0 || values.length > 0) finishRow()
  return rows
}

export function validateSundaySchoolRosterRow(
  row: SundaySchoolRosterCsvRow
): SundaySchoolRosterCsvError[] {
  const errors: SundaySchoolRosterCsvError[] = []
  if (!row.firstName.trim()) errors.push({ rowNumber: row.rowNumber, message: 'First name is required' })
  if (!row.lastName.trim()) errors.push({ rowNumber: row.rowNumber, message: 'Last name is required' })
  if (row.firstName.length > 100 || row.lastName.length > 100) {
    errors.push({ rowNumber: row.rowNumber, message: 'Names must be 100 characters or fewer' })
  }
  if (row.birthDate && !normalizeRosterBirthDate(row.birthDate)) {
    errors.push({ rowNumber: row.rowNumber, message: 'Birth date must be YYYY-MM-DD or MM/DD/YYYY' })
  }
  if (row.guardianName && row.guardianName.length > 200) {
    errors.push({ rowNumber: row.rowNumber, message: 'Guardian name must be 200 characters or fewer' })
  }
  if (row.guardianPhone && row.guardianPhone.length > 50) {
    errors.push({ rowNumber: row.rowNumber, message: 'Guardian phone must be 50 characters or fewer' })
  }
  if (row.gender && !normalizeRosterGender(row.gender)) {
    errors.push({ rowNumber: row.rowNumber, message: 'Gender must be Male, Female, Boy, or Girl' })
  }
  if (row.guardianEmail && !EMAIL_PATTERN.test(row.guardianEmail)) {
    errors.push({ rowNumber: row.rowNumber, message: 'Guardian email is invalid' })
  }
  if (row.notes && row.notes.length > 2000) {
    errors.push({ rowNumber: row.rowNumber, message: 'Notes must be 2,000 characters or fewer' })
  }
  return errors
}

export function parseSundaySchoolRosterCsv(text: string): ParsedSundaySchoolRosterCsv {
  const csvRows = readCsv(text)
  if (csvRows.length === 0) {
    return { rows: [], errors: [{ rowNumber: 1, message: 'The CSV file is empty' }] }
  }

  const headers = csvRows[0].values.map(normalizeHeader)
  const fullNameIndex = headers.findIndex(header => FULL_NAME_HEADERS.has(header))
  const mappedHeaders = headers.map(header => HEADER_ALIASES[header] ?? null)
  const hasFirstName = mappedHeaders.includes('firstName')
  const hasLastName = mappedHeaders.includes('lastName')

  if (!(hasFirstName && hasLastName) && fullNameIndex < 0) {
    return {
      rows: [],
      errors: [{
        rowNumber: csvRows[0].rowNumber,
        message: 'Include first_name and last_name columns, or a full_name column',
      }],
    }
  }

  const parsedRows = csvRows.slice(1).map(({ rowNumber, values }) => {
    const fields: Record<string, string> = {}
    mappedHeaders.forEach((header, index) => {
      if (header) fields[header] = values[index]?.trim() ?? ''
    })

    if ((!fields.firstName || !fields.lastName) && fullNameIndex >= 0) {
      const nameParts = (values[fullNameIndex] ?? '').trim().split(/\s+/).filter(Boolean)
      fields.firstName ||= nameParts.slice(0, -1).join(' ')
      fields.lastName ||= nameParts.at(-1) ?? ''
    }

    const row: SundaySchoolRosterCsvRow = {
      rowNumber,
      firstName: fields.firstName ?? '',
      lastName: fields.lastName ?? '',
      gender: nullable(fields.gender) as SundaySchoolRosterCsvRow['gender'],
      birthDate: nullable(fields.birthDate),
      guardianName: nullable(fields.guardianName),
      guardianPhone: nullable(fields.guardianPhone),
      guardianEmail: nullable(fields.guardianEmail)?.toLowerCase() ?? null,
      notes: nullable(fields.notes),
    }
    const normalizedBirthDate = normalizeRosterBirthDate(row.birthDate)
    if (normalizedBirthDate) row.birthDate = normalizedBirthDate
    const normalizedGender = normalizeRosterGender(row.gender)
    if (normalizedGender) row.gender = normalizedGender
    return row
  })

  return {
    rows: parsedRows,
    errors: parsedRows.flatMap(validateSundaySchoolRosterRow),
  }
}

export function createSundaySchoolRosterCsvTemplate() {
  return `${ROSTER_CSV_TEMPLATE_HEADERS.join(',')}\nJane,Doe,Female,2015-04-12,John Doe,555-123-4567,parent@example.com,Allergy information here\n`
}
