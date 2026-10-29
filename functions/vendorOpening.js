const p = require('./financeOperations')

function createVendorOpeningHandlers(ops, register) {
  async function updateGstin(request) {
    const d = p.object(request.data, ['operationId', 'vendorId', 'expectedVendorRevision', 'gstin'])
    p.id(d.vendorId)
    p.integer(d.expectedVendorRevision, 'Vendor revision', 1)
    if (typeof d.gstin !== 'string') p.fail('Enter a vendor GSTIN or leave it blank.')
    const gstin = d.gstin.trim().toUpperCase()
    if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) p.fail('Enter a valid 15-character GSTIN.')
    return ops.run(request, 'vendor-gstin-update', d, ['owner'], async ctx => {
      await register.config(ctx)
      const vendor = await register.vendor(ctx, d.vendorId)
      if (vendor.revision !== d.expectedVendorRevision) p.fail('Vendor details changed. Reload before updating GSTIN.')
      if ((vendor.gstin ?? '') === gstin) return { vendor, changed: false }
      const next = { ...vendor, revision: vendor.revision + 1, updatedAt: ctx.timestamp, updatedByUserId: ctx.actor.uid }
      if (gstin) next.gstin = gstin
      else delete next.gstin
      register.queue(ctx, 'vendorsV2', d.vendorId, next)
      return { vendor: next, changed: true }
    })
  }

  async function correct(request) {
    const d = p.object(request.data, ['operationId', 'vendorId', 'expectedVendorRevision', 'expectedAccountRevision', 'openingBalancePaise', 'reason'])
    p.id(d.vendorId); p.paise(d.openingBalancePaise); p.text(d.reason, 'Correction reason')
    return ops.run(request, 'vendor-opening-correction', d, ['owner'], async ctx => {
      await register.config(ctx)
      const vendor = await register.vendor(ctx, d.vendorId)
      const accountRef = ops.ref('vendorAccountStatesV2', d.vendorId), snapshot = await ctx.tx.get(accountRef)
      const account = snapshot.data()
      if (vendor.revision !== d.expectedVendorRevision || (account?.revision ?? 0) !== d.expectedAccountRevision) p.fail('Vendor balance changed. Reload before correcting the opening balance.')
      const before = p.paise(vendor.openingBalancePaise ?? 0)
      if (!account && before > 0) p.fail('Opening account evidence is missing; no correction was posted.')
      if (account && account.vendorId !== d.vendorId) p.fail('Vendor account identity does not match.')
      const difference = p.safe(d.openingBalancePaise - before)
      if (!difference) p.fail('Change the opening balance before saving.')
      let outstanding = p.paise(account?.outstandingPaise ?? 0), credit = p.paise(account?.vendorCreditPaise ?? 0)
      if (difference >= 0) outstanding = p.safe(outstanding + difference)
      else { const reduction = Math.min(outstanding, -difference); outstanding -= reduction; credit = p.safe(credit + -difference - reduction) }
      const cheques = await ctx.tx.get(ops.db.collection('chequesV2').where('vendorId', '==', d.vendorId).where('status', 'in', ['issued', 'presented']).limit(201))
      if (cheques.size > 200) p.fail('Vendor cheque history exceeds the correction bound; no correction was posted.')
      const committed = cheques.docs.filter(doc => !doc.get('trackingOnly')).reduce((sum, doc) => p.safe(sum + p.paise(doc.get('amountPaise'))), 0)
      if (outstanding < committed) p.fail('Pending vendor cheques reserve this payable. Review those cheques before reducing the opening balance.')
      const ledgerId = 'opening-adjustment-' + ctx.operationId
      register.queue(ctx, 'vendorLedgerEntriesV2', ledgerId, { id: ledgerId, vendorId: d.vendorId, eventType: 'opening-adjustment', posting: 'financial', signedAmountPaise: difference, sourceType: 'vendor', sourceRecordId: d.vendorId, sourceRevision: vendor.revision + 1, beforeOpeningBalancePaise: before, afterOpeningBalancePaise: d.openingBalancePaise, reason: d.reason.trim(), occurredOn: p.istDate(ctx.timestamp), createdAt: ctx.timestamp, createdByUserId: ctx.actor.uid }, true)
      register.queue(ctx, 'vendorAccountStatesV2', d.vendorId, { ...(account ?? { id: d.vendorId, vendorId: d.vendorId }), outstandingPaise: outstanding, vendorCreditPaise: credit, revision: (account?.revision ?? 0) + 1, lastLedgerEntryId: ledgerId, updatedAt: ctx.timestamp, updatedByUserId: ctx.actor.uid })
      register.queue(ctx, 'vendorsV2', d.vendorId, { ...vendor, openingBalancePaise: d.openingBalancePaise, lastOpeningCorrectionId: ledgerId, revision: vendor.revision + 1, updatedAt: ctx.timestamp, updatedByUserId: ctx.actor.uid })
      return { vendorId: d.vendorId, beforeOpeningBalancePaise: before, openingBalancePaise: d.openingBalancePaise, differencePaise: difference, outstandingPaise: outstanding, vendorCreditPaise: credit, ledgerEntryId: ledgerId }
    })
  }
  return { correct, updateGstin }
}
module.exports = { createVendorOpeningHandlers }
