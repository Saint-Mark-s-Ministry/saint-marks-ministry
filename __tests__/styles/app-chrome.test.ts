import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const globalStyles = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
const adminSettingsPage = readFileSync(
  join(process.cwd(), 'app/dashboard/admin/settings/page.tsx'),
  'utf8'
)

describe('global app chrome styles', () => {
  it('keeps the desktop gutter and sticky sidebar stable while overlays lock scrolling', () => {
    expect(globalStyles).toMatch(/html\s*{[\s\S]*?overflow-y:\s*scroll;[\s\S]*?scrollbar-gutter:\s*stable;/)
    const lockedBodyRule = globalStyles.match(/html body\[data-scroll-locked\]\s*{([^}]*)}/)?.[1]

    expect(lockedBodyRule).toContain('margin-right: 0 !important;')
    expect(lockedBodyRule).toContain('padding-right: 0 !important;')
    expect(globalStyles).toMatch(/html:has\(body\[data-scroll-locked\]\)\s*{\s*overflow-y:\s*hidden;/)
    expect(globalStyles).toMatch(/html body\[data-scroll-locked\]\s*{\s*overflow:\s*clip !important;/)
  })

  it('uses the shared app canvas behind top-level dashboard pages', () => {
    expect(globalStyles).toContain(
      '.dark #app-content > .min-h-screen.bg-gray-50'
    )
    expect(globalStyles).toContain('background-color: var(--app-canvas);')
  })

  it('provides light and dark chart colors instead of fixed light-theme colors', () => {
    // light, dark, and the Sunday School override (gold attendance line)
    expect(globalStyles.match(/--chart-attendance:/g)).toHaveLength(3)
    expect(globalStyles.match(/--chart-exam:/g)).toHaveLength(2)
    expect(globalStyles.match(/--chart-roster:/g)).toHaveLength(2)
    expect(globalStyles.match(/--chart-target:/g)).toHaveLength(2)
  })

  it('lets the admin settings page use the full application canvas', () => {
    expect(adminSettingsPage).toContain('<div className="w-full space-y-5">')
    expect(adminSettingsPage).not.toContain('max-w-4xl')
  })
})
