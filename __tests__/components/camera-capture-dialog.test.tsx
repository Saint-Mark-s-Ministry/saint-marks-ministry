import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CameraCaptureDialog } from '@/components/camera-capture-dialog'

const getUserMedia = vi.fn()
const stop = vi.fn()
const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream
const drawImage = vi.fn()
const photo = new Blob(['camera image'], { type: 'image/jpeg' })
const onCapture = vi.fn()
const onCancel = vi.fn()
const onUpload = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  getUserMedia.mockResolvedValue(stream)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(photo))
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:camera-photo'),
    revokeObjectURL: vi.fn(),
  }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function open() {
  return render(<CameraCaptureDialog name="Mina Gerges" onCapture={onCapture} onCancel={onCancel} onUpload={onUpload} />)
}

async function readyCamera() {
  const video = screen.getByLabelText('Camera preview for Mina Gerges') as HTMLVideoElement
  await waitFor(() => expect(video.srcObject).toBe(stream))
  Object.defineProperties(video, {
    videoWidth: { configurable: true, value: 1920 },
    videoHeight: { configurable: true, value: 1080 },
  })
  fireEvent.loadedData(video)
  return video
}

describe('CameraCaptureDialog', () => {
  it('captures a JPEG in the app, stops the camera, and waits for confirmation', async () => {
    open()
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeDisabled()
    const video = await readyCamera()
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false, video: expect.objectContaining({ facingMode: { ideal: 'environment' } }) }))
    fireEvent.click(screen.getByRole('button', { name: 'Take photo' }))
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1600, 900)
    expect(stop).toHaveBeenCalled()
    expect(screen.getByAltText('Preview of Mina Gerges')).toHaveAttribute('src', 'blob:camera-photo')
    expect(onCapture).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Use photo' }))
    expect(onCapture).toHaveBeenCalledWith(photo)
  })

  it('discards a photo on retake and opens a fresh stream', async () => {
    open()
    await readyCamera()
    fireEvent.click(screen.getByRole('button', { name: 'Take photo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retake' }))
    await readyCamera()
    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:camera-photo')
    expect(onCapture).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Use photo' })).not.toBeInTheDocument()
  })

  it('switches to the front camera and stops the previous stream', async () => {
    open()
    await readyCamera()
    fireEvent.click(screen.getByRole('button', { name: 'Switch camera' }))
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2))
    expect(stop).toHaveBeenCalled()
    expect(getUserMedia.mock.calls[1][0].video.facingMode).toEqual({ ideal: 'user' })
  })

  it('stops a stream that arrives after the dialog was closed', async () => {
    let resolve!: (stream: MediaStream) => void
    getUserMedia.mockReturnValue(new Promise<MediaStream>(done => { resolve = done }))
    const { unmount } = open()
    unmount()
    await act(async () => { resolve(stream) })
    expect(stop).toHaveBeenCalledTimes(1)
    expect(onCapture).not.toHaveBeenCalled()
  })

  it('releases camera access when unmounted and never saves on cancel', async () => {
    const { unmount } = open()
    const video = await readyCamera()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onCapture).not.toHaveBeenCalled()
    unmount()
    expect(stop).toHaveBeenCalledOnce()
    expect(video.srcObject).toBeNull()
  })

  it('discards a pending capture after closing', async () => {
    let finish!: BlobCallback
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(callback => { finish = callback })
    const { unmount } = open()
    await readyCamera()
    fireEvent.click(screen.getByRole('button', { name: 'Take photo' }))
    unmount()
    act(() => finish(photo))
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(onCapture).not.toHaveBeenCalled()
  })

  it.each([
    ['NotAllowedError', /permission was denied/],
    ['NotFoundError', /No camera was found/],
    ['NotReadableError', /camera is busy/],
  ])('handles %s and keeps file upload available', async (name, message) => {
    getUserMedia.mockRejectedValue(new DOMException('Camera failure', name))
    open()
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Upload photo instead' }))
    expect(onUpload).toHaveBeenCalledOnce()
    expect(onCapture).not.toHaveBeenCalled()
  })

  it('handles browsers without camera support', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    open()
    expect(await screen.findByRole('alert')).toHaveTextContent(/Camera access is unavailable/)
    expect(getUserMedia).not.toHaveBeenCalled()
  })
})
