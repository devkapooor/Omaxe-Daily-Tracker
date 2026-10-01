import { describe, expect, it } from 'vitest'
import { defaultPurchasingCapabilities, hasPurchasingCapability, purchasingCapabilities } from './purchasingCapabilities'

describe('purchasing capabilities', () => {
  it('defaults every non-owner capability off', () => {
    const defaults = defaultPurchasingCapabilities()
    expect(Object.keys(defaults)).toHaveLength(purchasingCapabilities.length)
    expect(Object.values(defaults).every((enabled) => enabled === false)).toBe(true)
  })

  it('grants owners an override without stored capability fields', () => {
    expect(hasPurchasingCapability({ role: 'owner' }, 'migration.execute')).toBe(true)
  })

  it('requires an explicit grant for active non-owners and denies disabled users', () => {
    expect(hasPurchasingCapability({ role: 'manager' }, 'purchase.create')).toBe(false)
    expect(hasPurchasingCapability({ role: 'manager', purchasingCapabilities: { 'purchase.create': true } }, 'purchase.create')).toBe(true)
    expect(hasPurchasingCapability({ role: 'manager', disabled: true, purchasingCapabilities: { 'purchase.create': true } }, 'purchase.create')).toBe(false)
  })
})
