const { HttpsError, onCall } = require('firebase-functions/v2/https')

exports.getServerTime = onCall({ region: 'asia-south1' }, (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in to synchronize trusted time.')
  }
  return { serverTimeMs: Date.now() }
})
