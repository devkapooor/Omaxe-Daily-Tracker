import type { DailyCashoutEntry } from './appTypes'

function cardSalesForDate(entries: DailyCashoutEntry[], date: string) {
  return entries
    .filter((entry) => entry.date === date)
    .reduce((total, entry) => total + (entry.cardSales ?? 0), 0)
}

/** Adjusts the existing Sales card total by the cashout Card delta, without rewriting legacy values. */
export function cardSalesAfterCashoutChange(
  existingCardSales: number,
  previousEntries: DailyCashoutEntry[],
  nextEntries: DailyCashoutEntry[],
  date: string,
) {
  return existingCardSales + cardSalesForDate(nextEntries, date) - cardSalesForDate(previousEntries, date)
}
