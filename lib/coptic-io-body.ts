import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib'

/**
 * Parse a Coptic IO response body as JSON, even when it arrives still
 * compressed.
 *
 * Coptic IO's Cloudflare edge cache can serve a cached 200 whose body is
 * compressed (gzip or brotli) without a Content-Encoding the client can act
 * on. Browsers cope; Node's fetch hands back the raw bytes and JSON.parse
 * fails on every request. We ask for `Accept-Encoding: identity`, and this
 * covers anything that still slips through, including bodies already stored
 * in Next's data cache.
 *
 * Returns `undefined` when the bytes are not JSON in any encoding.
 */
export function parseJsonBody(bytes: Uint8Array): unknown {
  let current: Buffer = Buffer.from(bytes)
  // Two passes cover a body compressed twice (once by the cache, once on the way out).
  for (let pass = 0; pass < 3; pass++) {
    const parsed = tryParse(current)
    if (parsed !== undefined) return parsed
    const decoded = decompress(current)
    if (!decoded) return undefined
    current = decoded
  }
  return undefined
}

function tryParse(bytes: Buffer): unknown {
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch {
    return undefined
  }
}

function decompress(bytes: Buffer): Buffer | null {
  const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
  // gzip has a magic number; brotli has none and deflate's is weak, so try them in turn.
  const decoders = isGzip ? [gunzipSync] : [brotliDecompressSync, inflateSync]
  for (const decode of decoders) {
    try {
      const out = decode(bytes)
      if (out.length > 0) return out
    } catch {
      // not this encoding
    }
  }
  return null
}
