const { onDocumentWritten, onDocumentCreated } = require('firebase-functions/v2/firestore')
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const { createTelegramAlerts, BASE } = require('./telegramAlerts')
const { istDate } = require('./telegramReports')

function registerTelegramFunctions(db) {
  const credentials = defineSecret('ALPHAHUB_TELEGRAM')
  const app = createTelegramAlerts({ db, getSettings: () => JSON.parse(credentials.value()) })
  const options = { region: 'asia-south1', minInstances: 0, maxInstances: 3 }
  const trigger = document => ({ ...options, document, retry: true })
  const changed = event => event.data?.after?.exists

  return {
    telegramPosBillChanged: onDocumentWritten(trigger(BASE + '/bills/{billId}'), async event => {
      const date = (event.data?.after?.exists ? event.data.after : event.data?.before)?.data()?.businessDate
      if (date) await app.queueMilestone(date)
    }),
    telegramPosBillStateChanged: onDocumentWritten(trigger(BASE + '/billStates/{billId}'), async () => app.queueMilestone(istDate(Date.now()))),
    telegramPosRefundRecorded: onDocumentCreated(trigger(BASE + '/events/{eventId}'), async event => {
      const record = event.data?.data()
      if (record?.type === 'bill-return-approved') await app.queueMilestone(record.refundDate)
    }),
    telegramCashoutRecorded: onDocumentWritten(trigger('dailyCashouts/{cashoutId}'), async event => {
      if (changed(event) && (event.data.before.data()?.revision !== event.data.after.data()?.revision || !event.data.before.exists)) await app.queueCashout(event.params.cashoutId)
    }),
    telegramDeliverMessage: onDocumentCreated({ ...trigger('telegramOutbox/{messageId}'), secrets: [credentials], timeoutSeconds: 60 }, event => app.deliver(event.params.messageId)),
    telegramSalesWebhook: onRequest({ ...options, secrets: [credentials], invoker: 'public', cors: false, timeoutSeconds: 60 }, async (request, response) => {
      if ((request.rawBody?.length || 0) > 65536) { response.sendStatus(413); return }
      try {
        const status = await app.webhook({ method: request.method, secret: request.get('X-Telegram-Bot-Api-Secret-Token'), body: request.body })
        response.sendStatus(status)
      } catch { response.sendStatus(503) }
    }),
    configureTelegramAlerts: onCall({ ...options, secrets: [credentials], timeoutSeconds: 120 }, async request => {
      if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to manage Telegram alerts.')
      if (!request.data || Object.keys(request.data).some(k => k !== 'action') || !['status', 'enable', 'pause'].includes(request.data.action)) throw new HttpsError('invalid-argument', 'Choose a valid Telegram action.')
      try {
        const result = await app.configure(request.auth.uid, request.data.action)
        if (result.denied) throw new HttpsError('permission-denied', 'Only an active owner can manage Telegram alerts.')
        return result
      } catch (error) {
        if (error instanceof HttpsError) throw error
        throw new HttpsError('failed-precondition', 'Telegram setup or reporting is unavailable. Check server setup and retry; no financial records were changed.')
      }
    }),
  }
}

module.exports = { registerTelegramFunctions }
