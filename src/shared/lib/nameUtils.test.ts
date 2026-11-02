import { describe, expect, it } from 'vitest'
import { normalizeName, uniqNames } from './nameUtils'
import { normalizeName as uiNormalize, uniqNames as uiUnique } from '@/app/uiHelpers'
import { normalizeName as storeNormalize, uniqNames as storeUnique } from '@/store/storeShared'

describe('shared name identity compatibility', () => {
  it('normalizes surrounding/repeated whitespace without changing display casing', () => {
    expect(normalizeName('\u00a0  Alpha\t Ventures\n ')).toBe('Alpha Ventures')
    expect(normalizeName(' \t\n ')).toBe('')
  })
  it('retains the first display spelling and sorts the distinct names', () => {
    expect(uniqNames([' Beta ', 'alpha', 'ALPHA', '', 'Gamma', ' beta '])).toEqual(['alpha', 'Beta', 'Gamma'])
  })
  it('does not merge accent/full-width identities that the old helpers kept distinct', () => {
    const result = uniqNames(['Müller', 'MULLER', 'Ａ', 'A'])
    expect(result).toHaveLength(4)
    expect(result).toEqual(expect.arrayContaining(['Müller', 'MULLER', 'Ａ', 'A']))
  })
  it('keeps both existing import APIs bound to the same implementations', () => {
    expect(uiNormalize).toBe(normalizeName)
    expect(storeNormalize).toBe(normalizeName)
    expect(uiUnique).toBe(uniqNames)
    expect(storeUnique).toBe(uniqNames)
  })
})
