export const partyNameKey = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-IN')
const confirmedDescriptions = new Set(['airtel recharge', 'farhan porter'])

/** Visibility only. An explicit saved/loan/payment/user identity always wins. */
export function expensePartyVisibility(name: string, protectedNames: ReadonlySet<string>, systemRefundDescription = false) {
  if (protectedNames.has(partyNameKey(name))) return 'party' as const
  if (confirmedDescriptions.has(partyNameKey(name)) || systemRefundDescription) return 'hidden-description' as const
  // Never guess whether an unfamiliar payee is a real person or supplier.
  return 'reference' as const
}
