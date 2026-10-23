import { describe, expect, it } from 'vitest'
import { blobUploadExtension, blobUploadTarget } from '@/lib/blob-upload'

describe('blobUploadTarget', () => {
  it('derives the extension from the validated MIME type, not the client file name', () => {
    const file = new File(['<script>alert(1)</script>'], 'photo.html', { type: 'image/png' })
    expect(blobUploadTarget('profile-pictures/user-1', file)).toEqual({
      pathname: 'profile-pictures/user-1.png',
      contentType: 'image/png',
    })
  })

  it('normalizes the non-standard image/jpg type', () => {
    expect(blobUploadTarget('slips/x', { type: 'image/jpg' })).toEqual({
      pathname: 'slips/x.jpg',
      contentType: 'image/jpeg',
    })
  })

  it('refuses types outside the upload allowlist', () => {
    expect(() => blobUploadExtension('text/html')).toThrow()
    expect(() => blobUploadExtension('image/svg+xml')).toThrow()
  })
})
