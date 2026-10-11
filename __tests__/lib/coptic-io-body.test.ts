import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { parseJsonBody } from '@/lib/coptic-io-body'

const value = { isFasting: true, fastType: 'fast', description: 'صوم الأربعاء' }
const json = Buffer.from(JSON.stringify(value))

describe('parseJsonBody', () => {
  it('parses plain JSON', () => {
    expect(parseJsonBody(json)).toEqual(value)
  })

  it('decodes bodies that arrive still compressed', () => {
    expect(parseJsonBody(gzipSync(json))).toEqual(value)
    expect(parseJsonBody(brotliCompressSync(json))).toEqual(value)
    expect(parseJsonBody(deflateSync(json))).toEqual(value)
  })

  it('decodes a body compressed twice', () => {
    expect(parseJsonBody(gzipSync(brotliCompressSync(json)))).toEqual(value)
  })

  it('keeps JSON null, which is a real answer', () => {
    expect(parseJsonBody(Buffer.from('null'))).toBeNull()
  })

  it('gives up on bytes that are not JSON in any encoding', () => {
    expect(parseJsonBody(Buffer.from('<html>Bad gateway</html>'))).toBeUndefined()
    expect(parseJsonBody(new Uint8Array([0x35, 0x00, 0x00, 0xff, 0xfe]))).toBeUndefined()
  })
})
