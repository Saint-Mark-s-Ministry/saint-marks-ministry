import { describe, expect, it } from 'vitest'
import { cornerAt } from '@/components/ui/sonner'

describe('cornerAt', () => {
  it('snaps a drop point to the nearest viewport corner', () => {
    expect(cornerAt(10, 10, 1440, 900)).toBe('top-left')
    expect(cornerAt(1400, 20, 1440, 900)).toBe('top-right')
    expect(cornerAt(30, 880, 1440, 900)).toBe('bottom-left')
    expect(cornerAt(1439, 899, 1440, 900)).toBe('bottom-right')
    // Exactly halfway counts as the bottom-right half.
    expect(cornerAt(720, 450, 1440, 900)).toBe('bottom-right')
  })
})
