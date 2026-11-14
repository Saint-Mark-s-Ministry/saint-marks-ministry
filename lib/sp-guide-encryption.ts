import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const MAGIC = Buffer.from('SPGUIDE1')
const HEADER_BYTES = 36 // magic + 12-byte nonce + 16-byte GCM tag

export function prepGuideMediaKey(value = process.env.SP_GUIDE_MEDIA_KEY): Buffer {
  const encoded = value?.trim()
  const key = Buffer.from(encoded ?? '', 'base64')
  if (key.length !== 32 || key.toString('base64') !== encoded) {
    throw new Error('SP_GUIDE_MEDIA_KEY must contain a base64-encoded 32-byte key')
  }
  return key
}

export function encryptPrepGuideAsset(plain: Uint8Array, key: Buffer, filename: string): Buffer {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(Buffer.from(filename))
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), encrypted])
}

export function decryptPrepGuideAsset(sealed: Buffer, key: Buffer, filename: string): Buffer {
  if (sealed.length < HEADER_BYTES || !sealed.subarray(0, 8).equals(MAGIC)) {
    throw new Error('Invalid staff guide media')
  }
  const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(8, 20))
  decipher.setAAD(Buffer.from(filename))
  decipher.setAuthTag(sealed.subarray(20, HEADER_BYTES))
  // Authenticate the entire asset before any bytes are returned to a viewer.
  return Buffer.concat([decipher.update(sealed.subarray(HEADER_BYTES)), decipher.final()])
}
