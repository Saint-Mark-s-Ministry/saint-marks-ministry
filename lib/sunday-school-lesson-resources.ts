export interface SundaySchoolLessonResourceInput {
  title: string
  url: string
}

export function validateWeeklyLessonResources(value: unknown):
  | { ok: true; resources: SundaySchoolLessonResourceInput[] }
  | { ok: false; error: string } {
  if (!Array.isArray(value)) {
    return { ok: false, error: "Resources must be an array" }
  }

  const resources: SundaySchoolLessonResourceInput[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Each resource needs a title and URL" }
    }

    const candidate = item as { title?: unknown; url?: unknown }
    const title = typeof candidate.title === "string" ? candidate.title.trim() : ""
    const url = typeof candidate.url === "string" ? candidate.url.trim() : ""
    if (!title || !url) {
      return { ok: false, error: "Each resource needs a title and URL" }
    }

    try {
      const parsed = new URL(url)
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { ok: false, error: "Resource URLs must start with http:// or https://" }
      }
    } catch {
      return { ok: false, error: "Enter a valid resource URL" }
    }

    resources.push({ title, url })
  }

  return { ok: true, resources }
}

export type LessonResourceDraftError = {
  ok: false
  error: string
  index: number
  field: 'title' | 'url'
}

/** Blank spare rows are harmless; partly filled rows must be corrected. */
export function prepareWeeklyLessonResources(drafts: SundaySchoolLessonResourceInput[]):
  | { ok: true; resources: SundaySchoolLessonResourceInput[] }
  | LessonResourceDraftError {
  const resources: SundaySchoolLessonResourceInput[] = []
  for (const [index, draft] of drafts.entries()) {
    const title = draft.title.trim()
    const url = draft.url.trim()
    if (!title && !url) continue
    if (!title) return { ok: false, index, field: 'title', error: `Add a name for link ${index + 1}, such as “Slides”.` }
    if (!url) return { ok: false, index, field: 'url', error: `Paste a web link for link ${index + 1}, or remove this row.` }
    const validated = validateWeeklyLessonResources([{ title, url }])
    if (!validated.ok) return { ok: false, index, field: 'url', error: `Link ${index + 1}: enter a valid http:// or https:// sharing link.` }
    resources.push(...validated.resources)
  }
  return { ok: true, resources }
}
