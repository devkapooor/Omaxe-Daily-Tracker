import type { VendorV2 } from './vendorLedgerV2'

export type VendorAliasReviewStatus = 'canonical-match' | 'alias-match' | 'ambiguous' | 'unmatched'

export type VendorAliasReviewCandidate = {
  legacyName: string
  normalizedLegacyName: string
  status: VendorAliasReviewStatus
  vendorIds: string[]
}

export type VendorReferenceResolution =
  | { kind: 'v2'; vendor: VendorV2 }
  | { kind: 'legacy'; legacyName: string }

export function normalizeVendorIdentityName(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-IN')
}

function searchableNames(vendor: Pick<VendorV2, 'aliases' | 'canonicalName'>) {
  return [vendor.canonicalName, ...vendor.aliases]
    .map(normalizeVendorIdentityName)
    .filter(Boolean)
}

export function vendorIdentitySearchText(vendor: Pick<VendorV2, 'aliases' | 'canonicalName' | 'contact' | 'suppliedBrands' | 'ownerName' | 'address' | 'notes'>) {
  return [vendor.canonicalName, vendor.ownerName ?? '', ...vendor.aliases, vendor.contact, vendor.address, ...vendor.suppliedBrands, vendor.notes ?? '']
    .map(normalizeVendorIdentityName)
    .filter(Boolean)
    .join(' ')
}

export function findActiveVendorByReference(vendors: VendorV2[], reference: string) {
  const exactId = vendors.find((vendor) => vendor.active && vendor.id === reference)
  if (exactId) return exactId

  const normalized = normalizeVendorIdentityName(reference)
  if (!normalized) return null
  const matches = vendors.filter((vendor) => vendor.active && searchableNames(vendor).includes(normalized))
  return matches.length === 1 ? matches[0] : null
}

export function resolveVendorReference(vendors: VendorV2[], reference: string): VendorReferenceResolution {
  const vendor = findActiveVendorByReference(vendors, reference)
  return vendor
    ? { kind: 'v2', vendor }
    : { kind: 'legacy', legacyName: reference.trim() }
}

export function activeVendorIdentityConflicts(vendors: VendorV2[]) {
  const ownersByName = new Map<string, Set<string>>()
  vendors.filter((vendor) => vendor.active).forEach((vendor) => {
    searchableNames(vendor).forEach((name) => {
      const owners = ownersByName.get(name) ?? new Set<string>()
      owners.add(vendor.id)
      ownersByName.set(name, owners)
    })
  })

  return Array.from(ownersByName.entries())
    .filter(([, vendorIds]) => vendorIds.size > 1)
    .map(([normalizedName, vendorIds]) => ({ normalizedName, vendorIds: Array.from(vendorIds).sort() }))
    .sort((left, right) => left.normalizedName.localeCompare(right.normalizedName))
}

export function buildVendorAliasReview(legacyNames: string[], vendors: VendorV2[]): VendorAliasReviewCandidate[] {
  const uniqueLegacyNames = new Map<string, string>()
  legacyNames.forEach((legacyName) => {
    const normalized = normalizeVendorIdentityName(legacyName)
    if (normalized && !uniqueLegacyNames.has(normalized)) uniqueLegacyNames.set(normalized, legacyName.trim())
  })

  return Array.from(uniqueLegacyNames.entries()).map(([normalizedLegacyName, legacyName]) => {
    const activeVendors = vendors.filter((vendor) => vendor.active)
    const canonicalMatches = activeVendors.filter(
      (vendor) => normalizeVendorIdentityName(vendor.canonicalName) === normalizedLegacyName,
    )
    const aliasMatches = activeVendors.filter(
      (vendor) => vendor.aliases.some((alias) => normalizeVendorIdentityName(alias) === normalizedLegacyName),
    )
    const vendorIds = Array.from(new Set([...canonicalMatches, ...aliasMatches].map((vendor) => vendor.id))).sort()
    const status: VendorAliasReviewStatus = vendorIds.length > 1
      ? 'ambiguous'
      : canonicalMatches.length === 1
        ? 'canonical-match'
        : aliasMatches.length === 1
          ? 'alias-match'
          : 'unmatched'
    return { legacyName, normalizedLegacyName, status, vendorIds }
  }).sort((left, right) => left.legacyName.localeCompare(right.legacyName))
}

export function vendorIdentityOptions(vendors: VendorV2[]) {
  return vendors
    .filter((vendor) => vendor.active)
    .map((vendor) => ({ value: vendor.id, label: vendor.canonicalName }))
    .sort((left, right) => left.label.localeCompare(right.label))
}
