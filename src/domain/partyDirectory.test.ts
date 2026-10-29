import { describe, expect, it } from 'vitest'
import { expensePartyVisibility, partyNameKey } from './partyDirectory'

describe('party identity protection', () => {
  it('hides confirmed descriptions only if no real identity exists', () => {
    expect(expensePartyVisibility('Airtel Recharge', new Set())).toBe('hidden-description')
    expect(expensePartyVisibility('Farhan Porter', new Set())).toBe('hidden-description')
    expect(expensePartyVisibility('Farhan Porter', new Set([partyNameKey('Farhan Porter')]))).toBe('party')
  })
  it('keeps unfamiliar people and suppliers for review instead of guessing from expenses', () => {
    for (const name of ['Tally India', 'Hardware', 'Airtel', 'Farhan', 'SADAR']) expect(expensePartyVisibility(name, new Set())).toBe('reference')
  })
  it('protects explicit identities even when their name resembles a system caption', () => {
    const name = 'Customer refund TNS-123'
    expect(expensePartyVisibility(name, new Set(), true)).toBe('hidden-description')
    expect(expensePartyVisibility(name, new Set([partyNameKey(name)]), true)).toBe('party')
  })
})
