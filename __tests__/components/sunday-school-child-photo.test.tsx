import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/camera-capture-dialog', () => ({
  CameraCaptureDialog: ({ onCapture, onCancel }: { onCapture: (blob: Blob) => void; onCancel: () => void }) => (
    <div>
      <button onClick={() => onCapture(new Blob(['capture'], { type: 'image/jpeg' }))}>Use photo</button>
      <button onClick={onCancel}>Cancel camera</button>
    </div>
  ),
}))
vi.mock('@/components/image-crop-dialog', () => ({
  ImageCropDialog: ({ onCropComplete, onCancel }: { onCropComplete: (blob: Blob) => void; onCancel: () => void }) => (
    <div>
      <button onClick={() => onCropComplete(new Blob(['cropped'], { type: 'image/jpeg' }))}>Save photo</button>
      <button onClick={onCancel}>Cancel crop</button>
    </div>
  ),
}))

import { ChildPhotoField } from '@/components/sunday-school-child-photo'
import { toast } from 'sonner'

const onChange = vi.fn()
const fetchMock = vi.fn()
const props = { childId: 'child-1', name: 'Mina Gerges', photoUrl: null, onChange }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ photoUrl: 'https://blob.example/photo.jpg' }) })
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:photo'), revokeObjectURL: vi.fn() }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ChildPhotoField', () => {
  it('takes a photo from the roster shortcut and saves only after cropping', async () => {
    render(<ChildPhotoField {...props} compact />)
    fireEvent.click(screen.getByRole('button', { name: 'Take photo of Mina Gerges' }))
    fireEvent.click(screen.getByRole('button', { name: 'Use photo' }))
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save photo' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('https://blob.example/photo.jpg'))
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/sunday-school/children/child-1/photo')
    expect(options.method).toBe('POST')
    const file = options.body.get('file') as File
    expect(file.type).toBe('image/jpeg')
    expect(file.name).toBe('photo.jpg')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo')
  })

  it('keeps file uploads available through the same crop and save flow', async () => {
    const { container } = render(<ChildPhotoField {...props} />)
    const input = container.querySelector('input')!
    const click = vi.spyOn(input, 'click')
    fireEvent.click(screen.getByRole('button', { name: 'Upload photo' }))
    expect(click).toHaveBeenCalledOnce()
    fireEvent.change(input, { target: { files: [new File(['image'], 'student.png', { type: 'image/png' })] } })
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save photo' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce())
  })

  it('never writes on camera or crop cancellation', () => {
    render(<ChildPhotoField {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Take photo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel camera' }))
    fireEvent.click(screen.getByRole('button', { name: 'Take photo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Use photo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel crop' }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo')
  })

  it('shows save errors without changing the roster photo', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Forbidden' }) })
    render(<ChildPhotoField {...props} compact />)
    fireEvent.click(screen.getByRole('button', { name: 'Take photo of Mina Gerges' }))
    fireEvent.click(screen.getByRole('button', { name: 'Use photo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save photo' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Forbidden'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
