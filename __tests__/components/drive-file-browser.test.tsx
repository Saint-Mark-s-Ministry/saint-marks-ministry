import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DRIVE_FOLDER_ID, DRIVE_PATH_STORAGE_KEY } from '@/lib/drive-folders'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
import DriveFileBrowser from '@/components/drive-file-browser'

const YEAR_ONE = '1YearOneFolderAbCdEfGh'
const YEAR_TWO = '1YearTwoFolderAbCdEfGh'
const folder = (id: string, name: string) => ({ id, name, mimeType: 'application/vnd.google-apps.folder', webViewLink: '', iconLink: '', modifiedTime: '2026-09-01T00:00:00Z' })
const file = (id: string, name: string) => ({ id, name, mimeType: 'application/pdf', webViewLink: '', iconLink: '', modifiedTime: '2026-09-02T00:00:00Z' })
const TREE: Record<string, unknown[]> = {
  [DRIVE_FOLDER_ID]: [folder(YEAR_ONE, 'Year 1'), folder(YEAR_TWO, 'Year 2')],
  [YEAR_ONE]: [file('one', 'Lesson 1.pdf')],
  [YEAR_TWO]: [file('nine', 'Lesson 9.pdf')],
}

describe('DriveFileBrowser', () => {
  // Responses for a folder can be held back to simulate a slow Drive call.
  const held = new Map<string, () => void>()
  const holdFolder = new Set<string>()

  beforeEach(() => {
    window.sessionStorage.clear()
    held.clear()
    holdFolder.clear()
    vi.stubGlobal('fetch', vi.fn((input: string, init?: RequestInit) => {
      const id = new URL(input, 'http://localhost').searchParams.get('folderId') ?? ''
      const respond = () => Response.json({ files: TREE[id] ?? [] })
      if (!holdFolder.has(id)) return Promise.resolve(respond())
      return new Promise<Response>((resolve, reject) => {
        held.set(id, () => resolve(respond()))
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('shows the folder you are in, even when an earlier folder answers late', async () => {
    const user = userEvent.setup()
    render(<DriveFileBrowser />)
    await screen.findByText('Year 1')

    holdFolder.add(YEAR_ONE)
    await user.click(screen.getByText('Year 1'))
    // Back to the root before Year 1 has loaded…
    await user.click(screen.getByRole('button', { name: 'Files' }))
    await screen.findByText('Year 2')
    // …then Year 1's response finally arrives.
    await act(async () => held.get(YEAR_ONE)?.())

    expect(screen.queryByText('Lesson 1.pdf')).not.toBeInTheDocument()
    expect(screen.getByText('Year 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Files' })).not.toBeInTheDocument() // at the root, "Files" is plain text
  })

  it('reopens the folder this tab was last in', async () => {
    window.sessionStorage.setItem(DRIVE_PATH_STORAGE_KEY, JSON.stringify([{ id: YEAR_TWO, name: 'Year 2' }]))
    render(<DriveFileBrowser />)
    await screen.findByText('Lesson 9.pdf')
    expect(screen.getByRole('button', { name: 'Files' })).toBeInTheDocument()
  })

  it('remembers where you navigate to', async () => {
    const user = userEvent.setup()
    render(<DriveFileBrowser />)
    await user.click(await screen.findByText('Year 2'))
    await screen.findByText('Lesson 9.pdf')
    await waitFor(() =>
      expect(JSON.parse(window.sessionStorage.getItem(DRIVE_PATH_STORAGE_KEY) ?? '[]')).toEqual([{ id: YEAR_TWO, name: 'Year 2' }])
    )
  })

  it('says loading failed instead of showing an empty folder', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 502 }))))
    render(<DriveFileBrowser />)
    expect(await screen.findByText('Failed to load files. Please try again.')).toBeInTheDocument()
    expect(screen.queryByText('This folder is empty.')).not.toBeInTheDocument()
  })
})
