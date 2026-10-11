'use client'

import { Suspense, useState } from 'react'
import { PageLoading } from '@/components/ui/page-loading'
import { useSearchParams, useRouter } from 'next/navigation'

function previewUrl(id: string, mimeType: string): string {
  if (mimeType === 'application/vnd.google-apps.document')
    return `https://docs.google.com/document/d/${id}/preview`
  if (mimeType === 'application/vnd.google-apps.presentation')
    return `https://docs.google.com/presentation/d/${id}/preview`
  if (mimeType === 'application/vnd.google-apps.spreadsheet')
    return `https://docs.google.com/spreadsheets/d/${id}/preview`
  return `https://drive.google.com/file/d/${id}/preview`
}

function FilePreview() {
  const params = useSearchParams()
  const router = useRouter()
  const [loaded, setLoaded] = useState(false)

  const id = params.get('id') ?? ''
  const name = params.get('name') ?? 'File'
  const mimeType = params.get('mimeType') ?? ''
  const webViewLink = params.get('webViewLink') ?? ''

  if (!id) {
    router.replace('/dashboard/files')
    return <PageLoading />
  }

  return (
    // Subtract the sticky navbar height (h-16 = 4rem = 64px).
    // Using dvh so the calculation stays correct as mobile browser chrome
    // appears/disappears while scrolling.
    <div className="flex flex-col bg-white dark:bg-gray-900" style={{ height: 'calc(100dvh - 4rem)' }}>
      {/* Header — rendered as a sibling above the iframe, never covered by it */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0">
        <button
          onClick={() => router.back()}
          style={{ touchAction: 'manipulation' }}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-300 shrink-0"
          aria-label="Back"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <p className="flex-1 text-sm font-semibold text-gray-900 dark:text-white truncate min-w-0">
          {name}
        </p>

        {webViewLink && (
          <a
            href={webViewLink}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Drive"
            style={{ touchAction: 'manipulation' }}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400 shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>

      {/* Full-page iframe — occupies all remaining height with no competing
          scroll container, so iOS touch events work normally */}
      <div className="relative flex-1">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-800">
            <div className="w-7 h-7 border-2 border-maroon-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <iframe
          src={previewUrl(id, mimeType)}
          className="w-full h-full border-0"
          onLoad={() => setLoaded(true)}
          allow="autoplay"
          title={name}
        />
      </div>
    </div>
  )
}

export default function FilePreviewPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <FilePreview />
    </Suspense>
  )
}
