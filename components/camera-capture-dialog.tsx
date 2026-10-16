'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, RefreshCw, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

/** Camera access is requested only while this dialog is mounted. */
export function CameraCaptureDialog({ name, onCapture, onCancel, onUpload }: {
  name: string
  onCapture: (photo: Blob) => void
  onCancel: () => void
  onUpload: () => void
}) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [attempt, setAttempt] = useState(0)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null)
  const [capturing, setCapturing] = useState(false)

  useEffect(() => {
    // Radix mounts portal contents after the parent effect. Wait for the video.
    if (photo || !video) return
    let cancelled = false
    let stream: MediaStream | null = null

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access is unavailable. Open the app over HTTPS in a supported browser, or upload a photo.')
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop())
          return
        }
        streamRef.current = stream
        video.srcObject = stream
        await video.play()
      } catch (cause: unknown) {
        stream?.getTracks().forEach(track => track.stop())
        if (cancelled) return
        const code = cause instanceof Error || cause instanceof DOMException ? cause.name : ''
        setError(code === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser settings and try again, or upload a photo.'
          : code === 'NotFoundError'
            ? 'No camera was found on this device. You can upload a photo instead.'
            : code === 'NotReadableError'
              ? 'The camera is busy. Close other apps using it and try again, or upload a photo.'
              : 'Camera access is unavailable. Open the app over HTTPS in a supported browser, or upload a photo.')
      }
    }
    void start()

    return () => {
      cancelled = true
      stream?.getTracks().forEach(track => track.stop())
      streamRef.current = null
      video.srcObject = null
    }
  }, [facingMode, attempt, photo, video])

  useEffect(() => {
    return () => { if (photo) URL.revokeObjectURL(photo.url) }
  }, [photo])

  const restart = (switchCamera = false) => {
    setReady(false)
    setCapturing(false)
    setError(null)
    setPhoto(null)
    if (switchCamera) setFacingMode(mode => mode === 'environment' ? 'user' : 'environment')
    setAttempt(value => value + 1)
  }

  const capture = () => {
    const stream = streamRef.current
    if (!video || !stream || !ready || !video.videoWidth || !video.videoHeight) return
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const context = canvas.getContext('2d')
    if (!context) {
      setError('Could not take the photo. Try again or upload a photo.')
      return
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    setCapturing(true)
    canvas.toBlob(blob => {
      // Closing the dialog or switching cameras discards a pending capture.
      if (streamRef.current !== stream) return
      setCapturing(false)
      if (!blob) {
        setError('Could not take the photo. Try again or upload a photo.')
        return
      }
      stream.getTracks().forEach(track => track.stop())
      setPhoto({ blob, url: URL.createObjectURL(blob) })
    }, 'image/jpeg', 0.9)
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onCancel() }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Take a photo</DialogTitle>
          <DialogDescription>{name}: frame their face, then take a photo. You can retake it before saving.</DialogDescription>
        </DialogHeader>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- local camera preview
          <img src={photo.url} alt={`Preview of ${name}`} className="aspect-square w-full rounded-lg bg-black object-contain" />
        ) : (
          <div className="relative aspect-square overflow-hidden rounded-lg bg-black">
            <video ref={setVideo} autoPlay playsInline muted aria-label={`Camera preview for ${name}`}
              onLoadedData={() => setReady(true)} className="h-full w-full object-contain" />
            {!ready && !error && <p role="status" className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white">Waiting for camera access…</p>}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {!photo && <Button type="button" variant="outline" size="sm" disabled={!ready || capturing} onClick={() => restart(true)}><RefreshCw />Switch camera</Button>}
          {error && <Button type="button" variant="outline" size="sm" onClick={() => restart()}>Try again</Button>}
          <Button type="button" variant="ghost" size="sm" onClick={onUpload}><Upload />Upload photo instead</Button>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          {photo ? <>
            <Button type="button" variant="outline" onClick={() => restart()}>Retake</Button>
            <Button type="button" onClick={() => onCapture(photo.blob)}>Use photo</Button>
          </> : <Button type="button" disabled={!ready || capturing || !!error} onClick={capture}><Camera />{capturing ? 'Capturing…' : 'Take photo'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
