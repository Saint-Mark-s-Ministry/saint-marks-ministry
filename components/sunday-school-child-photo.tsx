'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Camera, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Initials } from '@/components/ds/person'
import { ImageCropDialog } from '@/components/image-crop-dialog'
import { CameraCaptureDialog } from '@/components/camera-capture-dialog'

/**
 * Add, change or remove a Sunday School child's photo, so servants can put
 * names to faces. Capture in the app or choose a file, then crop before saving.
 */
export function ChildPhotoField({
  childId,
  name,
  photoUrl,
  accountPhotoUrl,
  onChange,
  compact = false,
}: {
  childId: string
  name: string
  /** The photo servants added (removable). */
  photoUrl: string | null
  /** The child's own account photo, shown when none was added. */
  accountPhotoUrl?: string | null
  onChange: (photoUrl: string | null) => void
  /** Camera shortcut for a roster row; full controls remain in the editor. */
  compact?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)

  useEffect(() => {
    return () => { if (cropSrc) URL.revokeObjectURL(cropSrc) }
  }, [cropSrc])

  const pick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Choose a photo')
      return
    }
    setCropSrc(URL.createObjectURL(file))
  }

  const closeCrop = () => {
    setCropSrc(null)
  }

  const upload = async (blob: Blob) => {
    closeCrop()
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
      const res = await fetch(`/api/sunday-school/children/${childId}/photo`, { method: 'POST', body })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save the photo')
      onChange(data.photoUrl)
      toast.success('Photo saved')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Could not save the photo')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/sunday-school/children/${childId}/photo`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not remove the photo')
      onChange(null)
      toast.success('Photo removed')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the photo')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={compact ? 'contents' : 'flex items-center gap-4'}>
      {!compact && <Initials name={name} imageUrl={photoUrl ?? accountPhotoUrl} size={64} />}
      {compact ? (
        <Button type="button" variant="ghost" size="icon-sm" disabled={busy || !!cropSrc} aria-label={`Take photo of ${name}`} title={`Take photo of ${name}`} onClick={() => setCameraOpen(true)}>
          <Camera />
        </Button>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy || !!cropSrc} onClick={() => setCameraOpen(true)}>
              <Camera />
              Take photo
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy || !!cropSrc} onClick={() => inputRef.current?.click()}>
              <Upload />
              Upload photo
            </Button>
            {photoUrl && (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={remove}>
                <Trash2 />
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-ink-3">
            {busy ? 'Saving…' : !photoUrl && accountPhotoUrl ? 'Showing the photo from their account.' : 'Helps servants learn names.'}
          </p>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={pick} />
      {cameraOpen && <CameraCaptureDialog
        name={name}
        onCancel={() => setCameraOpen(false)}
        onCapture={blob => {
          setCropSrc(URL.createObjectURL(blob))
          setCameraOpen(false)
        }}
        onUpload={() => {
          setCameraOpen(false)
          inputRef.current?.click()
        }}
      />}
      {cropSrc && <ImageCropDialog imageSrc={cropSrc} onCropComplete={upload} onCancel={closeCrop} />}
    </div>
  )
}
