import { describe, expect, it } from 'vitest'
import type { VendorV2 } from './vendorLedgerV2'
import {
  activeVendorIdentityConflicts,
  buildVendorAliasReview,
  findActiveVendorByReference,
  normalizeVendorIdentityName,
  resolveVendorReference,
  vendorIdentityOptions,
  vendorIdentitySearchText,
} from './vendorIdentityV2'

function vendor(id: string, canonicalName: string, aliases: string[] = [], active = true): VendorV2 {
  return {
    id,
    canonicalName,
    aliases,
    contact: '9999999999',
    address: '',
    suppliedBrands: ['Brand'],
    active,
    openingBalancePaise: 0,
    revision: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    createdByUserId: 'owner-user',
    updatedAt: '2026-10-01T00:00:00.000Z',
    updatedByUserId: 'owner-user',
  }
}

describe('V2 vendor identity', () => {
  const vendors = [
    vendor('vendor-1', 'Bombay Hot', ['Bobmay hot']),
    vendor('vendor-2', 'Geeta Lakshmi Corporation', ['Geeta Lakshmi Incorporation']),
    vendor('vendor-3', 'Retired Vendor', ['Old Supplier'], false),
  ]

  it('normalizes spacing and case without changing the saved display name', () => {
    expect(normalizeVendorIdentityName('  BOMBAY   Hot ')).toBe('bombay hot')
    expect(vendors[0].canonicalName).toBe('Bombay Hot')
  })

  it('resolves stable IDs, canonical names, and unique aliases for active vendors', () => {
    expect(findActiveVendorByReference(vendors, 'vendor-1')?.id).toBe('vendor-1')
    expect(findActiveVendorByReference(vendors, 'BOMBAY HOT')?.id).toBe('vendor-1')
    expect(findActiveVendorByReference(vendors, 'bobmay hot')?.id).toBe('vendor-1')
    expect(findActiveVendorByReference(vendors, 'Old Supplier')).toBeNull()
  })

  it('detects duplicate canonical or alias identities across active vendors', () => {
    const conflicts = activeVendorIdentityConflicts([...vendors, vendor('vendor-4', 'Another Vendor', ['Bombay Hot'])])
    expect(conflicts).toEqual([{ normalizedName: 'bombay hot', vendorIds: ['vendor-1', 'vendor-4'] }])
    expect(findActiveVendorByReference([...vendors, vendor('vendor-4', 'Another Vendor', ['Bombay Hot'])], 'Bombay Hot')).toBeNull()
  })

  it('builds a read-only legacy alias review without assigning unmatched names', () => {
    expect(buildVendorAliasReview([
      'Bombay Hot',
      'Bobmay hot',
      'Unknown Supplier',
      'Old Supplier',
      'unknown supplier',
    ], vendors)).toEqual([
      { legacyName: 'Bobmay hot', normalizedLegacyName: 'bobmay hot', status: 'alias-match', vendorIds: ['vendor-1'] },
      { legacyName: 'Bombay Hot', normalizedLegacyName: 'bombay hot', status: 'canonical-match', vendorIds: ['vendor-1'] },
      { legacyName: 'Old Supplier', normalizedLegacyName: 'old supplier', status: 'unmatched', vendorIds: [] },
      { legacyName: 'Unknown Supplier', normalizedLegacyName: 'unknown supplier', status: 'unmatched', vendorIds: [] },
    ])
  })

  it('searches aliases and returns ID-valued options for active vendors only', () => {
    const searchableVendor = {
      ...vendors[0],
      ownerName: 'Raj Malhotra',
      address: 'Central Market',
      notes: 'Delivers every Tuesday',
    }
    const searchText = vendorIdentitySearchText(searchableVendor)
    expect(searchText).toContain('bobmay hot')
    expect(searchText).toContain('raj malhotra')
    expect(searchText).toContain('central market')
    expect(searchText).toContain('delivers every tuesday')
    expect(vendorIdentityOptions(vendors)).toEqual([
      { value: 'vendor-1', label: 'Bombay Hot' },
      { value: 'vendor-2', label: 'Geeta Lakshmi Corporation' },
    ])
  })

  it('preserves unmatched historical names as legacy references without assigning an ID', () => {
    expect(resolveVendorReference(vendors, 'Unknown Supplier')).toEqual({
      kind: 'legacy',
      legacyName: 'Unknown Supplier',
    })
    expect(resolveVendorReference(vendors, 'Bobmay hot')).toMatchObject({
      kind: 'v2',
      vendor: { id: 'vendor-1' },
    })
  })
})
