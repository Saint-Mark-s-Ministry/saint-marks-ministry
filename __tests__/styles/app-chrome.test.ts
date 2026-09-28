import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const globalStyles = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')

describe('global app chrome styles', () => {
  it('keeps the desktop scrollbar gutter stable while overlays are open', () => {
    expect(globalStyles).toMatch(/html\s*{[\s\S]*?overflow-y:\s*scroll;[\s\S]*?scrollbar-gutter:\s*stable;/)
    expect(globalStyles).toMatch(
      /html body\[data-scroll-locked\]\s*{[\s\S]*?overflow-y:\s*scroll\s*!important;[\s\S]*?margin-right:\s*0\s*!important;[\s\S]*?padding-right:\s*0\s*!important;/
    )
  })

  it('uses the shared app canvas behind top-level dashboard pages', () => {
    expect(globalStyles).toContain(
      '.dark #app-content > .min-h-screen.bg-gray-50'
    )
    expect(globalStyles).toContain('background-color: var(--app-canvas);')
  })

  it('provides light and dark chart colors instead of fixed light-theme colors', () => {
    expect(globalStyles.match(/--chart-attendance:/g)).toHaveLength(2)
    expect(globalStyles.match(/--chart-exam:/g)).toHaveLength(2)
    expect(globalStyles.match(/--chart-roster:/g)).toHaveLength(2)
    expect(globalStyles.match(/--chart-target:/g)).toHaveLength(2)
  })
})
