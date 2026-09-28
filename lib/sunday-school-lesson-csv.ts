import { readCsv } from './sunday-school-roster-csv'

export const LESSON_CSV_TEMPLATE_HEADERS = [
  'date',
  'name',
  'email',
] as const

export interface SundaySchoolLessonCsvResource {
  title: string
  url: string
}

export interface SundaySchoolLessonCsvRow {
  rowNumber: number
  lessonDate: string
  ownerName: string | null
  ownerEmail: string | null
  title: string | null
  resources: SundaySchoolLessonCsvResource[]
  replaceResources: boolean
}

export interface SundaySchoolLessonCsvError {
  rowNumber: number
  message: string
}

export interface ParsedSundaySchoolLessonCsv {
  rows: SundaySchoolLessonCsvRow[]
  errors: SundaySchoolLessonCsvError[]
  hasResourceColumns: boolean
}

const DATE_HEADERS = new Set([
  'date', 'lesson date', 'lesson_date', 'service date', 'service_date',
  'sunday date', 'sunday_date', 'week',
])
const TITLE_HEADERS = new Set([
  'title', 'lesson', 'lesson title', 'lesson_title', 'topic', 'lesson topic', 'lesson_topic',
])
const OWNER_NAME_HEADERS = new Set([
  'name', 'servant', 'servant name', 'servant_name', 'teacher', 'teacher name', 'teacher_name',
  'assigned to', 'assigned_to', 'owner', 'owner name', 'owner_name',
])
const OWNER_EMAIL_HEADERS = new Set([
  'email', 'servant email', 'servant_email', 'teacher email', 'teacher_email',
  'owner email', 'owner_email',
])
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DIRECT_RESOURCE_HEADERS: Record<string, string> = {
  link: 'Resource',
  url: 'Resource',
  resource: 'Resource',
  resource_link: 'Resource',
  'resource link': 'Resource',
  slides: 'Slides',
  slides_link: 'Slides',
  'slides link': 'Slides',
  slides_url: 'Slides',
  'slides url': 'Slides',
  powerpoint: 'PowerPoint',
  powerpoint_link: 'PowerPoint',
  'powerpoint link': 'PowerPoint',
  video: 'Video',
  video_link: 'Video',
  'video link': 'Video',
  worksheet: 'Worksheet',
  worksheet_link: 'Worksheet',
  'worksheet link': 'Worksheet',
  document: 'Document',
  document_link: 'Document',
  'document link': 'Document',
}
const DIRECT_RESOURCE_SLOTS: Record<string, number> = {
  Resource: 0,
  Slides: 20,
  PowerPoint: 21,
  Video: 22,
  Worksheet: 23,
  Document: 24,
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function normalizeLessonDate(value: string): string | null {
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

function resourceColumn(header: string): { slot: number; kind: 'title' | 'url'; fallbackTitle?: string } | null {
  if (DIRECT_RESOURCE_HEADERS[header]) {
    const fallbackTitle = DIRECT_RESOURCE_HEADERS[header]
    return { slot: DIRECT_RESOURCE_SLOTS[fallbackTitle], kind: 'url', fallbackTitle }
  }

  const compact = header.replace(/[ -]+/g, '_')
  const numbered = /^(?:resource|link)_(\d+)_(title|name|url|link)$/.exec(compact)
  if (numbered) {
    return {
      slot: Math.max(0, Number(numbered[1]) - 1),
      kind: numbered[2] === 'title' || numbered[2] === 'name' ? 'title' : 'url',
    }
  }

  if (compact === 'resource_title' || compact === 'link_title') return { slot: 0, kind: 'title' }
  if (compact === 'resource_url' || compact === 'link_url') return { slot: 0, kind: 'url', fallbackTitle: 'Resource' }
  return null
}

function validWebUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function validateSundaySchoolLessonRow(row: SundaySchoolLessonCsvRow): SundaySchoolLessonCsvError[] {
  const errors: SundaySchoolLessonCsvError[] = []
  if (!normalizeLessonDate(row.lessonDate)) {
    errors.push({ rowNumber: row.rowNumber, message: 'Date must be YYYY-MM-DD or MM/DD/YYYY' })
  }
  if (!row.ownerName && !row.ownerEmail && !row.title) {
    errors.push({ rowNumber: row.rowNumber, message: 'Include a servant name, email, or lesson title' })
  }
  if (row.ownerName && row.ownerName.length > 200) {
    errors.push({ rowNumber: row.rowNumber, message: 'Servant name must be 200 characters or fewer' })
  }
  if (row.ownerEmail && !EMAIL_PATTERN.test(row.ownerEmail)) {
    errors.push({ rowNumber: row.rowNumber, message: 'Servant email is invalid' })
  }
  if (row.title && row.title.length > 255) {
    errors.push({ rowNumber: row.rowNumber, message: 'Lesson title must be 255 characters or fewer' })
  }
  if (row.resources.length > 10) {
    errors.push({ rowNumber: row.rowNumber, message: 'Each lesson can include up to 10 links' })
  }
  for (const resource of row.resources) {
    if (!resource.title.trim()) {
      errors.push({ rowNumber: row.rowNumber, message: 'Each link needs a title' })
    }
    if (!validWebUrl(resource.url)) {
      errors.push({ rowNumber: row.rowNumber, message: 'Resource links must be valid http:// or https:// URLs' })
    }
  }
  return errors
}

export function parseSundaySchoolLessonCsv(text: string): ParsedSundaySchoolLessonCsv {
  const csvRows = readCsv(text)
  if (csvRows.length === 0) {
    return {
      rows: [],
      errors: [{ rowNumber: 1, message: 'The CSV file is empty' }],
      hasResourceColumns: false,
    }
  }

  const headers = csvRows[0].values.map(normalizeHeader)
  const dateIndex = headers.findIndex(header => DATE_HEADERS.has(header))
  const titleIndex = headers.findIndex(header => TITLE_HEADERS.has(header))
  const ownerNameIndex = headers.findIndex(header => OWNER_NAME_HEADERS.has(header))
  const ownerEmailIndex = headers.findIndex(header => OWNER_EMAIL_HEADERS.has(header))
  const resourceColumns = headers
    .map((header, index) => ({ index, column: resourceColumn(header) }))
    .filter((item): item is { index: number; column: NonNullable<ReturnType<typeof resourceColumn>> } => Boolean(item.column))

  const headerErrors: SundaySchoolLessonCsvError[] = []
  if (dateIndex < 0) headerErrors.push({ rowNumber: csvRows[0].rowNumber, message: 'Include a date column' })
  if (ownerNameIndex < 0 && ownerEmailIndex < 0 && titleIndex < 0) {
    headerErrors.push({
      rowNumber: csvRows[0].rowNumber,
      message: 'Include a name, email, or lesson title column',
    })
  }
  if (headerErrors.length > 0) {
    return { rows: [], errors: headerErrors, hasResourceColumns: resourceColumns.length > 0 }
  }

  const parsedRows = csvRows.slice(1).map(({ rowNumber, values }) => {
    const resourceSlots = new Map<number, { title?: string; url?: string; fallbackTitle?: string }>()
    for (const { index, column } of resourceColumns) {
      const slot = resourceSlots.get(column.slot) ?? {}
      const value = values[index]?.trim() ?? ''
      if (column.kind === 'title') slot.title = value
      else slot.url = value
      if (column.fallbackTitle) slot.fallbackTitle = column.fallbackTitle
      resourceSlots.set(column.slot, slot)
    }

    const resources = Array.from(resourceSlots.entries())
      .sort(([left], [right]) => left - right)
      .flatMap(([, resource]) => resource.url
        ? [{ title: resource.title || resource.fallbackTitle || 'Resource', url: resource.url }]
        : resource.title
          ? [{ title: resource.title, url: '' }]
          : [])
    const normalizedDate = normalizeLessonDate(values[dateIndex]?.trim() ?? '')

    return {
      rowNumber,
      lessonDate: normalizedDate ?? values[dateIndex]?.trim() ?? '',
      ownerName: ownerNameIndex >= 0 ? values[ownerNameIndex]?.trim() || null : null,
      ownerEmail: ownerEmailIndex >= 0 ? values[ownerEmailIndex]?.trim().toLowerCase() || null : null,
      title: titleIndex >= 0 ? values[titleIndex]?.trim() || null : null,
      resources,
      replaceResources: resourceColumns.length > 0,
    }
  })

  return {
    rows: parsedRows,
    errors: parsedRows.flatMap(validateSundaySchoolLessonRow),
    hasResourceColumns: resourceColumns.length > 0,
  }
}

export function createSundaySchoolLessonCsvTemplate() {
  return `${LESSON_CSV_TEMPLATE_HEADERS.join(',')}\n2026-09-27,Jane Servant,servant@example.com\n2026-10-04,John Servant,\n`
}
