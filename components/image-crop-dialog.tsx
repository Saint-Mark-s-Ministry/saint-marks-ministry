'use client'

import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { useModalExit } from '@/hooks/use-modal-exit'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Area {
  x: number
  y: number
  width: number
  height: number
}

interface ImageCropDialogProps {
  imageSrc: string
  onCropComplete: (croppedBlob: Blob) => void
  onCancel: () => void
}

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = reject
    image.src = imageSrc
  })

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  // Output a square image at a reasonable size
  const outputSize = Math.min(pixelCrop.width, 600)
  canvas.width = outputSize
  canvas.height = outputSize

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Failed to crop image'))
      },
      'image/jpeg',
      0.9
    )
  })
}

export function ImageCropDialog({ imageSrc, onCropComplete, onCancel }: ImageCropDialogProps) {
  const exit = useModalExit(onCancel)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)

  const onCropChange = useCallback((location: { x: number; y: number }) => {
    setCrop(location)
  }, [])

  const onZoomChange = useCallback((z: number) => {
    setZoom(z)
  }, [])

  const onCropAreaComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  const handleSave = async () => {
    if (!croppedAreaPixels) return
    setProcessing(true)
    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels)
      exit.close(() => onCropComplete(croppedBlob))
    } catch {
      console.error('Failed to crop image')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Dialog open={!exit.closing} onOpenChange={open => { if (!open) onCancel() }}>
      <DialogContent className="z-[100] gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="p-4 border-b dark:border-gray-700">
          <DialogTitle className="font-semibold text-lg">Crop Profile Photo</DialogTitle>
          <DialogDescription className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Adjust the frame to a close-up of your face
          </DialogDescription>
        </div>

        <div className="relative w-full" style={{ height: '320px' }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropAreaComplete}
          />
        </div>

        <div className="px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 shrink-0">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 h-1.5 accent-maroon-600"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => exit.close()} disabled={processing}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={processing}>
              {processing ? 'Saving...' : 'Save Photo'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
