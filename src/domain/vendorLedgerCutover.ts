export type CutoverVendorDraft = {
  id: string
  canonicalName: string
  openingBalancePaise: number
  openingReason: string
}

export type VendorLedgerCutoverReview = {
  activationDate: string
  vendors: CutoverVendorDraft[]
  vendorCount: number
  adjustedOpeningCount: number
  totalOpeningPaise: number
  chequeBook: { id: 'book-1120-1199'; startNumber: 1120; endNumber: 1199 }
  errors: string[]
  ready: boolean
}

const businessDatePattern = /^\d{4}-\d{2}-\d{2}$/

export const VENDOR_LEDGER_ACTIVATION_PHRASE = 'ACTIVATE V2'

export function confirmsVendorLedgerActivation(value: string) {
  return value.trim() === VENDOR_LEDGER_ACTIVATION_PHRASE
}

export function reviewVendorLedgerCutover(
  activationDate: string,
  drafts: CutoverVendorDraft[],
): VendorLedgerCutoverReview {
  const errors: string[] = []
  if (!businessDatePattern.test(activationDate)) errors.push('Choose one activation date for all vendors.')

  const names = new Set<string>()
  let totalOpeningPaise = 0
  let adjustedOpeningCount = 0
  const vendors = drafts.map((draft, index) => {
    const canonicalName = draft.canonicalName.trim()
    const openingReason = draft.openingReason.trim()
    const nameKey = canonicalName.toLocaleUpperCase('en-IN')
    if (!canonicalName) errors.push(`Vendor ${index + 1} needs a name.`)
    if (canonicalName && names.has(nameKey)) errors.push(`Duplicate vendor name: ${canonicalName}.`)
    names.add(nameKey)
    if (!Number.isSafeInteger(draft.openingBalancePaise) || draft.openingBalancePaise < 0) {
      errors.push(`${canonicalName || `Vendor ${index + 1}`} has an invalid opening balance.`)
    } else {
      totalOpeningPaise += draft.openingBalancePaise
      if (draft.openingBalancePaise > 0) {
        adjustedOpeningCount += 1
        if (!openingReason) errors.push(`${canonicalName || `Vendor ${index + 1}`} needs an audit reason for its opening balance.`)
      }
    }
    return { ...draft, canonicalName, openingReason }
  })

  return {
    activationDate,
    vendors,
    vendorCount: vendors.length,
    adjustedOpeningCount,
    totalOpeningPaise,
    chequeBook: { id: 'book-1120-1199', startNumber: 1120, endNumber: 1199 },
    errors,
    ready: errors.length === 0,
  }
}
