// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { decryptPrepGuideAsset, encryptPrepGuideAsset, prepGuideMediaKey } from '@/lib/sp-guide-encryption'

const key = Buffer.alloc(32, 7)
const source = Buffer.from('Private staff training content')
describe('staff guide encrypted bundles', () => {
  it('uses a fresh nonce and authenticates a complete round trip', () => {
    const a = encryptPrepGuideAsset(source, key, 'attendance.mp4')
    const b = encryptPrepGuideAsset(source, key, 'attendance.mp4')
    expect(a.equals(b)).toBe(false)
    expect(a.includes(source)).toBe(false)
    expect(decryptPrepGuideAsset(a, key, 'attendance.mp4')).toEqual(source)
  })
  it('rejects wrong keys, changed content, and a substituted filename', () => {
    const sealed = encryptPrepGuideAsset(source, key, 'attendance.mp4')
    expect(() => decryptPrepGuideAsset(sealed, Buffer.alloc(32, 8), 'attendance.mp4')).toThrow()
    expect(() => decryptPrepGuideAsset(sealed, key, 'confession.mp4')).toThrow()
    const tampered = Buffer.from(sealed); tampered[tampered.length - 1] ^= 1
    expect(() => decryptPrepGuideAsset(tampered, key, 'attendance.mp4')).toThrow()
  })
  it('rejects plaintext, truncated content, and missing or malformed keys', () => {
    for (const bytes of [source, Buffer.alloc(40)]) expect(() => decryptPrepGuideAsset(bytes, key, 'attendance.mp4')).toThrow()
    for (const value of ['', 'invalid', Buffer.alloc(16).toString('base64')]) expect(() => prepGuideMediaKey(value)).toThrow()
    expect(prepGuideMediaKey(key.toString('base64'))).toEqual(key)
  })
})
