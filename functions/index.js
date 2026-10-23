const { HttpsError, onCall } = require('firebase-functions/v2/https')
const { initializeApp, getApps } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')

if (getApps().length === 0) initializeApp()
const db = getFirestore()
const stockPrices = require('./stockPrices').createStockPriceHandlers(db)
const checkout = require('./posCheckout').createCheckoutHandler(db)
const stockReceiving = require('./stockReceiving').createStockReceivingHandlers(db)
const stockAudit = require('./stockAudit').createStockAuditHandlers(db)
const refunds = require('./posRefunds').createPosRefundHandlers(db)

for (const [name, handler] of Object.entries({ quotePosReturn: refunds.quote, postPosReturn: refunds.post, reviewPosReturn: refunds.review, closeLegacyPosRequest: refunds.closeLegacy, prepareRefundCashout: refunds.prepareCashout })) {
  exports[name] = onCall({ region: 'asia-south1', minInstances: 0 }, handler)
}

for (const [name, handler] of Object.entries({ createStockProduct: stockReceiving.createProduct, allocateInternalStockBarcode: stockReceiving.allocateInternalBarcode, saveStockReceiptDraft: stockReceiving.saveDraft, deleteStockReceiptDraft: stockReceiving.deleteDraft, submitStockReceipt: stockReceiving.submit, previewStockReceiptReversal: stockReceiving.previewReverse, reverseStockReceipt: stockReceiving.reverse, beginStockAudit: stockAudit.begin, postStockAuditGroup: stockAudit.group, finishStockAudit: stockAudit.finish })) {
  exports[name] = onCall({ region: 'asia-south1', minInstances: 0 }, handler)
}

exports.finalizePosCheckout = onCall({ region: 'asia-south1', minInstances: 0 }, checkout)

exports.changeStockPrices = onCall({ region: 'asia-south1' }, stockPrices.change)
exports.reviewStockPriceChange = onCall({ region: 'asia-south1' }, stockPrices.review)

exports.getServerTime = onCall({ region: 'asia-south1' }, (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in to synchronize trusted time.')
  }
  return { serverTimeMs: Date.now() }
})

const financeOps = require('./financeOperations').createFinanceOperations(db)
const register = require('./registerPayments').createRegisterHandlers(financeOps)
const vendorDecisions = require('./vendorFinanceDecisions').createVendorDecisionHandlers(financeOps, register)
const cashout = require('./financeCashout').createCashoutHandlers(financeOps)
const financialHandlers = { expense:register.expense, 'vendor-payment':register.settlement, 'vendor-create':register.createVendor, 'vendor-purchase':register.purchase, 'cheque-issue':register.cheque, 'cheque-decision':register.transitionCheque, 'vendor-correction':vendorDecisions.correct, 'vendor-correction-decision':vendorDecisions.decision, 'vendor-return':vendorDecisions.createReturn, 'vendor-return-decision':vendorDecisions.resolveReturn, 'outflow-review':vendorDecisions.reviewOutflow, 'expense-cancel':vendorDecisions.cancelExpense, 'cashout-count-start':cashout.prepare, 'cashout-count-cancel':cashout.cancel, 'cashout-close':cashout.close, 'cashout-correction':cashout.correction, 'cashout-correction-decision':cashout.decideCorrection, 'cashout-delete':cashout.deleteLegacy, 'cashout-review':cashout.review }
exports.postFinanceOperation = onCall({ region:'asia-south1', minInstances:0 }, request => {
  const p = require('./financeOperations')
  p.object(request.data,['kind','intent'])
  const handler=financialHandlers[request.data.kind]
  if(!handler)p.fail('Unsupported financial operation. Reload AlphaHub.','invalid-argument')
  return handler({...request,data:request.data.intent})
})
exports.presentDueCheque = onCall({region:'asia-south1',minInstances:0}, register.presentDue)
exports.createCashTransfer = onCall({region:'asia-south1',minInstances:0},require('./financeTransfers').createTransferHandler(financeOps))
exports.getFinanceCashoutSummary = onCall({region:'asia-south1',minInstances:0},cashout.readSummary)

const sharedViews = require('./sharedViews').createSharedViewHandlers(db)
for (const [name, handler] of Object.entries({ updateWorkspaceSettings: sharedViews.updateSettings, publishWorkspaceMetrics: sharedViews.publishMetrics, publishStaffViews: sharedViews.publishExisting })) {
  exports[name] = onCall({ region: 'asia-south1', minInstances: 0 }, handler)
}
