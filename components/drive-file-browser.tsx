'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { DriveFile } from '@/lib/drive'
import { mimeLabel, isFolder, formatSize, formatDate } from '@/lib/drive'
import {
  DRIVE_PATH_STORAGE_KEY,
  DRIVE_ROOT_CRUMB,
  parseStoredCrumbs,
  serializeCrumbs,
  type DriveCrumb,
} from '@/lib/drive-folders'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

function previewUrl(file: DriveFile): string {
  const { id, mimeType } = file
  if (mimeType === 'application/vnd.google-apps.document')
    return `https://docs.google.com/document/d/${id}/preview`
  if (mimeType === 'application/vnd.google-apps.presentation')
    return `https://docs.google.com/presentation/d/${id}/preview`
  if (mimeType === 'application/vnd.google-apps.spreadsheet')
    return `https://docs.google.com/spreadsheets/d/${id}/preview`
  return `https://drive.google.com/file/d/${id}/preview`
}

function FileIcon({ mimeType }: { mimeType: string }) {
  const base = 'w-5 h-5 shrink-0'

  if (isFolder(mimeType))
    return (
      <svg className={`${base} text-yellow-400`} fill="currentColor" viewBox="0 0 24 24">
        <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
      </svg>
    )

  if (mimeType === 'application/pdf')
    return (
      <svg className={`${base} text-red-500`} fill="currentColor" viewBox="0 0 24 24">
        <path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7H20.5v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z" />
      </svg>
    )

  if (mimeType.includes('video'))
    return (
      <svg className={`${base} text-blue-500`} fill="currentColor" viewBox="0 0 24 24">
        <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
      </svg>
    )

  if (mimeType.includes('audio'))
    return (
      <svg className={`${base} text-purple-500`} fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
      </svg>
    )

  if (mimeType.includes('presentation') || mimeType.includes('powerpoint'))
    return (
      <svg className={`${base} text-orange-500`} fill="currentColor" viewBox="0 0 24 24">
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
      </svg>
    )

  if (mimeType.includes('word') || mimeType.includes('document'))
    return (
      <svg className={`${base} text-blue-600`} fill="currentColor" viewBox="0 0 24 24">
        <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM9 13h6v2H9zm0 4h6v2H9zm0-8h4v2H9z" />
      </svg>
    )

  return (
    <svg className={`${base} text-gray-400`} fill="currentColor" viewBox="0 0 24 24">
      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
    </svg>
  )
}

function PreviewPanel({ file, onClose }: { file: DriveFile; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => setLoaded(false), [file.id])

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <FileIcon mimeType={file.mimeType} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {file.name}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {mimeLabel(file.mimeType)}
            {file.size ? ` · ${formatSize(file.size)}` : ''}
            {' · '}{formatDate(file.modifiedTime)}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <a
            href={file.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Drive"
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 hover:text-maroon-600"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          <button
            onClick={onClose}
            title="Close preview"
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 hover:text-maroon-600"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* iframe preview */}
      <div className="relative flex-1 bg-gray-50 dark:bg-gray-800">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-maroon-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <iframe
          key={file.id}
          src={previewUrl(file)}
          className="w-full h-full border-0"
          style={{ minHeight: 480 }}
          onLoad={() => setLoaded(true)}
          allow="autoplay"
          title={file.name}
        />
      </div>
    </div>
  )
}

