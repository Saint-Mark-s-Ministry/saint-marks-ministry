import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newestReleasesFirst, releaseNotes, type ReleaseNote } from '@/lib/release-notes'

const mocks = vi.hoisted(() => ({ status: 'authenticated' }))
vi.mock('@/hooks/useAdminGuard', () => ({ useAdminGuard: () => ({ status: mocks.status }) }))

import { ReleaseNotesList, WhatsNew } from '@/components/whats-new'

const earlier: ReleaseNote = {
  id: '2026-10-25', date: '2026-10-25', title: 'First weekly update', summary: 'Our first release.',
  changes: { new: ['Weekly release notes for both ministries.'] },
}
const later: ReleaseNote = {
  id: '2026-11-01', date: '2026-11-01', title: 'Second weekly update', summary: 'More improvements.',
  changes: { improved: ['A simpler Sunday School workflow.'], fixed: ['A Servants Prep display issue.'] },
}

beforeEach(() => { mocks.status = 'authenticated' })

describe('What’s new', () => {
  it('shows a clear empty state until the first release is published', () => {
    render(<ReleaseNotesList releases={[]} />)
    expect(screen.getByRole('heading', { name: 'What’s new' })).toBeInTheDocument()
    expect(screen.getByText('Our next update starts here')).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('orders releases newest first without modifying the source history', () => {
    const releases = [earlier, later]
    expect(newestReleasesFirst(releases)).toEqual([later, earlier])
    expect(releases).toEqual([earlier, later])
    render(<ReleaseNotesList releases={releases} />)
    const articles = screen.getAllByRole('article')
    expect(articles[0]).toHaveAccessibleName(later.title)
    expect(within(articles[0]).getByText('Latest update')).toBeInTheDocument()
    expect(within(articles[1]).queryByText('Latest update')).not.toBeInTheDocument()
    expect(within(articles[0]).getByText('November 1, 2026')).toHaveAttribute('datetime', later.date)
    expect(within(articles[0]).getByRole('link', { name: later.title })).toHaveAttribute('href', '#2026-11-01')
  })

  it('shows populated change groups and omits unused groups', () => {
    render(<ReleaseNotesList releases={[later]} />)
    expect(screen.getByRole('region', { name: 'Improved' })).toHaveTextContent(later.changes.improved![0])
    expect(screen.getByRole('region', { name: 'Fixed' })).toHaveTextContent(later.changes.fixed![0])
    expect(screen.queryByRole('region', { name: 'New' })).not.toBeInTheDocument()
  })

  it.each(['loading', 'unauthenticated'])('waits for authentication when session status is %s', status => {
    mocks.status = status
    render(<WhatsNew />)
    expect(screen.queryByRole('heading', { name: 'What’s new' })).not.toBeInTheDocument()
  })

  it('keeps published history well formed as future releases are added', () => {
    expect(new Set(releaseNotes.map(release => release.id)).size).toBe(releaseNotes.length)
    for (const release of releaseNotes) {
      expect(release.id).toMatch(/^[a-z0-9][a-z0-9-]*$/)
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(new Date(`${release.date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(release.date)
      expect(release.title.trim()).not.toBe('')
      expect(release.summary.trim()).not.toBe('')
      const changes = Object.values(release.changes).flat()
      expect(changes.length).toBeGreaterThan(0)
      for (const change of changes) expect(change.trim()).not.toBe('')
    }
  })
})
