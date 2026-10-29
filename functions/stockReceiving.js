const { randomBytes } = require('node:crypto')
const s = require('./stockOperations')
const { receiptPricing } = require('./receiptPricing')

const normalizeInvoice = value => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('en-IN')
const eventId = (...parts) => parts.map(p => encodeURIComponent(String(p))).join(':')
function createStockReceivingHandlers(db, clock = () => new Date().toISOString()) {
  const { ref, run } = s.createOperations(db, clock)
  function lines(input, posting = false) {
    if (!Array.isArray(input) || !input.length) s.fail('Scan at least one product.', 'invalid-argument')
    const result = input.map(line => {
      if (!line || typeof line !== 'object') s.fail('Invalid receipt line.', 'invalid-argument')
      const selling = line.sellingPricePaise === undefined || line.sellingPricePaise === null ? undefined : s.integer(line.sellingPricePaise, 'Selling price')
      const mrp = line.mrpPaise === undefined || line.mrpPaise === null ? null : s.integer(line.mrpPaise, 'MRP')
      if (line.internalBarcode === true && line.newProduct !== true) s.fail('Internal barcodes can only be assigned to new GRN products.', 'invalid-argument')
      if (posting) { s.integer(selling, 'Selling price'); s.integer(mrp, 'MRP') }
      return { productId: s.id(line.productId), barcode: s.text(line.barcode, 'Barcode', 160), productName: s.text(line.productName, 'Product name', 500), category: line.newProduct === true ? s.text(line.category, 'Category', 500) : String(line.category ?? '').trim(), quantity: s.integer(line.quantity, 'Quantity'), unitCostPaise: s.integer(line.unitCostPaise, 'Unit cost'), ...(selling !== undefined ? { sellingPricePaise: selling } : {}), mrpPaise: mrp, lineTotalPaise: s.safe(line.quantity * line.unitCostPaise), ...(line.newProduct === true ? { newProduct: true } : { expectedRevision: s.integer(line.expectedRevision, 'Scanned product revision (open legacy drafts in Receive Stock and review/re-scan)', 1) }), ...(line.internalBarcode === true ? { internalBarcode: true } : {}), mrpChanged: line.mrpChanged === true }
    })
    if (new Set(result.map(l => l.productId)).size !== result.length || new Set(result.map(l => l.barcode)).size !== result.length) s.fail('Each product/barcode may appear only once in a GRN.')
    const identifiers = new Set()
    for (const line of result) for (const alias of s.aliases(line.barcode)) {
      if (identifiers.has(alias)) s.fail('Equivalent UPC/EAN barcodes refer to the same product. Combine them into one receipt line.')
      identifiers.add(alias)
    }
    if (result.some(l => l.mrpPaise !== null && l.sellingPricePaise !== undefined && l.sellingPricePaise > l.mrpPaise)) s.fail('Selling price cannot be greater than MRP.', 'invalid-argument')
    return result
  }
  async function createProduct(request) {
    const d = s.object(request.data, ['operationId', 'barcode', 'name', 'sellingPricePaise'])
    const barcode = s.text(d.barcode, 'Barcode', 160), name = s.text(d.name, 'Product name', 500), sellingPricePaise = s.integer(d.sellingPricePaise, 'Selling price')
    return run(request, 'create-product', { ...d, barcode, name, sellingPricePaise }, s.staff, async ({ tx, actor, timestamp, writes }) => {
      const newId = `barcode_${s.hash(barcode)}`, productId = await s.barcodeIdentity(db, tx, writes, barcode, newId, timestamp), snap = await tx.get(ref('products', productId))
      if (snap.exists) {
        if (snap.get('active') !== true) s.fail('This barcode belongs to an inactive product. Ask the owner to review it.')
        if (!s.aliases(barcode).includes(snap.get('barcode'))) s.fail('Barcode identity is inconsistent. Ask the owner to review it.')
        s.prices(snap.data()); s.integer(snap.get('revision'), 'Recorded product revision', 1)
        return { ...snap.data(), id: snap.id }
      }
      if (productId !== newId) s.fail('Barcode reservation points to an unavailable product. Ask the owner to review it.')
      const product = { id: productId, barcode, name, searchName: s.searchName(name), searchTokens: s.tokens(name), category: 'Uncategorized', brand: '', vendor: '', sourceValues: {}, sellingPricePaise, currentQuantity: 0, revision: 1, active: true, createdFromPosBarcode: true, createdAt: timestamp, createdByUid: actor.id, createdByName: actor.name, ...s.updated(actor, timestamp) }
      writes.push(() => tx.create(ref('products', productId), product), () => tx.create(ref('events', `created-${d.operationId}`), { type: 'product-created-from-barcode', productId, barcode, createdAt: timestamp, ...s.actorFields(actor) }))
      return product
    })
  }
  async function allocateInternalBarcode(request) {
    const d = s.object(request.data, ['operationId', 'draftId', 'productId'])
    const input = { ...d, draftId: s.id(d.draftId), productId: s.id(d.productId) }
    return run(request, 'allocate-internal-grn-barcode', input, s.staff, async ({ tx, actor, timestamp, writes }) => {
      const draft = await tx.get(ref('goodsReceipts', input.draftId))
      if (draft.exists && (draft.get('status') !== 'draft' || (draft.get('createdByUid') !== actor.id && actor.role !== 'owner'))) s.fail('Only the draft creator or owner can allocate a barcode for this GRN.', 'permission-denied')
      for (let attempt = 0; attempt < 5; attempt++) {
        const barcode = (randomBytes(8).readBigUInt64BE() % 10000000000000000n).toString().padStart(16, '0')
        const reservationRef = ref('barcodeReservations', s.hash(barcode))
        const reservation = await tx.get(reservationRef)
        const product = await tx.get(db.collection(`${s.base}/products`).where('barcode', '==', barcode).limit(1))
        if (reservation.exists || !product.empty) continue
        const record = { barcode, productId: input.productId, kind: 'internal-grn', draftId: input.draftId, allocatedByUid: actor.id, allocatedByName: actor.name, createdAt: timestamp }
        writes.push(() => tx.create(reservationRef, record), () => tx.create(ref('events', `barcode-${d.operationId}`), { type: 'internal-stock-barcode-issued', barcode, draftId: input.draftId, productId: input.productId, createdAt: timestamp, ...s.actorFields(actor) }))
        return { barcode, draftId: input.draftId, productId: input.productId }
      }
      s.fail('Unable to allocate a unique internal barcode. Retry this action.', 'resource-exhausted')
    })
  }
  async function saveDraft(request) {
    const d = s.object(request.data, ['operationId', 'id', 'expectedRevision', 'vendorId', 'invoiceNumber', 'invoiceDate', 'receiptDate', 'lines', 'invoiceTotalPaise', 'pricingMode', 'shortage'])
    if (d.pricingMode !== undefined && d.pricingMode !== 'received-stock') s.fail('Invalid receipt pricing mode.')
    const input = { ...d, id: s.id(d.id), expectedRevision: s.integer(d.expectedRevision, 'Draft revision'), vendorId: s.id(d.vendorId), invoiceNumber: s.text(d.invoiceNumber, 'Invoice number', 160), invoiceDate: s.date(d.invoiceDate), receiptDate: s.date(d.receiptDate), lines: lines(d.lines), invoiceTotalPaise: 0 }
    const pricing = receiptPricing(input.lines, d.shortage)
    if (d.pricingMode === undefined && !d.shortage && d.invoiceTotalPaise !== undefined && d.invoiceTotalPaise !== pricing.invoiceTotalPaise) s.fail('The invoice amount differs from received stock. Reload Receive Stock and review the complete receipt or its shortage credit note before saving.')
    if (pricing) { input.invoiceTotalPaise = pricing.invoiceTotalPaise; input.pricingMode = 'received-stock'; input.shortage = d.shortage ?? null }
    return run(request, 'save-draft', input, s.staff, async ({ tx, actor, timestamp, writes }) => {
      const source = ref('goodsReceipts', input.id), old = await tx.get(source), vendor = await tx.get(db.doc(`vendorsV2/${input.vendorId}`))
      if (!vendor.exists || vendor.get('active') !== true) s.fail('Choose an active vendor.')
      if (old.exists && (old.get('status') !== 'draft' || (old.get('createdByUid') !== actor.id && actor.role !== 'owner'))) s.fail('Only the draft creator or owner can change an unsubmitted draft.', 'permission-denied')
      if ((old.exists ? old.get('revision') : 0) !== input.expectedRevision) s.fail('The draft changed. Reload it before saving.')
      const quotedLines = []
      for (const line of input.lines) {
        const reservation = await tx.get(ref('barcodeReservations', s.hash(line.barcode)))
        if (reservation.exists && reservation.get('kind') === 'internal-grn' && (line.internalBarcode !== true || reservation.get('draftId') !== input.id || reservation.get('productId') !== line.productId)) s.fail('This internal barcode is reserved for another GRN line.')
        if (line.internalBarcode === true && (!reservation.exists || reservation.get('kind') !== 'internal-grn' || reservation.get('draftId') !== input.id || reservation.get('productId') !== line.productId)) s.fail('Allocate a valid internal barcode for this GRN line before saving.')
        const product = line.newProduct ? null : await tx.get(ref('products', line.productId))
        quotedLines.push({ ...line, ...(product?.exists ? { sellingPriceBeforePaise: product.get('sellingPricePaise'), mrpBeforePaise: s.prices(product.data()).mrpPaise, quoteRevision: product.get('revision'), stockAtScan: product.get('currentQuantity') } : {}) })
      }
      const receipt = { id: input.id, status: 'draft', vendorId: input.vendorId, vendorName: vendor.get('canonicalName'), invoiceNumber: input.invoiceNumber, invoiceDate: input.invoiceDate, receiptDate: input.receiptDate, lines: quotedLines, invoiceTotalPaise: input.invoiceTotalPaise, totalPaise: input.invoiceTotalPaise, revision: input.expectedRevision + 1, createdAt: old.exists ? old.get('createdAt') : timestamp, createdByUid: old.exists ? old.get('createdByUid') : actor.id, createdByName: old.exists ? old.get('createdByName') : actor.name, ...s.updated(actor, timestamp) }
      if (pricing) Object.assign(receipt, pricing, { pricingMode: 'received-stock', shortage: pricing.shortage ?? null })
      writes.push(() => tx.set(source, receipt)); return receipt
    })
  }
  async function confirmCreditNote(request) {
    const d = s.object(request.data, ['operationId', 'id', 'expectedRevision', 'creditNoteNumber', 'creditNoteDate'])
    s.id(d.id); s.text(d.creditNoteNumber, 'Credit note number', 160); s.date(d.creditNoteDate)
    return run(request, 'confirm-shortage-credit-note', d, ['owner'], async ({ tx, actor, timestamp, writes }) => {
      const source = ref('goodsReceipts', d.id), snap = await tx.get(source), receipt = snap.data()
      if (!receipt || receipt.status !== 'submitted' || receipt.pricingMode !== 'received-stock' || receipt.shortage?.state !== 'pending' || receipt.payableOwner !== true) s.fail('This GRN has no pending shortage credit note.')
      s.revision(receipt.revision, d.expectedRevision)
      if (d.creditNoteDate < receipt.invoiceDate || d.creditNoteDate > s.istDate(timestamp)) s.fail('Credit note date must be between invoice date and today.')
      const cfg = await tx.get(db.doc('appMetadata/vendorLedgerV2Config')), vendor = await tx.get(db.doc(`vendorsV2/${receipt.vendorId}`))
      if (cfg.get('enabled') !== true || vendor.get('active') !== true) s.fail('The vendor ledger and vendor must be active.')
      const pricing = receiptPricing(lines(receipt.lines, true), { ...receipt.shortage, state: 'received', creditNoteNumber: d.creditNoteNumber, creditNoteDate: d.creditNoteDate })
      const amount = pricing.shortage.expectedCreditPaise
      const purchaseRef = db.doc(`purchasesV2/${receipt.payablePurchaseId}`), invoiceRef = db.doc(`invoiceStatesV2/${receipt.payablePurchaseId}`), accountRef = db.doc(`vendorAccountStatesV2/${receipt.vendorId}`)
      const purchase = await tx.get(purchaseRef), invoice = await tx.get(invoiceRef), account = await tx.get(accountRef)
      const noteRef = db.doc(`vendorCreditNoteReservationsV2/${s.hash(`${receipt.vendorId}:${normalizeInvoice(d.creditNoteNumber)}`)}`)
      if ((await tx.get(noteRef)).exists) s.fail('This vendor credit note is already linked; it cannot be deducted twice.')
      if (!purchase.exists || purchase.get('grnId') !== receipt.id || purchase.get('invoiceTotalPaise') !== receipt.shortage.originalInvoiceTotalPaise || !invoice.exists || invoice.get('vendorId') !== receipt.vendorId || !account.exists || account.get('vendorId') !== receipt.vendorId) s.fail('Original invoice or account evidence is inconsistent; no credit was posted.')
      const oldOpen = s.integer(invoice.get('openAmountPaise'), 'Invoice outstanding'), reduction = Math.min(amount, oldOpen), nextOpen = oldOpen - reduction
      if (nextOpen < s.integer(invoice.get('reservedAmountPaise') ?? 0, 'Reserved payments')) s.fail('A pending cheque reserves this invoice. Review that cheque before recording the credit note.')
      const outstanding = s.integer(account.get('outstandingPaise'), 'Vendor outstanding')
      if (outstanding < reduction) s.fail('Vendor account does not reconcile with this invoice; ask the owner to review it.')
      const cheques = await tx.get(db.collection('chequesV2').where('vendorId', '==', receipt.vendorId).where('status', 'in', ['issued', 'presented']).limit(201))
      if (cheques.size > 200) s.fail('Vendor cheque history exceeds the credit-note bound; no credit was posted.')
      const committed = cheques.docs.filter(doc => !doc.get('trackingOnly')).reduce((sum, doc) => s.safe(sum + s.integer(doc.get('amountPaise'), 'Cheque amount')), 0)
      if (outstanding - reduction < committed) s.fail('Pending vendor cheques reserve this payable. Review those cheques before applying the credit note.')
      const ledgerId = `shortage-credit-${receipt.id}`
      const next = { ...receipt, ...pricing, totalPaise: pricing.invoiceTotalPaise, revision: receipt.revision + 1, ...s.updated(actor, timestamp) }
      writes.push(() => tx.create(noteRef, { vendorId: receipt.vendorId, number: d.creditNoteNumber.trim(), date: d.creditNoteDate, amountPaise: amount, goodsReceiptId: receipt.id, purchaseId: purchase.id, createdAt: timestamp, createdByUserId: actor.id }),
        () => tx.create(db.doc(`vendorLedgerEntriesV2/${ledgerId}`), { id: ledgerId, vendorId: receipt.vendorId, eventType: 'vendor-credit', posting: 'financial', signedAmountPaise: -amount, sourceType: 'goods-receipt', sourceRecordId: receipt.id, sourceRevision: next.revision, reason: `Shortage credit note ${d.creditNoteNumber.trim()}`, occurredOn: d.creditNoteDate, createdAt: timestamp, createdByUserId: actor.id }),
        () => tx.update(purchaseRef, { invoiceTotalPaise: pricing.invoiceTotalPaise, shortage: pricing.shortage, originalInvoiceTotalPaise: receipt.shortage.originalInvoiceTotalPaise, revision: purchase.get('revision') + 1, updatedAt: timestamp, updatedByUserId: actor.id }),
        () => tx.update(invoiceRef, { openAmountPaise: nextOpen, revision: invoice.get('revision') + 1, updatedAt: timestamp, updatedByUserId: actor.id }),
        () => tx.update(accountRef, { outstandingPaise: outstanding - reduction, vendorCreditPaise: s.safe((account.get('vendorCreditPaise') ?? 0) + amount - reduction), revision: account.get('revision') + 1, lastLedgerEntryId: ledgerId, updatedAt: timestamp, updatedByUserId: actor.id }),
        () => tx.set(source, next), () => tx.create(ref('events', `credit-${d.operationId}`), { type: 'shortage-credit-note-confirmed', goodsReceiptId: receipt.id, amountPaise: amount, creditNoteNumber: d.creditNoteNumber.trim(), createdAt: timestamp, ...s.actorFields(actor) }))
      return next
    })
  }
  async function deleteDraft(request) {
    const d = s.object(request.data, ['operationId', 'id', 'expectedRevision']); s.id(d.id)
    return run(request, 'delete-draft', d, s.staff, async ({ tx, actor, writes }) => {
      const source = ref('goodsReceipts', d.id), snap = await tx.get(source)
      if (!snap.exists || snap.get('status') !== 'draft') s.fail('Only an unsubmitted draft can be deleted.')
      if (snap.get('createdByUid') !== actor.id && actor.role !== 'owner') s.fail('Only the draft creator or owner can delete it.', 'permission-denied')
      s.revision(snap.get('revision'), d.expectedRevision); writes.push(() => tx.delete(source)); return { id: d.id, deleted: true }
    })
  }
  async function submit(request) {
    const d = s.object(request.data, ['operationId', 'id', 'expectedRevision']); s.id(d.id)
    return run(request, 'submit-receipt', d, s.staff, async ({ tx, actor, timestamp, writes }) => {
      const source = ref('goodsReceipts', d.id), snap = await tx.get(source), receipt = snap.data()
      if (!receipt || receipt.status !== 'draft') s.fail('Only an unsubmitted GRN can be posted.')
      s.revision(receipt.revision, d.expectedRevision)
      if (receipt.pricingMode !== 'received-stock') s.fail('Open this older draft in Receive Stock, review its payable and save it before submitting.')
      const received = lines(receipt.lines, true), total = s.integer(receipt.invoiceTotalPaise, 'Full invoice payable', 1)
      if (receipt.pricingMode === 'received-stock' && receiptPricing(received, receipt.shortage).invoiceTotalPaise !== total) s.fail('Receipt payable does not reconcile with received stock and its credit note.')
      if (received.some(l => l.quantity <= 0 || l.unitCostPaise <= 0)) s.fail('Every received line needs a positive whole quantity and unit cost.')
      s.date(receipt.invoiceDate); s.date(receipt.receiptDate)
      const config = (await tx.get(db.doc('appMetadata/vendorLedgerV2Config'))).data(), vendor = await tx.get(db.doc(`vendorsV2/${s.id(receipt.vendorId)}`))
      if (config?.enabled !== true || !config.activationDate || receipt.invoiceDate < s.date(config.activationDate)) s.fail('Invoice date must be on or after approved vendor-ledger activation.')
      if (!vendor.exists || vendor.get('active') !== true) s.fail('Choose an active vendor.')
      const products = []
      for (const line of received) {
        const reservation = await tx.get(ref('barcodeReservations', s.hash(line.barcode)))
        if (reservation.exists && reservation.get('kind') === 'internal-grn' && (line.internalBarcode !== true || reservation.get('draftId') !== receipt.id || reservation.get('productId') !== line.productId)) s.fail('This internal barcode is reserved for another GRN line.')
        if (line.internalBarcode === true && (!reservation.exists || reservation.get('kind') !== 'internal-grn' || reservation.get('draftId') !== receipt.id || reservation.get('productId') !== line.productId)) s.fail('This internal barcode is not valid for the current GRN.')
        const product = await tx.get(ref('products', line.productId))
        const identity = await s.barcodeIdentity(db, tx, writes, line.barcode, line.productId, timestamp)
        if (identity !== line.productId) s.fail(`Barcode ${line.barcode} has another catalogue identity. Re-scan it; no records were merged.`)
        if (line.newProduct) {
          if (product.exists || identity !== line.productId) s.fail(`Barcode ${line.barcode} has already been added. Re-scan it.`)
        } else {
          if (!product.exists || product.get('barcode') !== line.barcode || product.get('active') !== true) s.fail('A scanned product changed or is inactive. Re-scan it.')
          s.revision(product.get('revision'), line.expectedRevision)
        }
        products.push(product)
      }
      const submittedLines = received.map((line, i) => ({ ...line, ...(products[i].exists ? { productName: products[i].get('name'), category: products[i].get('category') ?? '' } : {}), mrpChanged: s.prices(products[i].data()).mrpPaise !== line.mrpPaise, sellingPriceBeforePaise: products[i].exists ? products[i].get('sellingPricePaise') : null, mrpBeforePaise: s.prices(products[i].data()).mrpPaise, priceProvenanceBefore: products[i].data()?.priceProvenance ?? { mrp: null, selling: null } }))
      const accountRef = db.doc(`vendorAccountStatesV2/${receipt.vendorId}`), account = await tx.get(accountRef)
      if (account.exists) {
        if (account.get('vendorId') !== receipt.vendorId) s.fail('Vendor account identity does not match this invoice.')
        s.integer(account.get('outstandingPaise'), 'Recorded vendor outstanding'); s.integer(account.get('revision'), 'Recorded account revision', 1)
      } else if ((vendor.get('openingBalancePaise') ?? 0) > 0) s.fail('Opening payable account is missing. Ask the owner to review the ledger.')
      const normalizedInvoiceNumber = normalizeInvoice(receipt.invoiceNumber), reservationId = eventId(receipt.vendorId, normalizedInvoiceNumber), reservationRef = db.doc(`invoiceReservationsV2/${reservationId}`), reservation = await tx.get(reservationRef)
      if (receipt.pricingMode === 'received-stock' && receipt.shortage?.state === 'received') {
        const note = receipt.shortage
        if (note.creditNoteDate < receipt.invoiceDate || note.creditNoteDate > s.istDate(timestamp)) s.fail('Credit note date must be between invoice date and today.')
        const noteRef = db.doc(`vendorCreditNoteReservationsV2/${s.hash(`${receipt.vendorId}:${normalizeInvoice(note.creditNoteNumber)}`)}`)
        if ((await tx.get(noteRef)).exists) s.fail('This vendor credit note is already linked; it cannot be deducted twice.')
        writes.push(() => tx.create(noteRef, { vendorId: receipt.vendorId, number: note.creditNoteNumber, date: note.creditNoteDate, amountPaise: note.expectedCreditPaise, goodsReceiptId: receipt.id, purchaseId: `grn-${receipt.id}`, appliedInNetInvoice: true, createdAt: timestamp, createdByUserId: actor.id }))
      }
      let purchaseId = `grn-${receipt.id}`, payableCreated = false, origin
      if (reservation.exists) {
        if (receipt.pricingMode === 'received-stock') s.fail('This vendor invoice is already recorded. Open its existing GRN; a second payable or delivery cannot be posted.')
        if (!account.exists) s.fail('The original invoice account is missing. Ask the owner to review its source.')
        purchaseId = s.text(reservation.get('purchaseId'), 'Purchase reference', 500)
        const purchase = await tx.get(db.doc(`purchasesV2/${purchaseId}`)), invoice = await tx.get(db.doc(`invoiceStatesV2/${purchaseId}`))
        if (!purchase.exists || !invoice.exists || !purchase.get('grnId') || purchase.get('vendorId') !== receipt.vendorId || purchase.get('normalizedInvoiceNumber') !== normalizedInvoiceNumber || purchase.get('invoiceTotalPaise') !== total) s.fail('This invoice has different details or was recorded outside GRN. Review the ledger.')
        origin = await tx.get(ref('goodsReceipts', purchase.get('grnId')))
        if (!origin.exists || origin.get('status') !== 'submitted') s.fail('The original invoice GRN is no longer active.')
        const linked = origin.get('linkedReceiptIds') ?? []
        writes.push(() => tx.update(origin.ref, { linkedReceiptIds: [...new Set([...linked, receipt.id])], revision: origin.get('revision') + 1, ...s.updated(actor, timestamp) }))
      } else {
        const ledgerId = eventId('purchase', purchaseId, 1, 'purchase'), purchaseRef = db.doc(`purchasesV2/${purchaseId}`), invoiceRef = db.doc(`invoiceStatesV2/${purchaseId}`), ledgerRef = db.doc(`vendorLedgerEntriesV2/${ledgerId}`)
        for (const target of [purchaseRef, invoiceRef, ledgerRef]) if ((await tx.get(target)).exists) s.fail('GRN payable reference already exists or conflicts.')
        const purchase = { id: purchaseId, vendorId: receipt.vendorId, invoiceNumber: receipt.invoiceNumber, normalizedInvoiceNumber, invoiceDate: receipt.invoiceDate, receiptDate: receipt.receiptDate, invoiceTotalPaise: total, invoiceReservationId: reservationId, ledgerEntryId: ledgerId, notes: '', revision: 1, createdAt: timestamp, createdByUserId: actor.id, updatedAt: timestamp, updatedByUserId: actor.id, grnId: receipt.id, lines: submittedLines }
        if (receipt.pricingMode === 'received-stock') Object.assign(purchase, { pricingMode: receipt.pricingMode, receivedValuePaise: receipt.receivedValuePaise, originalInvoiceTotalPaise: receipt.shortage?.originalInvoiceTotalPaise ?? total, shortage: receipt.shortage ?? null })
        writes.push(() => tx.create(purchaseRef, purchase), () => tx.create(reservationRef, { id: reservationId, vendorId: receipt.vendorId, normalizedInvoiceNumber, purchaseId, createdAt: timestamp, createdByUserId: actor.id }), () => tx.create(ledgerRef, { id: ledgerId, vendorId: receipt.vendorId, eventType: 'purchase', posting: 'financial', signedAmountPaise: total, sourceType: 'purchase', sourceRecordId: purchaseId, sourceRevision: 1, occurredOn: receipt.invoiceDate, createdAt: timestamp, createdByUserId: actor.id }), () => tx.create(invoiceRef, { id: purchaseId, vendorId: receipt.vendorId, invoiceId: purchaseId, openAmountPaise: total, reservedAmountPaise: 0, revision: 1, updatedAt: timestamp, updatedByUserId: actor.id }), () => tx.set(accountRef, { ...(account.data() ?? { id: receipt.vendorId, vendorId: receipt.vendorId }), outstandingPaise: s.safe((account.get('outstandingPaise') ?? 0) + total), revision: (account.get('revision') ?? 0) + 1, lastLedgerEntryId: ledgerId, updatedAt: timestamp, updatedByUserId: actor.id }))
        payableCreated = true
      }
      received.forEach((line, i) => {
        const old = products[i].data(), movementId = `grn-${s.hash(`${receipt.id}:${line.productId}`)}`, quantity = s.safe((old?.currentQuantity ?? 0) + line.quantity), revision = s.safe((old?.revision ?? 0) + 1)
        const after = { mrpPaise: line.mrpPaise, sellingPricePaise: line.sellingPricePaise }, before = s.prices(old)
        const evidence = old ? s.priceEvidence({ tx, writes, ref, product: { ...old, id: line.productId }, after, sourceKind: 'goods-receipt', sourceRecordId: receipt.id, movementId, actor, timestamp, reason: `Receive stock: invoice ${receipt.invoiceNumber}`, afterRevision: revision }) : {}
        const provenance = { ...(old?.priceProvenance ?? { mrp: null, selling: null }), ...(before.mrpPaise !== after.mrpPaise ? { mrp: `grn:${receipt.id}` } : {}), ...(before.sellingPricePaise !== after.sellingPricePaise ? { selling: `grn:${receipt.id}` } : {}) }
        const product = { currentQuantity: quantity, revision, lastMovementId: movementId, sellingPricePaise: after.sellingPricePaise, sourceValues: s.priceSources(old?.sourceValues, after.mrpPaise), priceProvenance: provenance, ...(evidence.lastPriceEdit ? { lastPriceEdit: evidence.lastPriceEdit } : {}), ...s.updated(actor, timestamp) }
        writes.push(() => old ? tx.update(products[i].ref, product) : tx.create(products[i].ref, { ...product, id: line.productId, barcode: line.barcode, name: line.productName, searchName: line.productName.toLowerCase(), searchTokens: s.tokens(line.productName), category: line.category, brand: '', vendor: vendor.get('canonicalName'), active: true, createdAt: timestamp, createdByUid: actor.id, createdByName: actor.name, createdFromGoodsReceiptId: receipt.id }))
        writes.push(() => tx.create(ref('stockMovements', movementId), { id: movementId, productId: line.productId, barcode: line.barcode, type: 'goods-receipt', quantityDelta: line.quantity, beforeQuantity: old?.currentQuantity ?? 0, afterQuantity: quantity, productRevisionBefore: old?.revision ?? 0, productRevisionAfter: revision, businessDate: receipt.receiptDate, goodsReceiptId: receipt.id, createdAt: timestamp, ...s.actorFields(actor), ...(evidence.priceChanged ? { priceChanged: true, priceBefore: evidence.priceBefore, priceAfter: evidence.priceAfter, beforeMrpPaise: evidence.beforeMrpPaise, afterMrpPaise: evidence.afterMrpPaise, beforeSellingPricePaise: evidence.beforeSellingPricePaise, afterSellingPricePaise: evidence.afterSellingPricePaise } : {}) }), () => tx.set(ref('productCosts', line.productId), { productId: line.productId, costPaise: line.unitCostPaise, sourceValue: '', importRunId: `grn:${receipt.id}`, lastEventId: movementId, ...s.updated(actor, timestamp) }, { merge: true }))
      })
      writes.push(() => tx.update(source, { status: 'submitted', lines: submittedLines, totalPaise: total, invoiceTotalPaise: total, payablePurchaseId: purchaseId, payableOwner: payableCreated, ...(origin ? { originatingGoodsReceiptId: origin.id } : {}), revision: receipt.revision + 1, submittedAt: timestamp, submittedByUid: actor.id, submittedByName: actor.name, ...s.updated(actor, timestamp) }), () => tx.create(ref('events', `submitted-${receipt.id}`), { type: 'goods-receipt-submitted', goodsReceiptId: receipt.id, purchaseId, vendorId: receipt.vendorId, totalPaise: total, payableCreated, createdAt: timestamp, ...s.actorFields(actor) }))
      return { purchaseId, totalPaise: total, payableCreated }
    })
  }
  async function reversalPlan(tx, receiptId) {
    const source = await tx.get(ref('goodsReceipts', receiptId)), receipt = source.data()
    if (!receipt || receipt.status !== 'submitted' || !receipt.payablePurchaseId) s.fail('Only a submitted GRN can be reversed.')
    const products = [], costs = [], effects = []
    for (const line of receipt.lines) {
      const returned = await tx.get(db.doc(`vendorReturnReceiptStates/${s.hash(receipt.id+':'+line.productId)}`))
      if ((returned.get('returnedQuantity') ?? 0) > 0) s.fail('This GRN has dispatched vendor returns. Review their linked stock and credit records before reversal.')
      const product = await tx.get(ref('products', line.productId)), cost = await tx.get(ref('productCosts', line.productId))
      if (!product.exists) s.fail('A receipt product is unavailable. Review its source history.')
      const p = product.data(), before = s.prices(p), after = { ...before }, owner = `grn:${receiptId}`, known = !!line.priceProvenanceBefore
      if (known && p.priceProvenance?.selling === owner && before.sellingPricePaise === line.sellingPricePaise && Number.isSafeInteger(line.sellingPriceBeforePaise) && line.sellingPriceBeforePaise >= 0) after.sellingPricePaise = line.sellingPriceBeforePaise
      if (known && p.priceProvenance?.mrp === owner && before.mrpPaise === line.mrpPaise && Number.isSafeInteger(line.mrpBeforePaise) && line.mrpBeforePaise >= 0) after.mrpPaise = line.mrpBeforePaise
      const unknownMrp = after.mrpPaise === null && after.sellingPricePaise !== before.sellingPricePaise
      const ceilingBlocked = unknownMrp || (after.mrpPaise !== null && after.sellingPricePaise > after.mrpPaise)
      if (ceilingBlocked) Object.assign(after, before)
      products.push(product); costs.push(cost)
      effects.push({ productId: product.id, barcode: p.barcode, quantityBefore: p.currentQuantity, quantityAfter: s.safe(p.currentQuantity - s.integer(line.quantity, 'Recorded receipt quantity', 1)), pricesBefore: before, pricesAfter: after, priceRestoration: !known ? 'unavailable-historical-provenance' : unknownMrp ? 'skipped-mrp-unavailable' : ceilingBlocked ? 'skipped-price-ceiling' : before.sellingPricePaise !== after.sellingPricePaise || before.mrpPaise !== after.mrpPaise ? 'restored-receipt-prices' : 'preserve-later-edits', costInvalidated: cost.get('importRunId') === owner })
    }
    let origin, purchase, invoice, account
    if (receipt.payableOwner === false) {
      origin = await tx.get(ref('goodsReceipts', receipt.originatingGoodsReceiptId))
      if (!origin.exists || origin.get('status') !== 'submitted') s.fail('Original invoice GRN is not active.')
    } else {
      const config = (await tx.get(db.doc('appMetadata/vendorLedgerV2Config'))).data()
      if (config?.enabled !== true) s.fail('The vendor ledger is inactive. Enable it before reversing the invoice payable.')
      if ((receipt.linkedReceiptIds ?? []).length) s.fail('Reverse linked partial receipts first.')
      purchase = await tx.get(db.doc(`purchasesV2/${receipt.payablePurchaseId}`)); invoice = await tx.get(db.doc(`invoiceStatesV2/${receipt.payablePurchaseId}`)); account = await tx.get(db.doc(`vendorAccountStatesV2/${receipt.vendorId}`))
      if (!purchase.exists || !invoice.exists || !account.exists || purchase.get('grnId') !== receiptId || purchase.get('vendorId') !== receipt.vendorId || invoice.get('vendorId') !== receipt.vendorId) s.fail('GRN payable linkage is incomplete.')
      const open = s.integer(invoice.get('openAmountPaise'), 'Open payable'), total = s.integer(purchase.get('invoiceTotalPaise'), 'Original invoice total', 1)
      s.integer(invoice.get('revision'), 'Recorded invoice revision', 1); s.integer(account.get('revision'), 'Recorded account revision', 1); s.integer(account.get('outstandingPaise'), 'Recorded vendor outstanding'); s.integer(account.get('vendorCreditPaise') ?? 0, 'Recorded vendor credit')
      if (invoice.get('reservedAmountPaise') !== 0) s.fail('A payment is reserved against this invoice. Finish it before reversal.')
      if (open > total || account.get('outstandingPaise') < open) s.fail('Vendor outstanding does not reconcile with this invoice.')
    }
    const preview = { id: receiptId, expectedRevision: receipt.revision, lines: effects, payableReversed: receipt.payableOwner !== false, openPayableRemovedPaise: invoice?.get('openAmountPaise') ?? 0, vendorCreditAddedPaise: purchase ? purchase.get('invoiceTotalPaise') - invoice.get('openAmountPaise') : 0 }
    preview.confirmationHash = s.hash(JSON.stringify(s.canonical({ receipt, products: products.map(p => p.data()), costs: costs.map(c => c.data() ?? null), origin: origin?.data() ?? null, purchase: purchase?.data() ?? null, invoice: invoice?.data() ?? null, account: account?.data() ?? null })))
    return { source, receipt, products, costs, origin, purchase, invoice, account, preview }
  }
  async function previewReverse(request) {
    const d = s.object(request.data, ['id']); s.id(d.id)
    if (!request.auth?.uid) s.fail('Sign in before reversal.', 'unauthenticated')
    return db.runTransaction(async tx => {
      const profile = (await tx.get(db.doc(`users/${request.auth.uid}`))).data()
      if (!activeOwner(profile)) s.fail('Only the owner can reverse stock receipts.', 'permission-denied')
      return (await reversalPlan(tx, d.id)).preview
    })
  }
  function activeOwner(profile) { return require('./cashBalance').activeUser(profile) && profile.role === 'owner' }
  async function reverse(request) {
    const d = s.object(request.data, ['operationId', 'id', 'expectedRevision', 'confirmationHash', 'reason']); s.id(d.id); const reason = s.text(d.reason, 'Reversal reason')
    return run(request, 'reverse-receipt', { ...d, reason }, ['owner'], async ({ tx, actor, timestamp, writes, operationId }) => {
      const plan = await reversalPlan(tx, d.id), { source, receipt, products, costs, origin, purchase, invoice, account, preview } = plan
      s.revision(receipt.revision, d.expectedRevision)
      if (d.confirmationHash !== preview.confirmationHash) s.fail('Reversal effects changed. Reopen the preview and confirm current values.')
      products.forEach((snapshot, i) => {
        const p = snapshot.data(), line = receipt.lines[i], effect = preview.lines[i], movementId = `reverse-${s.hash(`${receipt.id}:${line.productId}`)}`, afterRevision = p.revision + 1
        const evidence = s.priceEvidence({ tx, writes, ref, product: { ...p, id: snapshot.id }, after: effect.pricesAfter, sourceKind: 'goods-receipt-reversal', sourceRecordId: receipt.id, movementId, actor, timestamp, reason, afterRevision })
        const provenance = { ...(p.priceProvenance ?? {}) }
        if (effect.pricesBefore.mrpPaise !== effect.pricesAfter.mrpPaise) provenance.mrp = line.priceProvenanceBefore?.mrp ?? null
        if (effect.pricesBefore.sellingPricePaise !== effect.pricesAfter.sellingPricePaise) provenance.selling = line.priceProvenanceBefore?.selling ?? null
        const priceUpdates = {
          ...(effect.pricesBefore.sellingPricePaise !== effect.pricesAfter.sellingPricePaise ? { sellingPricePaise: effect.pricesAfter.sellingPricePaise } : {}),
          ...(effect.pricesBefore.mrpPaise !== effect.pricesAfter.mrpPaise ? { sourceValues: s.priceSources(p.sourceValues, effect.pricesAfter.mrpPaise) } : {}),
          ...(evidence.lastPriceEdit ? { priceProvenance: provenance, lastPriceEdit: evidence.lastPriceEdit } : {}),
        }
        writes.push(() => tx.update(snapshot.ref, { currentQuantity: effect.quantityAfter, revision: afterRevision, lastMovementId: movementId, ...priceUpdates, ...s.updated(actor, timestamp) }), () => tx.create(ref('stockMovements', movementId), { id: movementId, productId: snapshot.id, barcode: p.barcode, type: 'goods-receipt-reversal', quantityDelta: -line.quantity, beforeQuantity: p.currentQuantity, afterQuantity: effect.quantityAfter, productRevisionBefore: p.revision, productRevisionAfter: afterRevision, businessDate: receipt.receiptDate, goodsReceiptId: receipt.id, reason, priceRestoration: effect.priceRestoration, ...(evidence.priceChanged ? { priceChanged: true, priceBefore: evidence.priceBefore, priceAfter: evidence.priceAfter, beforeMrpPaise: evidence.beforeMrpPaise, afterMrpPaise: evidence.afterMrpPaise, beforeSellingPricePaise: evidence.beforeSellingPricePaise, afterSellingPricePaise: evidence.afterSellingPricePaise } : {}), createdAt: timestamp, ...s.actorFields(actor) }))
        if (effect.costInvalidated) writes.push(() => tx.update(costs[i].ref, { costPaise: null, importRunId: `grn-reversal:${receipt.id}`, ...s.updated(actor, timestamp) }))
      })
      const reversalId = purchase ? `reversal-${operationId}` : ''
      if (origin) writes.push(() => tx.update(origin.ref, { linkedReceiptIds: (origin.get('linkedReceiptIds') ?? []).filter(key => key !== receipt.id), revision: origin.get('revision') + 1, ...s.updated(actor, timestamp) }))
      if (purchase) {
        writes.push(() => tx.create(db.doc(`vendorLedgerEntriesV2/${reversalId}`), { id: reversalId, vendorId: receipt.vendorId, eventType: 'reversal', posting: 'financial', signedAmountPaise: -preview.openPayableRemovedPaise || 0, sourceType: 'goods-receipt', sourceRecordId: receipt.payablePurchaseId, sourceRevision: 1, goodsReceiptId: receipt.id, reversalOfEntryId: purchase.get('ledgerEntryId'), reason, occurredOn: receipt.receiptDate, createdAt: timestamp, createdByUserId: actor.id }), () => tx.update(account.ref, { outstandingPaise: s.safe(account.get('outstandingPaise') - preview.openPayableRemovedPaise), vendorCreditPaise: s.safe((account.get('vendorCreditPaise') ?? 0) + preview.vendorCreditAddedPaise), revision: account.get('revision') + 1, lastLedgerEntryId: reversalId, updatedAt: timestamp, updatedByUserId: actor.id }), () => tx.update(invoice.ref, { openAmountPaise: 0, revision: invoice.get('revision') + 1, updatedAt: timestamp, updatedByUserId: actor.id, reversalReason: reason, reversalLedgerEntryId: reversalId }))
      }
      writes.push(() => tx.update(source.ref, { status: 'reversed', reversalReason: reason, revision: receipt.revision + 1, ...(purchase ? { reversalLedgerEntryId: reversalId, reversedOpenAmountPaise: preview.openPayableRemovedPaise, vendorCreditPaiseAdded: preview.vendorCreditAddedPaise } : {}), ...s.updated(actor, timestamp) }), () => tx.create(ref('events', `reversed-${receipt.id}`), { type: 'goods-receipt-reversed', goodsReceiptId: receipt.id, reversalLedgerEntryId: reversalId, payableChanged: !!purchase, reason, createdAt: timestamp, ...s.actorFields(actor) }))
      return { reversalId, payableReversed: !!purchase, ...preview }
    })
  }
  return { createProduct, allocateInternalBarcode, saveDraft, deleteDraft, submit, confirmCreditNote, previewReverse, reverse }
}
module.exports = { createStockReceivingHandlers, normalizeInvoice, eventId }