export default function DriveFileBrowser() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const [crumbs, setCrumbs] = useState<DriveCrumb[]>([DRIVE_ROOT_CRUMB])
  const [restored, setRestored] = useState(false)

  // Reopen the folder this tab was last in: on phones a file preview is its
  // own page, and coming back from it used to drop people at the root.
  // Read after mount so the server and first client render agree.
  useEffect(() => {
    try {
      setCrumbs(parseStoredCrumbs(window.sessionStorage.getItem(DRIVE_PATH_STORAGE_KEY)))
    } catch {
      // Storage unavailable (private mode): start at the root.
    }
    setRestored(true)
  }, [])

  useEffect(() => {
    if (!restored) return
    try {
      window.sessionStorage.setItem(DRIVE_PATH_STORAGE_KEY, serializeCrumbs(crumbs))
    } catch {
      // Not persisted; navigation still works.
    }
  }, [crumbs, restored])
  const [files, setFiles] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<DriveFile | null>(null)

  const current = crumbs[crumbs.length - 1]

  // On mobile, navigate to the full-page preview route instead of opening a
  // modal — iframes inside modals capture all touch events on mobile browsers,
  // making the page freeze and impossible to close.
  const openFile = (file: DriveFile) => {
    if (isMobile) {
      const params = new URLSearchParams({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        webViewLink: file.webViewLink ?? '',
      })
      router.push(`/dashboard/files/preview?${params}`)
    } else {
      setSelected(file)
    }
  }

  useEffect(() => {
    if (!restored) return
    // Only the latest folder's response may land: without this, opening one
    // folder and then another before the first loads shows the wrong contents.
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    setSearch('')
    setSelected(null)
    const params = new URLSearchParams({ folderId: current.id })
    if (current.resourceKey) params.set('resourceKey', current.resourceKey)
    fetch(`/api/drive?${params}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Drive listing failed: ${res.status}`)
        const data = await res.json()
        if (controller.signal.aborted) return
        setFiles(data.files ?? [])
        setLoading(false)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setFiles([])
        setError(true)
        setLoading(false)
      })
    return () => controller.abort()
  }, [current.id, current.resourceKey, restored])

  // Prevent body scroll while preview is open (critical on mobile)
  useEffect(() => {
    if (selected) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [selected])

  const openFolder = (f: DriveFile) =>
    setCrumbs((prev) => [...prev, { id: f.id, name: f.name }])

  const goToCrumb = (i: number) =>
    setCrumbs((prev) => (i < prev.length - 1 ? prev.slice(0, i + 1) : prev))

  const filtered = files.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  )
  const rows = [
    ...filtered.filter((f) => isFolder(f.mimeType)),
    ...filtered.filter((f) => !isFolder(f.mimeType)),
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 flex-wrap text-sm">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <span key={`${i}-${crumb.id}`} className="flex items-center gap-1">
              {i > 0 && (
                <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
              {isLast ? (
                <span className="font-semibold text-gray-900 dark:text-white">{crumb.name}</span>
              ) : (
                <button
                  onClick={() => goToCrumb(i)}
                  className="text-gray-500 hover:text-maroon-600 dark:text-gray-400 dark:hover:text-maroon-400 transition-colors"
                >
                  {crumb.name}
                </button>
              )}
            </span>
          )
        })}
        {crumbs.length > 1 && (
          <button
            onClick={() => goToCrumb(0)}
            className="ml-2 text-xs text-gray-500 hover:text-maroon-600 dark:text-gray-400 dark:hover:text-maroon-400 transition-colors"
          >
            ↩ Back to root
          </button>
        )}
      </nav>

      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search files…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-maroon-600 dark:focus:border-maroon-400 transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* File list */}
      <div className="flex flex-col gap-0.5">
        {loading && (
          <div className="py-16 flex justify-center">
            <div className="w-6 h-6 border-2 border-maroon-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            Failed to load files. Please try again.
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            {search ? `No files match "${search}"` : 'This folder is empty.'}
          </div>
        )}

        {!loading && rows.map((file) => {
          const folder = isFolder(file.mimeType)
          const isSelected = selected?.id === file.id

          return (
            <div
              key={file.id}
              onClick={() => folder ? openFolder(file) : openFile(file)}
              className={[
                'group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors border-l-2',
                isSelected
                  ? 'bg-maroon-50 dark:bg-maroon-950/30 border-maroon-600 dark:border-maroon-400 pl-2.5'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800 border-transparent pl-2.5',
              ].join(' ')}
            >
              <FileIcon mimeType={file.mimeType} />

              <div className="flex-1 min-w-0">
                <p className={[
                  'text-sm truncate',
                  isSelected
                    ? 'font-semibold text-maroon-700 dark:text-maroon-300'
                    : 'font-medium text-gray-800 dark:text-gray-200 group-hover:text-maroon-600 dark:group-hover:text-maroon-400',
                ].join(' ')}>
                  {file.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {mimeLabel(file.mimeType)}
                  {file.size ? ` · ${formatSize(file.size)}` : ''}
                  {!folder && ` · ${formatDate(file.modifiedTime)}`}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {!folder && (
                  <button
                    onClick={(e) => { e.stopPropagation(); openFile(file) }}
                    title="Preview"
                    className="p-1.5 rounded hover:bg-white dark:hover:bg-gray-700 text-gray-400 hover:text-maroon-600 dark:hover:text-maroon-400 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                )}
                <a
                  href={file.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title="Open in Drive"
                  className="p-1.5 rounded hover:bg-white dark:hover:bg-gray-700 text-gray-400 hover:text-maroon-600 dark:hover:text-maroon-400 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
                {folder && (
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            </div>
          )
        })}

        {!loading && !error && rows.length > 0 && (
          <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
            {rows.length} {rows.length === 1 ? 'item' : 'items'}
            {search && ` matching "${search}"`}
          </p>
        )}
      </div>

      {/* Preview overlay */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)', touchAction: 'manipulation' }}
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ height: 'min(85vh, 700px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <PreviewPanel file={selected} onClose={() => setSelected(null)} />
          </div>
        </div>
      )}
    </div>
  )
}
