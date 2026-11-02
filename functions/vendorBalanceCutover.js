"use strict";

const { createHash } = require('node:crypto');
const { istDate } = require('./stockOperations');
const p = require('./financeOperations');

function createVendorBalanceCutoverHandlers(ops) {
  const { db, ref, run } = ops;
  const collection = name => db.collection(name);
  const entryId = (cutoverId, vendorId) => `cutover-${createHash('sha256').update(`${cutoverId}:${vendorId}`).digest('hex').slice(0, 32)}`;

  async function reset(request) {
    const d = p.object(request.data, ['operationId', 'cutoverId', 'cutoverDate', 'reason', 'confirmation']);
    p.id(d.cutoverId);
    p.date(d.cutoverDate);
    const reason = p.text(d.reason, 'Reset reason', false, 500);
    if (d.confirmation !== `RESET VENDOR BALANCES ${d.cutoverDate}`) p.fail('Type the exact vendor-balance reset confirmation.');

    return run(request, 'vendor-balance-cutover', { ...d, reason }, ['owner'], async ctx => {
      const configRef = ref('appMetadata', 'vendorLedgerV2Config');
      const [configSnap, vendorsSnap, accountsSnap, invoicesSnap, allocationsSnap, chequesSnap, returnsSnap, ledgerSnap, purchasesSnap, settlementsSnap, settlementStatesSnap, correctionRequestsSnap, workspaceMetricsSnap, staffMetricsSnap] = await Promise.all([
        ctx.tx.get(configRef),
        ctx.tx.get(collection('vendorsV2').limit(501)),
        ctx.tx.get(collection('vendorAccountStatesV2').limit(501)),
        ctx.tx.get(collection('invoiceStatesV2').limit(501)),
        ctx.tx.get(collection('invoiceAllocationsV2').limit(501)),
        ctx.tx.get(collection('chequesV2').limit(501)),
        ctx.tx.get(collection('vendorReturnsV2').limit(501)),
        ctx.tx.get(collection('vendorLedgerEntriesV2').limit(501)),
        ctx.tx.get(collection('purchasesV2').limit(501)),
        ctx.tx.get(collection('vendorSettlementsV2').limit(501)),
        ctx.tx.get(collection('vendorSettlementStatesV2').limit(501)),
        ctx.tx.get(collection('vendorLedgerCorrectionRequestsV2').limit(501)),
        ctx.tx.get(ref('appMetadata', 'workspaceMetrics')),
        ctx.tx.get(ref('appMetadata', 'staffWorkspaceMetrics')),
      ]);
      const currentConfig = configSnap.data();
      if (currentConfig?.enabled !== true || !currentConfig.activationDate) p.fail('Vendor ledger is not enabled. No reset was performed.');
      if (currentConfig.balanceCutoverId) p.fail('A vendor balance cutover already exists. A second reset is blocked.');
      if (d.cutoverDate < currentConfig.activationDate || d.cutoverDate > istDate(ctx.timestamp)) p.fail('Cutover date must be between vendor-ledger activation and today.');
      const sets = [vendorsSnap, accountsSnap, invoicesSnap, allocationsSnap, chequesSnap, returnsSnap, ledgerSnap, purchasesSnap, settlementsSnap, settlementStatesSnap, correctionRequestsSnap];
      const documentCount = sets.reduce((n, snap) => n + snap.size, 0);
      if (!vendorsSnap.size || sets.some(snap => snap.size > 500) || documentCount > 480) p.fail('Vendor history exceeds the atomic reset safety bound. No reset was performed.');

      const vendors = new Map(vendorsSnap.docs.map(doc => [doc.id, doc]));
      const accounts = new Map(accountsSnap.docs.map(doc => [doc.id, doc]));
      const purchaseIds = new Set(purchasesSnap.docs.map(doc => doc.id));
      const invoiceById = new Map(invoicesSnap.docs.map(doc => [doc.id, doc]));
      if (accountsSnap.docs.some(doc => !vendors.has(doc.id) || doc.get('vendorId') !== doc.id)) p.fail('An account has no matching vendor identity. Review the ledger before reset.');
      if (invoicesSnap.docs.some(doc => !vendors.has(doc.get('vendorId')) || !purchaseIds.has(doc.id))) p.fail('An invoice state has a missing vendor or purchase source. Review the ledger before reset.');
      if (purchasesSnap.docs.some(doc => !vendors.has(doc.get('vendorId')))) p.fail('A purchase has no matching vendor identity. Review the ledger before reset.');
      if (settlementsSnap.docs.some(doc => !vendors.has(doc.get('vendorId')))) p.fail('A settlement has no matching vendor identity. Review the ledger before reset.');
      if (settlementStatesSnap.docs.some(doc => !vendors.has(doc.get('vendorId')) || !settlementsSnap.docs.some(settlement => settlement.id === doc.id))) p.fail('A settlement state has no matching vendor payment. Review the ledger before reset.');
      if (returnsSnap.docs.some(doc => !vendors.has(doc.get('vendorId')))) p.fail('A vendor return has no matching vendor identity. Review the ledger before reset.');

      const totals = { payableBeforePaise: 0, creditBeforePaise: 0, invoiceOpenBeforePaise: 0, invoiceReservedBeforePaise: 0, settlementCount: settlementsSnap.size, pendingCorrectionCount: correctionRequestsSnap.docs.filter(doc => doc.get('status') === 'pending' && settlementsSnap.docs.some(settlement => settlement.id === doc.get('sourceRecordId'))).length, pendingChequeCount: 0, pendingChequePaise: 0, pendingReturnCount: 0 };
      for (const doc of accountsSnap.docs) {
        totals.payableBeforePaise = p.safe(totals.payableBeforePaise + p.paise(doc.get('outstandingPaise')));
        totals.creditBeforePaise = p.safe(totals.creditBeforePaise + p.paise(doc.get('vendorCreditPaise') ?? 0));
      }
      for (const doc of invoicesSnap.docs) {
        totals.invoiceOpenBeforePaise = p.safe(totals.invoiceOpenBeforePaise + p.paise(doc.get('openAmountPaise')));
        totals.invoiceReservedBeforePaise = p.safe(totals.invoiceReservedBeforePaise + p.paise(doc.get('reservedAmountPaise')));
      }
      const pendingCheques = chequesSnap.docs.filter(doc => doc.get('vendorId') && !doc.get('trackingOnly') && ['issued', 'presented'].includes(doc.get('status')));
      for (const doc of pendingCheques) {
        if (!vendors.has(doc.get('vendorId'))) p.fail('A pending cheque has no matching vendor identity. Review the ledger before reset.');
        totals.pendingChequeCount++;
        totals.pendingChequePaise = p.safe(totals.pendingChequePaise + p.paise(doc.get('amountPaise'), 'Pending cheque', 1));
      }
      totals.pendingReturnCount = returnsSnap.docs.filter(doc => doc.get('outcome') === 'pending').length;

      const summaries = [];
      for (const [vendorId, vendorDoc] of vendors) {
        const accountDoc = accounts.get(vendorId);
        const account = accountDoc?.data();
        const outstanding = account ? p.paise(account.outstandingPaise) : 0;
        const credit = account ? p.paise(account.vendorCreditPaise ?? 0) : 0;
        const vendor = vendorDoc.data();
        if (!accountDoc && p.paise(vendor.openingBalancePaise ?? 0) !== 0) p.fail('A vendor opening balance has no matching account state. Review the ledger before reset.');
        const ledgerEntryId = entryId(d.cutoverId, vendorId);
        ctx.writes.push(() => ctx.tx.set(vendorDoc.ref, {
          ...vendor,
          preCutoverOpeningBalancePaise: vendor.openingBalancePaise ?? 0,
          openingBalancePaise: 0,
          balanceCutoverId: d.cutoverId,
          balanceCutoverDate: d.cutoverDate,
          cutoverOpeningCaptured: false,
          revision: (vendor.revision ?? 0) + 1,
          updatedAt: ctx.timestamp,
          updatedByUserId: ctx.actor.uid,
        }));
        ctx.writes.push(() => ctx.tx.set(ref('vendorAccountStatesV2', vendorId), {
          ...(account ?? { id: vendorId, vendorId }),
          outstandingPaise: 0,
          vendorCreditPaise: 0,
          revision: (account?.revision ?? 0) + 1,
          lastLedgerEntryId: ledgerEntryId,
          balanceCutoverId: d.cutoverId,
          updatedAt: ctx.timestamp,
          updatedByUserId: ctx.actor.uid,
        }));
        ctx.writes.push(() => ctx.tx.create(ref('vendorLedgerEntriesV2', ledgerEntryId), {
          id: ledgerEntryId,
          vendorId,
          eventType: 'balance-cutover',
          posting: 'financial',
          signedAmountPaise: -outstanding,
          clearedVendorCreditPaise: credit,
          beforeOutstandingPaise: outstanding,
          afterOutstandingPaise: 0,
          sourceType: 'vendor-balance-cutover',
          sourceRecordId: d.cutoverId,
          sourceRevision: (account?.revision ?? 0) + 1,
          occurredOn: d.cutoverDate,
          reason,
          createdAt: ctx.timestamp,
          createdByUserId: ctx.actor.uid,
        }));
        summaries.push({ vendorId, outstandingBeforePaise: outstanding, creditBeforePaise: credit, ledgerEntryId });
      }

      for (const invoiceDoc of invoicesSnap.docs) {
        const state = invoiceDoc.data();
        const open = p.paise(state.openAmountPaise);
        const reserved = p.paise(state.reservedAmountPaise);
        ctx.writes.push(() => ctx.tx.set(invoiceDoc.ref, {
          ...state,
          openAmountPaise: 0,
          reservedAmountPaise: 0,
          cutoverOpenAmountPaise: open,
          cutoverReservedAmountPaise: reserved,
          balanceCutoverId: d.cutoverId,
          balanceCutoverDate: d.cutoverDate,
          cutoverStatus: 'historical',
          revision: (state.revision ?? 0) + 1,
          updatedAt: ctx.timestamp,
          updatedByUserId: ctx.actor.uid,
        }));
      }
      for (const allocationDoc of allocationsSnap.docs) {
        const allocation = allocationDoc.data();
        if (allocation.state !== 'reserved') continue;
        if (!invoiceById.has(allocation.invoiceId)) p.fail('A reserved allocation has no invoice state. Review the ledger before reset.');
        ctx.writes.push(() => ctx.tx.set(allocationDoc.ref, {
          ...allocation,
          state: 'released',
          balanceCutoverId: d.cutoverId,
          cutoverReason: 'Released when the new vendor payable period started.',
          revision: (allocation.revision ?? 0) + 1,
          updatedAt: ctx.timestamp,
          updatedByUserId: ctx.actor.uid,
        }));
      }
      for (const purchaseDoc of purchasesSnap.docs) {
        ctx.writes.push(() => ctx.tx.set(purchaseDoc.ref, { ...purchaseDoc.data(), cutoverHistoricalOnly: true, balanceCutoverId: d.cutoverId, balanceCutoverDate: d.cutoverDate }));
      }
      for (const settlementDoc of settlementsSnap.docs) {
        ctx.writes.push(() => ctx.tx.set(settlementDoc.ref, { ...settlementDoc.data(), cutoverHistoricalOnly: true, balanceCutoverId: d.cutoverId, balanceCutoverDate: d.cutoverDate }));
      }
      for (const stateDoc of settlementStatesSnap.docs) {
        ctx.writes.push(() => ctx.tx.set(stateDoc.ref, { ...stateDoc.data(), cutoverHistoricalOnly: true, balanceCutoverId: d.cutoverId, balanceCutoverDate: d.cutoverDate }));
      }
      const historicalSettlementIds = new Set(settlementsSnap.docs.map(doc => doc.id));
      for (const requestDoc of correctionRequestsSnap.docs) {
        if (requestDoc.get('status') !== 'pending' || !historicalSettlementIds.has(requestDoc.get('sourceRecordId'))) continue;
        ctx.writes.push(() => ctx.tx.set(requestDoc.ref, { ...requestDoc.data(), status: 'rejected', reviewedAt: ctx.timestamp, reviewedByUserId: ctx.actor.uid, reviewedBy: ctx.actor.name, reviewReason: 'Closed at vendor balance reset; historical payment corrections cannot change the new payable period.', cutoverHistoricalOnly: true }));
      }
      for (const chequeDoc of pendingCheques) {
        const cheque = chequeDoc.data();
        ctx.writes.push(() => ctx.tx.set(chequeDoc.ref, {
          ...cheque,
          trackingOnly: true,
          cutoverTrackingOnly: true,
          balanceCutoverId: d.cutoverId,
          revision: (cheque.revision ?? 0) + 1,
          updatedAt: ctx.timestamp,
          updatedByUserId: ctx.actor.uid,
        }));
      }
      for (const returnDoc of returnsSnap.docs) {
        if (returnDoc.get('outcome') !== 'pending') continue;
        ctx.writes.push(() => ctx.tx.set(returnDoc.ref, {
          ...returnDoc.data(),
          cutoverHistoricalOnly: true,
          balanceCutoverId: d.cutoverId,
          revision: (returnDoc.get('revision') ?? 0) + 1,
          updatedAt: ctx.timestamp,
          updatedByUserId: ctx.actor.uid,
        }));
      }

      const result = {
        cutoverId: d.cutoverId,
        cutoverDate: d.cutoverDate,
        vendorCount: vendors.size,
        invoiceCount: invoicesSnap.size,
        pendingChequeCount: totals.pendingChequeCount,
        pendingReturnCount: totals.pendingReturnCount,
        ...totals,
        vendors: summaries,
      };
      for (const [snapshot, cacheId] of [[workspaceMetricsSnap, 'workspaceMetrics'], [staffMetricsSnap, 'staffWorkspaceMetrics']]) {
        if (!snapshot.exists) continue;
        const metrics = snapshot.data();
        const liabilities = metrics.liabilities ?? {};
        ctx.writes.push(() => ctx.tx.set(ref('appMetadata', cacheId), { ...metrics, liabilities: { ...liabilities, totalVendorOutstanding: 0 }, vendorOutstandingByName: {}, updatedAt: ctx.timestamp }));
      }
      ctx.writes.push(() => ctx.tx.set(configRef, {
        ...currentConfig,
        balanceCutoverId: d.cutoverId,
        balanceCutoverDate: d.cutoverDate,
        balanceCutoverAt: ctx.timestamp,
        balanceCutoverByUserId: ctx.actor.uid,
        balanceCutoverReason: reason,
        balanceCutoverCounts: {
          vendors: vendors.size,
          invoices: invoicesSnap.size,
          settlements: settlementsSnap.size,
          pendingCheques: totals.pendingChequeCount,
          pendingReturns: totals.pendingReturnCount,
          pendingCorrections: totals.pendingCorrectionCount,
        },
        updatedAt: ctx.timestamp,
        updatedByUserId: ctx.actor.uid,
      }));
      ctx.writes.push(() => ctx.tx.create(ref('appMetadata', `vendorBalanceCutovers-${d.cutoverId}`), {
        id: d.cutoverId,
        date: d.cutoverDate,
        reason,
        actorUid: ctx.actor.uid,
        actorName: ctx.actor.name,
        createdAt: ctx.timestamp,
        ...result,
      }));
      return result;
    });
  }

  return { reset };
}

module.exports = { createVendorBalanceCutoverHandlers };
