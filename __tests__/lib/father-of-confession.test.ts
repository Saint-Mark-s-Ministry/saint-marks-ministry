import { describe, expect, it, vi } from 'vitest'
import { canonicalFatherOfConfessionName, findOrCreateFatherOfConfession } from '@/lib/father-of-confession'

const canonical = { id: 'canonical', name: 'Very Rev. Fr. Markos Ayoub', phone: '555-0100', church: 'St. Mark', isActive: true }

describe('confirmed father of confession aliases', () => {
  it.each(['Abouna Markos', 'Abuna Marcos', 'Father Marcos', 'Fr Markos Ayoub', 'Fr. Markos Ayoub', 'Fr.Markos Ayoub', 'Rev. Fr. Markos Ayoub', 'Very Rev. Fr. Markos Ayoub', '  fr.   markos   ayoub  '])(
    'uses the canonical priest for %s without creating or overwriting contact details', async name => {
      const db = { fatherOfConfession: { findFirst: vi.fn().mockResolvedValue(canonical), create: vi.fn() } }
      const result = await findOrCreateFatherOfConfession(db as never, { name, phone: '555-9999' })
      expect(result).toEqual({ father: canonical, created: false })
      expect(db.fatherOfConfession.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { name: { equals: canonical.name, mode: 'insensitive' }, isActive: true },
      }))
      expect(db.fatherOfConfession.create).not.toHaveBeenCalled()
    },
  )

  it.each(['Fr. Markos Sobhy', 'Abouna Mina', 'Fr. Marcos Elsewhere', 'Markos'])('does not infer a shared identity for %s', name => {
    expect(canonicalFatherOfConfessionName(name)).toBe(name)
  })

  it('creates a new priest when no active record matches', async () => {
    const db = { fatherOfConfession: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'new' }) } }
    expect(await findOrCreateFatherOfConfession(db as never, { name: '  Fr. Other  ', church: 'Other church' })).toEqual({ father: { id: 'new' }, created: true })
    expect(db.fatherOfConfession.create).toHaveBeenCalledWith(expect.objectContaining({ data: {
      name: 'Fr. Other', phone: null, church: 'Other church', isActive: true,
    } }))
  })
})
