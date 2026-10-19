import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { normalizeInvoiceNumber, invoiceReservationId, deterministicEventId } from '@/domain/vendorLedgerV2'
import { normalizePosProductSearch, posProductSearchTokens, upcEanEquivalentBarcode } from '@/features/pos/domain/posDomain'
const receiving = createRequire(import.meta.url)('../../../../functions/stockReceiving.js')
const stock = createRequire(import.meta.url)('../../../../functions/stockOperations.js')

describe('trusted stock preserves existing identifiers and search contracts', () => {
  it('normalizes invoice numbers and retains the V2 purchase/reservation identifiers', () => {
    for (const raw of ['  inv  001 ', 'ＩＮＶ　００１', 'inv\n001']) {
      expect(receiving.normalizeInvoice(raw)).toBe('INV 001')
      expect(receiving.normalizeInvoice(raw)).toBe(normalizeInvoiceNumber(raw))
      expect(receiving.eventId('vendor', receiving.normalizeInvoice(raw))).toBe(invoiceReservationId('vendor', raw))
    }
    expect(receiving.eventId('purchase', 'grn-fixture', 1, 'purchase')).toBe(deterministicEventId('purchase', 'grn-fixture', 1, 'purchase'))
  })
  it('derives the same Unicode/punctuation prefix tokens and POS search names', () => {
    for (const name of ['QA Model-17', 'Ｍｉｎｔ  Soap', 'चाय साबुन', 'Perfume ✨ bottle']) {
      expect(stock.tokens(name)).toEqual(posProductSearchTokens(name))
      expect(stock.searchName(name)).toBe(normalizePosProductSearch(name))
    }
  })
  it('shares only valid UPC/EAN equivalent identities', () => {
    for (const barcode of ['036000291452', '0036000291452', '036000291453', 'ABC-01']) {
      expect(stock.aliases(barcode)).toEqual([barcode, upcEanEquivalentBarcode(barcode)].filter(Boolean).sort())
    }
  })
})
