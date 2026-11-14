/** bun scripts/guides/encrypt-sp-media.ts /absolute/path/to/current/exports
 * Requires SP_GUIDE_MEDIA_KEY. Never put the key or unencrypted SP media in Git.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { prepGuides } from '../../lib/sp-guides'
import { encryptPrepGuideAsset, prepGuideMediaKey } from '../../lib/sp-guide-encryption'

const source = process.argv[2]
if (!source || !path.isAbsolute(source)) throw new Error('Supply an absolute export directory')
const key = prepGuideMediaKey()
const destination = path.join(process.cwd(), 'private', 'sp-guides')
await mkdir(destination, { recursive: true })
for (const guide of prepGuides) {
  for (const suffix of ['mp4', 'jpg', 'vtt']) {
    const filename = `${guide.id}.${suffix}`
    const sealed = encryptPrepGuideAsset(await readFile(path.join(source, filename)), key, filename)
    await writeFile(path.join(destination, `${filename}.enc`), sealed)
  }
}
console.log('Encrypted all ten staff guides, posters and caption tracks.')
