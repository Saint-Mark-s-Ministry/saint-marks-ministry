import { describe, expect, it } from 'vitest'
import { DRIVE_ROOT_CRUMB, isDriveId, parseStoredCrumbs, serializeCrumbs } from '@/lib/drive-folders'

const YEAR_ONE = { id: '1YearOneFolderAbCdEfGh', name: 'Year 1' }
const DOGMA = { id: '1DogmaFolderAbCdEfGhIjK', name: 'Dogma' }

describe('Drive folder paths', () => {
  it('accepts Drive-shaped IDs only, so nothing else reaches the Drive query', () => {
    expect(isDriveId('0ByflSbu6LLHWZVR1aDg2WjBHQ1E')).toBe(true)
    expect(isDriveId("x' or name contains 'a")).toBe(false)
    expect(isDriveId('short')).toBe(false)
    expect(isDriveId(undefined)).toBe(false)
  })

  it('round-trips a path below the root', () => {
    const path = [DRIVE_ROOT_CRUMB, YEAR_ONE, DOGMA]
    expect(serializeCrumbs(path)).toBe(JSON.stringify([YEAR_ONE, DOGMA]))
    expect(parseStoredCrumbs(serializeCrumbs(path))).toEqual(path)
  })

  it('falls back to the root for missing or malformed storage', () => {
    for (const raw of [null, '', 'not json', '{}', '[1,2]']) {
      expect(parseStoredCrumbs(raw)).toEqual([DRIVE_ROOT_CRUMB])
    }
  })

  it('stops at the first bad level rather than jumping to an unrelated folder', () => {
    const raw = JSON.stringify([YEAR_ONE, { id: 'bad id!', name: 'x' }, DOGMA])
    expect(parseStoredCrumbs(raw)).toEqual([DRIVE_ROOT_CRUMB, YEAR_ONE])
  })

  it('names a level without a name', () => {
    expect(parseStoredCrumbs(JSON.stringify([{ id: YEAR_ONE.id, name: '  ' }]))[1].name).toBe('Folder')
  })
})
