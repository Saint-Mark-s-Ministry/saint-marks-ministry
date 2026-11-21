import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { decryptPrepGuideAsset, prepGuideMediaKey } from '@/lib/sp-guide-encryption'

export async function loadPrepGuideAsset(id: string, suffix: string): Promise<Buffer | null> {
  const key = prepGuideMediaKey()
  const filename = `${id}.${suffix}`
  const sealed = await readFile(path.join(process.cwd(), 'private', 'sp-guides', `${filename}.enc`)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  return sealed ? decryptPrepGuideAsset(sealed, key, filename) : null
}
