const { describe, it, beforeEach, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { createStockReceivingHandlers } = require('./stockReceiving')
const { createStockAuditHandlers } = require('./stockAudit')
const { createStockPriceHandlers } = require('./stockPrices')
const s = require('./stockOperations')

describe('stock date, identity and arithmetic contracts', () => {
  it('uses IST rather than UTC for audit business date and valid calendar dates', () => {
    assert.equal(s.istDate('2026-10-12T18:31:00Z'), '2026-10-13')
    assert.throws(() => s.date('2026-02-30'), /valid business date/)
    assert.throws(() => s.safe(Number.MAX_SAFE_INTEGER + 1), /safe integer/)
  })
  it('shares valid UPC and EAN aliases without conflating invalid check digits', () => {
    assert.deepEqual(s.aliases('036000291452'), ['0036000291452', '036000291452'])
    assert.deepEqual(s.aliases('036000291453'), ['036000291453'])
  })
})

describe('trusted stock transactions on dedicated demo emulator', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw Error('Loopback emulator required')
  const { initializeApp, deleteApp } = require('firebase-admin/app'), { getFirestore } = require('firebase-admin/firestore')
  const project = 'demo-stock-batch2', app = initializeApp({ projectId: project }, 'stock-batch2'), db = getFirestore(app), base = 'posSandboxes/test'
  const receiving = createStockReceivingHandlers(db, () => '2026-10-12T18:31:00.000Z'), audit = createStockAuditHandlers(db, () => '2026-10-12T18:31:00.000Z'), prices = createStockPriceHandlers(db)
  const auth = { uid: 'billing' }, owner = { uid: 'owner' }
  const call = (handler, data, who = auth) => handler({ auth: who, data })
  const line = (quantity = 3, overrides = {}) => ({ productId: 'a', barcode: '00001', productName: 'A', category: 'Fixture', quantity, unitCostPaise: 6000, mrpPaise: 10000, sellingPricePaise: 9000, expectedRevision: 1, ...overrides })
  const draft = (id = randomUUID(), overrides = {}) => {
    const input = { operationId: randomUUID(), id, expectedRevision: 0, vendorId: 'vendor', invoiceNumber: ' INV 1 ', invoiceDate: '2026-10-13', receiptDate: '2026-10-13', invoiceTotalPaise: 100000, lines: [line()], ...overrides }
    const value = input.lines.reduce((sum, line) => sum + line.quantity * line.unitCostPaise, 0)
    if (input.invoiceTotalPaise > value) input.shortage = { state: 'pending', originalInvoiceTotalPaise: input.invoiceTotalPaise }
    return input
  }
  async function receive(input = draft()) { const saved = await call(receiving.saveDraft, input); const intent = { operationId: randomUUID(), id: saved.id, expectedRevision: saved.revision }; return { saved, intent, result: await call(receiving.submit, intent) } }
  async function reversal(id) { const p = await call(receiving.previewReverse, { id }, owner); return { operationId: randomUUID(), id, expectedRevision: p.expectedRevision, confirmationHash: p.confirmationHash, reason: 'Synthetic approved reversal' } }
  beforeEach(async () => {
    assert.equal((await db.collection('loans').limit(1).get()).size, 0)
    const reset = await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE' }); assert.equal(reset.ok, true)
    const b = db.batch()
    for (const role of ['owner', 'manager', 'billing']) b.set(db.doc(`users/${role}`), { name: `Fixture ${role}`, role, disabled: false })
    b.set(db.doc('appMetadata/vendorLedgerV2Config'), { enabled: true, activationDate: '2026-10-01' })
    b.set(db.doc('vendorsV2/vendor'), { canonicalName: 'Canonical Vendor', active: true })
    b.set(db.doc(`${base}/products/a`), { id: 'a', name: 'A', barcode: '00001', category: 'Fixture', active: true, sourceValues: { 'Printed MRP': '100.00' }, sellingPricePaise: 9000, currentQuantity: 20, revision: 1 })
    b.set(db.doc(`${base}/productCosts/a`), { productId: 'a', costPaise: 6000, importRunId: 'manual' })
    await b.commit()
  })
  after(async () => deleteApp(app))
  it('keeps gross payable100000 pending its shortage note while posting quantity23/value18000', async () => {
    const r = await receive(); assert.equal(r.result.totalPaise, 100000)
    assert.equal((await db.doc(`${base}/products/a`).get()).get('currentQuantity'), 23)
    assert.equal((await db.doc('vendorAccountStatesV2/vendor').get()).get('outstandingPaise'), 100000)
    assert.equal((await db.doc(`${base}/goodsReceipts/${r.saved.id}`).get()).get('vendorName'), 'Canonical Vendor')
    assert.equal((await db.collection(`${base}/stockMovements`).get()).size, 1)
  })
  it('issues a reserved internal barcode without posting stock, then creates product only on GRN submit', async () => {
    const id = randomUUID(), productId = `pos-${randomUUID()}`
    const allocated = await call(receiving.allocateInternalBarcode, { operationId: randomUUID(), draftId: id, productId })
    assert.match(allocated.barcode, /^\d{16}$/)
    assert.equal((await db.doc(`${base}/products/${productId}`).get()).exists, false)
    assert.equal((await db.doc('vendorAccountStatesV2/vendor').get()).exists, false)
    const reservation = (await db.doc(`${base}/barcodeReservations/${s.hash(allocated.barcode)}`).get()).data()
    assert.equal(reservation.kind, 'internal-grn'); assert.equal(reservation.draftId, id); assert.equal(reservation.productId, productId)
    const input = draft(id, { lines: [{ ...line(2), productId, barcode: allocated.barcode, productName: 'Internal item', category: 'Fixture', newProduct: true, internalBarcode: true, expectedRevision: undefined }] })
    const saved = await call(receiving.saveDraft, input)
    assert.equal((await db.doc(`${base}/products/${productId}`).get()).exists, false)
    const result = await call(receiving.submit, { operationId: randomUUID(), id: saved.id, expectedRevision: saved.revision })
    const product = (await db.doc(`${base}/products/${productId}`).get()).data()
    assert.equal(product.barcode, allocated.barcode); assert.equal(product.currentQuantity, 2)
    assert.equal((await db.doc('vendorAccountStatesV2/vendor').get()).get('outstandingPaise'), 100000)
    assert.equal((await db.doc(`${base}/stockMovements/grn-${s.hash(`${id}:${productId}`)}`).get()).exists, true)
    assert.equal(result.totalPaise, 100000)
  })
  it('rejects an internal barcode on a different draft or product without posting', async () => {
    const allocated = await call(receiving.allocateInternalBarcode, { operationId: randomUUID(), draftId: 'reserved-draft', productId: 'reserved-product' })
    const input = draft('different-draft', { lines: [{ ...line(), productId: 'different-product', barcode: allocated.barcode, newProduct: true, internalBarcode: true }] })
    await assert.rejects(call(receiving.saveDraft, input), /reserved for another GRN line/)
    assert.equal((await db.collection(`${base}/products`).get()).size, 1)
    assert.equal((await db.doc('vendorAccountStatesV2/vendor').get()).exists, false)
  })
  it('replays original submission after later revisions; rejects actor and intent changes', async () => {
    const r = await receive(); await db.doc(`${base}/products/a`).update({ revision: 3, currentQuantity: 22 })
    assert.deepEqual(await call(receiving.submit, r.intent), r.result)
    await assert.rejects(call(receiving.submit, { ...r.intent, expectedRevision: 2 }), /different actor or intent/)
    await assert.rejects(call(receiving.submit, r.intent, owner), /different actor or intent/)
    assert.equal((await db.doc(`${base}/products/a`).get()).get('currentQuantity'), 22)
  })
  it('preserves reversal of historical partial receipts and credits paid amounts without rewriting them', async () => {
    const original = await receive()
    // Historical partial sources remain reversible; new partial receipts are now rejected.
    const partial = { saved: { id: randomUUID() } }, originalRef = db.doc(`${base}/goodsReceipts/${original.saved.id}`)
    const historical = (await originalRef.get()).data()
    await db.doc(`${base}/goodsReceipts/${partial.saved.id}`).set({ ...historical, id: partial.saved.id, pricingMode: 'historical-partial', payableOwner: false, originatingGoodsReceiptId: original.saved.id, lines: [{ ...historical.lines[0], quantity: 2, lineTotalPaise: 12000 }], revision: 1 })
    await originalRef.update({ linkedReceiptIds: [partial.saved.id], revision: 3 })
    await db.doc(`${base}/products/a`).update({ currentQuantity: 25, revision: 3 })
    assert.equal((await db.collection('purchasesV2').get()).size, 1)
    await assert.rejects(reversal(original.saved.id), /partial receipts first/)
    await call(receiving.reverse, await reversal(partial.saved.id), owner)
    assert.equal((await db.doc(`${base}/products/a`).get()).get('currentQuantity'), 23)
    assert.equal((await db.doc('vendorAccountStatesV2/vendor').get()).get('outstandingPaise'), 100000)
    // Independently seeded posted payment state for handler-level reversal arithmetic; browser acceptance tests the real payment workflow separately.
    await db.doc(`invoiceStatesV2/${original.result.purchaseId}`).update({ openAmountPaise: 60000, revision: 2 })
    await db.doc('vendorAccountStatesV2/vendor').update({ outstandingPaise: 60000, revision: 2 })
    const intent = await reversal(original.saved.id), result = await call(receiving.reverse, intent, owner)
    assert.deepEqual(await call(receiving.reverse, intent, owner), result)
    const account = (await db.doc('vendorAccountStatesV2/vendor').get()).data()
    assert.equal(account.outstandingPaise, 0); assert.equal(account.vendorCreditPaise, 40000)
    assert.equal((await db.doc(`${base}/products/a`).get()).get('currentQuantity'), 20)
    assert.equal((await db.collection('purchasesV2').get()).size, 1)
  })
  it('rejects reserved payable, stale confirmation and unauthorized reversal without writes', async () => {
    const r = await receive(), intent = await reversal(r.saved.id)
    await assert.rejects(call(receiving.reverse, intent), /account cannot/)
    await db.doc(`${base}/products/a`).update({ revision: 3 })
    await assert.rejects(call(receiving.reverse, intent, owner), /effects changed/)
    await db.doc(`invoiceStatesV2/${r.result.purchaseId}`).update({ reservedAmountPaise: 100 })
    await assert.rejects(reversal(r.saved.id), /reserved/)
    assert.equal((await db.doc(`${base}/products/a`).get()).get('currentQuantity'), 23)
  })
  it('GRN price evidence and provenance preserve an intervening ABA edit; review never reapplies', async () => {
    const r = await receive(draft(undefined, { lines: [line(3, { sellingPricePaise: 10000 })] }))
    let p = (await db.doc(`${base}/products/a`).get()).data()
    assert.equal((await db.collection(`${base}/stockPriceChanges`).get()).size, 1)
    for (const value of [9500, 10000]) {
      await call(prices.change, { operationId: `stock-price-${randomUUID()}`, productId: 'a', expectedRevision: p.revision, mrpPaise: 10000, sellingPricePaise: value, reason: 'Synthetic later correction' }); p = (await db.doc(`${base}/products/a`).get()).data()
    }
    await call(receiving.reverse, await reversal(r.saved.id), owner)
    assert.equal((await db.doc(`${base}/products/a`).get()).get('sellingPricePaise'), 10000)
    const first = (await db.collection(`${base}/stockPriceChanges`).where('sourceKind', '==', 'goods-receipt').get()).docs[0]
    await call(prices.review, { id: first.id }, owner)
    assert.equal((await db.doc(`${base}/products/a`).get()).get('sellingPricePaise'), 10000)
  })
  it('legacy missing provenance explicitly skips restoration and does not invent fields', async () => {
    const r = await receive(draft(undefined, { lines: [line(3, { sellingPricePaise: 10000 })] }))
    const doc = db.doc(`${base}/goodsReceipts/${r.saved.id}`), data = (await doc.get()).data(); delete data.lines[0].priceProvenanceBefore; await doc.set(data)
    const preview = await call(receiving.previewReverse, { id: r.saved.id }, owner)
    assert.equal(preview.lines[0].priceRestoration, 'unavailable-historical-provenance')
    await call(receiving.reverse, await reversal(r.saved.id), owner)
    assert.equal((await db.doc(`${base}/products/a`).get()).get('sellingPricePaise'), 10000)
  })
  it('stale product and invalid ceilings reject the whole stock/payable operation', async () => {
    const saved = await call(receiving.saveDraft, draft()); await db.doc(`${base}/products/a`).update({ revision: 2 })
    await assert.rejects(call(receiving.submit, { operationId: randomUUID(), id: saved.id, expectedRevision: 1 }), /changed/)
    await assert.rejects(call(receiving.saveDraft, draft(undefined, { lines: [line(3, { mrpPaise: 8999 })] })), /greater than MRP/)
    assert.equal((await db.collection('purchasesV2').get()).size, 0); assert.equal((await db.doc(`${base}/products/a`).get()).get('currentQuantity'), 20)
  })
  it('draft identity/revision, creator-only editing and all-staff submission are preserved', async () => {
    const d = draft(), saved = await call(receiving.saveDraft, d)
    assert.deepEqual(await call(receiving.saveDraft, d), saved)
    await assert.rejects(call(receiving.saveDraft, { ...d, operationId: randomUUID(), expectedRevision: 1 }, { uid: 'manager' }), /creator or owner/)
    await call(receiving.submit, { operationId: randomUUID(), id: saved.id, expectedRevision: 1 }, { uid: 'manager' })
    assert.equal((await db.doc(`${base}/goodsReceipts/${saved.id}`).get()).get('submittedByUid'), 'manager')
  })
  it('racing zero-stock product creation has one identity and rejects inactive duplicates', async () => {
    const create = barcode => call(receiving.createProduct, { operationId: randomUUID(), barcode, name: 'Synthetic', sellingPricePaise: 100 })
    const results = await Promise.all([create('036000291452'), create('0036000291452')])
    assert.equal(results[0].id, results[1].id); assert.equal(results[0].currentQuantity, 0)
    await db.doc(`${base}/products/${results[0].id}`).update({ active: false }); await assert.rejects(create('036000291452'), /inactive/)
  })
  it('audit delta-3/value-18000 uses IST, matched count has no movement and group replays once', async () => {
    const id = randomUUID(), start = { operationId: randomUUID(), id, note: 'Synthetic shelf count', counts: [{ productId: 'a', expectedRevision: 1, physicalQuantity: 17 }] }
    await call(audit.begin, start); const intent = { operationId: randomUUID(), id, groupIndex: 0 }, result = await call(audit.group, intent)
    assert.equal(result[0].valueImpactPaise, -18000); assert.deepEqual(await call(audit.group, intent), result)
    assert.equal((await db.collection(`${base}/stockMovements`).get()).docs[0].get('businessDate'), '2026-10-13')
    await call(audit.finish, { operationId: randomUUID(), id, interrupted: false })
    const matched = randomUUID(); await call(audit.begin, { ...start, operationId: randomUUID(), id: matched, counts: [{ productId: 'a', expectedRevision: 2, physicalQuantity: 17 }] }); await call(audit.group, { operationId: randomUUID(), id: matched, groupIndex: 0 })
    assert.equal((await db.collection(`${base}/stockMovements`).get()).size, 1)
    assert.equal((await db.doc(`${base}/products/a`).get()).get('revision'), 2)
  })
  it('rejects forged/omitted audit intent, cross-actor groups and out-of-order completion', async () => {
    const id = randomUUID(), input = { operationId: randomUUID(), id, note: 'Synthetic count', counts: [{ productId: 'a', physicalQuantity: 17, expectedRevision: 1 }] }
    await assert.rejects(call(audit.begin, { ...input, counts: [{ productId: 'a', physicalQuantity: 17 }] }), /revision/)
    await call(audit.begin, input)
    await assert.rejects(call(audit.group, { operationId: randomUUID(), id, groupIndex: 0 }, owner), /original staff/)
    await assert.rejects(call(audit.finish, { operationId: randomUUID(), id, interrupted: false }), /all audit groups/)
    assert.equal((await db.doc(`${base}/products/a`).get()).get('currentQuantity'), 20)
  })
  it('drafts retain incomplete values without posting, and stable deletion recovers without recreation', async () => {
    const d = draft(undefined, { lines: [line(0, { unitCostPaise: 0, mrpPaise: null, sellingPricePaise: undefined })] })
    const saved = await call(receiving.saveDraft, d)
    await assert.rejects(call(receiving.submit, { operationId: randomUUID(), id: saved.id, expectedRevision: 1 }), /Selling price|MRP/)
    assert.equal((await db.doc(`${base}/products/a`).get()).get('currentQuantity'), 20)
    const deletion = { operationId: randomUUID(), id: saved.id, expectedRevision: 1 }
    assert.equal((await call(receiving.deleteDraft, deletion)).deleted, true)
    assert.equal((await call(receiving.deleteDraft, deletion)).deleted, true)
    assert.equal((await db.doc(`${base}/goodsReceipts/${saved.id}`).get()).exists, false)
    assert.equal((await db.collection('purchasesV2').get()).size, 0)
  })
  it('POS creation racing GRN creation posts at most one identity and no losing partial payable', async () => {
    const saved = await call(receiving.saveDraft, draft(undefined, { lines: [line(2, { newProduct: true, productId: 'new', barcode: '036000291452' })] }))
    const results = await Promise.allSettled([call(receiving.createProduct, { operationId: randomUUID(), barcode: '0036000291452', name: 'POS race', sellingPricePaise: 9000 }), call(receiving.submit, { operationId: randomUUID(), id: saved.id, expectedRevision: 1 })])
    assert.equal(results[0].status, 'fulfilled')
    const product = results[0].value
    assert.equal((await db.collection(`${base}/products`).get()).size, 2)
    assert.equal((await db.collection('purchasesV2').get()).size, results[1].status === 'fulfilled' ? 1 : 0)
    assert.equal(product.currentQuantity, results[1].status === 'fulfilled' ? 2 : 0)
  })
  it('larger audit preserves five committed counts and finishes interrupted after a stale sixth', async () => {
    const b = db.batch(), counts = []
    for (let i = 0; i < 6; i++) {
      const productId = i ? `p${i}` : 'a'
      if (i) { b.set(db.doc(`${base}/products/${productId}`), { id: productId, name: productId, barcode: `0000${i + 1}`, currentQuantity: 20, sellingPricePaise: 9000, revision: 1 }); b.set(db.doc(`${base}/productCosts/${productId}`), { productId, costPaise: 6000 }) }
      counts.push({ productId, physicalQuantity: 17, expectedRevision: 1 })
    }
    await b.commit()
    const id = randomUUID(); await call(audit.begin, { operationId: randomUUID(), id, note: 'Six item physical count', counts })
    const first = { operationId: randomUUID(), id, groupIndex: 0 }; await call(audit.group, first)
    await db.doc(`${base}/products/p5`).update({ revision: 2, currentQuantity: 19 })
    const error = await call(audit.group, { operationId: randomUUID(), id, groupIndex: 1 }).then(() => null, e => e)
    assert.equal(error.details.stockUnposted, true)
    const completed = await call(audit.finish, { operationId: randomUUID(), id, interrupted: true })
    assert.equal(completed.itemCount, 5); assert.equal(completed.netValuePaise, -90000)
    assert.equal((await db.collection(`${base}/stockAudits`).get()).size, 5)
    assert.equal((await call(audit.group, first)).length, 5)
    assert.equal((await db.doc(`${base}/products/p5`).get()).get('currentQuantity'), 19)
  })
  it('reversal skips a restored MRP that would breach a later selling price and preserves later cost', async () => {
    const r = await receive(draft(undefined, { lines: [line(3, { mrpPaise: 11000, sellingPricePaise: 11000 })] }))
    await call(prices.change, { operationId: `stock-price-${randomUUID()}`, productId: 'a', expectedRevision: 2, mrpPaise: 11000, sellingPricePaise: 10500, reason: 'Later selling price correction' })
    await db.doc(`${base}/productCosts/a`).update({ importRunId: 'grn:later-receipt', costPaise: 7000 })
    const preview = await call(receiving.previewReverse, { id: r.saved.id }, owner)
    assert.equal(preview.lines[0].priceRestoration, 'skipped-price-ceiling'); assert.equal(preview.lines[0].costInvalidated, false)
    await call(receiving.reverse, await reversal(r.saved.id), owner)
    const product = (await db.doc(`${base}/products/a`).get()).data()
    assert.equal(product.sellingPricePaise, 10500); assert.equal(product.sourceValues['Printed MRP'], '110.00')
    assert.equal((await db.doc(`${base}/productCosts/a`).get()).get('costPaise'), 7000)
  })
  it('200-line receipt remains one transaction without introducing a smaller GRN line cap', async () => {
    const b = db.batch(), received = []
    for (let i = 0; i < 200; i++) {
      const productId = `large-${i}`; b.set(db.doc(`${base}/products/${productId}`), { id: productId, name: productId, barcode: `L${i}`, category: 'Fixture', active: true, currentQuantity: 20, sellingPricePaise: 9000, sourceValues: { 'Printed MRP': '100.00' }, revision: 1 })
      received.push(line(1, { productId, barcode: `L${i}`, productName: productId }))
    }
    await b.commit(); const r = await receive(draft(undefined, { lines: received, invoiceTotalPaise: 1200000 }))
    assert.equal(r.result.totalPaise, 1200000)
    assert.equal((await db.collection(`${base}/stockMovements`).get()).size, 200)
    assert.equal((await db.doc(`${base}/products/large-199`).get()).get('currentQuantity'), 21)
    assert.equal((await db.doc('vendorAccountStatesV2/vendor').get()).get('outstandingPaise'), 1200000)
  })
  it('permission failure during recovery cannot claim the earlier operation was unposted', async () => {
    const r = await receive(); await db.doc('users/billing').update({ disabled: true })
    const error = await call(receiving.submit, r.intent).then(() => null, e => e)
    assert.equal(error.code, 'permission-denied'); assert.equal(error.details.stockUnposted, undefined)
    await db.doc('users/billing').update({ disabled: false })
    assert.deepEqual(await call(receiving.submit, r.intent), r.result)
    assert.equal((await db.doc(`${base}/products/a`).get()).get('currentQuantity'), 23)
  })
  it('unknown historical selling price is never invented as zero and can be explicitly corrected with evidence', async () => {
    const { FieldValue } = require('firebase-admin/firestore')
    await db.doc(`${base}/products/a`).update({ sellingPricePaise: FieldValue.delete() })
    await assert.rejects(call(receiving.saveDraft, draft()), /selling price is unavailable/)
    const record = await call(prices.change, { operationId: `stock-price-${randomUUID()}`, productId: 'a', expectedRevision: 1, mrpPaise: 10000, sellingPricePaise: 9000, reason: 'Explicit correction of unavailable price' })
    assert.equal(record.before.sellingPricePaise, null); assert.equal(record.beforeRecordedValues.selling, null)
    assert.equal((await db.doc(`${base}/products/a`).get()).get('sellingPricePaise'), 9000)
    assert.equal((await db.collection(`${base}/stockPriceChanges`).get()).size, 1)
  })
  it('equivalent receipt lines and ambiguous legacy barcode identities reject without stock or payable effects', async () => {
    await assert.rejects(call(receiving.saveDraft, draft(undefined, { lines: [line(1, { productId: 'new-a', barcode: '036000291452', newProduct: true }), line(1, { productId: 'new-b', barcode: '0036000291452', newProduct: true })] })), /Equivalent UPC/)
    const saved = await call(receiving.saveDraft, draft())
    await db.doc(`${base}/products/duplicate`).set({ barcode: '00001', name: 'Duplicate', active: true, revision: 1 })
    await assert.rejects(call(receiving.submit, { operationId: randomUUID(), id: saved.id, expectedRevision: 1 }), /multiple catalogue/)
    assert.equal((await db.collection('purchasesV2').get()).size, 0)
    assert.equal((await db.doc(`${base}/products/a`).get()).get('currentQuantity'), 20)
  })
  it('reversal never deletes unavailable historical MRP text or posts prices while the ledger is inactive', async () => {
    const r = await receive(draft(undefined, { lines: [line(3, { sellingPricePaise: 10000 })] }))
    await db.doc(`${base}/products/a`).update({ sourceValues: { 'Printed MRP': 'unreadable legacy value' } })
    const preview = await call(receiving.previewReverse, { id: r.saved.id }, owner)
    assert.equal(preview.lines[0].priceRestoration, 'skipped-mrp-unavailable')
    assert.equal(preview.lines[0].pricesAfter.sellingPricePaise, 10000)
    await db.doc('appMetadata/vendorLedgerV2Config').update({ enabled: false })
    await assert.rejects(call(receiving.reverse, { operationId: randomUUID(), id: r.saved.id, expectedRevision: preview.expectedRevision, confirmationHash: preview.confirmationHash, reason: 'Synthetic reversal' }, owner), /ledger is inactive/)
    assert.equal((await db.doc(`${base}/products/a`).get()).get('currentQuantity'), 23)
    await db.doc('appMetadata/vendorLedgerV2Config').update({ enabled: true })
    await call(receiving.reverse, await reversal(r.saved.id), owner)
    assert.equal((await db.doc(`${base}/products/a`).get()).get('sourceValues')['Printed MRP'], 'unreadable legacy value')
  })
  it('anonymous, missing and disabled profiles cannot mutate; spoofed root authority fields reject', async () => {
    const d = draft()
    for (const who of [null, { uid: 'missing' }]) await assert.rejects(call(receiving.saveDraft, d, who))
    await db.doc('users/billing').update({ disabled: true }); await assert.rejects(call(receiving.saveDraft, d), /account cannot/)
    await assert.rejects(call(receiving.saveDraft, { ...d, actor: owner }, owner), /unsupported fields/)
    assert.equal((await db.collection(`${base}/goodsReceipts`).get()).size, 0)
  })
})
