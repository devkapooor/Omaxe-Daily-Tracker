import type { PurchasingCapabilities, PurchasingCapability, UserAccount } from './appTypes'

export const purchasingCapabilities = [
  'vendor.manage',
  'purchase.create',
  'purchase.correct',
  'settlement.create',
  'settlement.correct',
  'return.create',
  'return.resolve',
  'cheque.prepare',
  'cheque.issue',
  'cheque.present',
  'cheque.debit',
  'cheque.cancel',
  'vendorLedger.view',
  'migration.execute',
] as const satisfies readonly PurchasingCapability[]

export function defaultPurchasingCapabilities(): PurchasingCapabilities {
  return Object.fromEntries(purchasingCapabilities.map((capability) => [capability, false])) as PurchasingCapabilities
}

export function hasPurchasingCapability(
  user: Pick<UserAccount, 'disabled' | 'purchasingCapabilities' | 'role'> | null | undefined,
  capability: PurchasingCapability,
) {
  if (!user || user.disabled) return false
  return user.role === 'owner' || user.purchasingCapabilities?.[capability] === true
}
