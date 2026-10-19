const s = require('./stockOperations')

function createStockAuditHandlers(db, clock = () => new Date().toISOString()) {
  const { ref, run } = s.createOperations(db, clock)
  async function begin(request) {
    const d = s.object(request.data, ['operationId', 'id', 'note', 'counts'])
    s.id(d.id); const note = s.text(d.note, 'Audit note')
    if (!Array.isArray(d.counts) || !d.counts.length) s.fail('Scan at least one product.', 'invalid-argument')
    const counts = d.counts.map(count => {
      s.object(count, ['productId', 'physicalQuantity', 'expectedRevision', 'suppliedCostPaise'])
      return { productId: s.id(count.productId), physicalQuantity: s.integer(count.physicalQuantity, 'Physical quantity'), expectedRevision: s.integer(count.expectedRevision, 'Scanned revision', 1), ...(count.suppliedCostPaise !== undefined ? { suppliedCostPaise: s.integer(count.suppliedCostPaise, 'Missing cost') } : {}) }
    })
    if (new Set(counts.map(c => c.productId)).size !== counts.length) s.fail('Each product can appear only once in an audit.')
    return run(request, 'begin-audit', { ...d, note, counts }, s.staff, async ({ tx, actor, timestamp, writes }) => {
      const target = ref('stockAuditBatches', d.id), existing = await tx.get(target), manifest = ref('stockAuditManifests', d.id)
      if (existing.exists || (await tx.get(manifest)).exists) s.fail('This audit reference already exists. Recover its original operation.')
      writes.push(() => tx.create(manifest, { id: d.id, actorUid: actor.id, counts, note, nextGroup: 0, groupCount: Math.ceil(counts.length / 5), createdAt: timestamp }), () => tx.create(target, { id: d.id, note, status: 'saving', itemCount: 0, adjustedItemCount: 0, matchedItemCount: 0, increaseValuePaise: 0, decreaseValuePaise: 0, netValuePaise: 0, createdAt: timestamp, ...s.actorFields(actor) }))
      return { id: d.id, groupCount: Math.ceil(counts.length / 5) }
    })
  }
  async function group(request) {
    const d = s.object(request.data, ['operationId', 'id', 'groupIndex']); s.id(d.id); s.integer(d.groupIndex, 'Group index')
    return run(request, 'audit-group', d, s.staff, async ({ tx, actor, timestamp, writes }) => {
      const manifestRef = ref('stockAuditManifests', d.id), manifest = await tx.get(manifestRef), batch = await tx.get(ref('stockAuditBatches', d.id))
      if (!manifest.exists || !batch.exists || manifest.get('actorUid') !== actor.id || batch.get('status') !== 'saving') s.fail('Only the original staff member can continue a saving audit.')
      if (manifest.get('nextGroup') !== d.groupIndex || d.groupIndex >= manifest.get('groupCount')) s.fail('Recover earlier audit groups before posting this group.')
      const counts = manifest.get('counts').slice(d.groupIndex * 5, d.groupIndex * 5 + 5), results = []
      for (const count of counts) {
        const product = await tx.get(ref('products', count.productId)), cost = await tx.get(ref('productCosts', count.productId))
        if (!product.exists) s.fail('A scanned product no longer exists. Review the count.')
        if (product.get('revision') !== count.expectedRevision) s.fail(`${product.get('name')} stock changed after it was scanned. Review and re-scan remaining products before another audit.`)
        const p = product.data(), recorded = cost.get('costPaise'), missing = recorded === null || recorded === undefined
        const unitCostPaise = s.integer(missing ? count.suppliedCostPaise : recorded, 'Recorded or missing purchase cost')
        const difference = s.safe(count.physicalQuantity - p.currentQuantity), valueImpactPaise = s.safe(difference * unitCostPaise), afterRevision = s.safe(p.revision + (difference ? 1 : 0)), auditId = `audit-${s.hash(`${d.id}:${count.productId}`)}`
        results.push({ auditId, productId: product.id, difference, systemQuantityBefore: p.currentQuantity, physicalQuantity: count.physicalQuantity, valueImpactPaise })
        if (difference) writes.push(() => tx.update(product.ref, { currentQuantity: count.physicalQuantity, revision: afterRevision, lastMovementId: auditId, ...s.updated(actor, timestamp) }), () => tx.create(ref('stockMovements', auditId), { id: auditId, productId: product.id, barcode: p.barcode, type: 'stock-audit', quantityDelta: difference, beforeQuantity: p.currentQuantity, afterQuantity: count.physicalQuantity, productRevisionBefore: p.revision, productRevisionAfter: afterRevision, businessDate: s.istDate(timestamp), stockAuditId: auditId, reason: manifest.get('note'), createdAt: timestamp, ...s.actorFields(actor) }))
        if (missing) writes.push(() => tx.set(cost.ref, { productId: product.id, costPaise: unitCostPaise, sourceValue: '', importRunId: `audit:${d.id}`, lastEventId: auditId, ...s.updated(actor, timestamp) }, { merge: true }))
        writes.push(() => tx.create(ref('stockAudits', auditId), { id: auditId, batchId: d.id, productId: product.id, barcode: p.barcode, productName: p.name, systemQuantityBefore: p.currentQuantity, physicalQuantity: count.physicalQuantity, difference, systemQuantityAfter: count.physicalQuantity, productRevisionBefore: p.revision, productRevisionAfter: afterRevision, unitCostPaise, costSource: missing ? 'audit-correction' : String(cost.get('importRunId') ?? '').startsWith('grn:') ? 'grn' : 'manual', valueImpactPaise, reason: manifest.get('note'), ...(difference ? { movementId: auditId } : {}), createdAt: timestamp, ...s.actorFields(actor) }), () => tx.create(ref('events', auditId), { type: 'stock-audited', stockAuditId: auditId, stockAuditBatchId: d.id, productId: product.id, difference, createdAt: timestamp, ...s.actorFields(actor) }))
      }
      const increase = s.safe(batch.get('increaseValuePaise') + results.reduce((sum, r) => s.safe(sum + Math.max(0, r.valueImpactPaise)), 0)), decrease = s.safe(batch.get('decreaseValuePaise') + results.reduce((sum, r) => s.safe(sum + Math.abs(Math.min(0, r.valueImpactPaise))), 0))
      writes.push(() => tx.update(batch.ref, { itemCount: batch.get('itemCount') + results.length, adjustedItemCount: batch.get('adjustedItemCount') + results.filter(r => r.difference !== 0).length, matchedItemCount: batch.get('matchedItemCount') + results.filter(r => r.difference === 0).length, increaseValuePaise: increase, decreaseValuePaise: decrease, netValuePaise: s.safe(increase - decrease) }), () => tx.update(manifestRef, { nextGroup: d.groupIndex + 1 }))
      return results
    })
  }
  async function finish(request) {
    const d = s.object(request.data, ['operationId', 'id', 'interrupted']); s.id(d.id)
    if (typeof d.interrupted !== 'boolean') s.fail('Choose the audit completion state.', 'invalid-argument')
    return run(request, 'finish-audit', d, s.staff, async ({ tx, actor, timestamp, writes }) => {
      const manifest = await tx.get(ref('stockAuditManifests', d.id)), batch = await tx.get(ref('stockAuditBatches', d.id))
      if (!manifest.exists || !batch.exists || manifest.get('actorUid') !== actor.id) s.fail('Only the original staff member can finish this audit.', 'permission-denied')
      if (batch.get('status') !== 'saving') s.fail('This audit is already complete.')
      if (!d.interrupted && manifest.get('nextGroup') !== manifest.get('groupCount')) s.fail('Recover/post all audit groups before finishing.')
      const result = { ...batch.data(), status: 'completed', interrupted: d.interrupted, completedAt: timestamp, completedByUid: actor.id }
      writes.push(() => tx.update(batch.ref, { status: 'completed', interrupted: d.interrupted, completedAt: timestamp, completedByUid: actor.id })); return result
    })
  }
  return { begin, group, finish }
}
module.exports = { createStockAuditHandlers }
