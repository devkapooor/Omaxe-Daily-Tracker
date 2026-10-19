const {
  HttpsError
} = require('firebase-functions/v2/https');
const {
  Timestamp
} = require('firebase-admin/firestore');
const {
  activeUser,
  pendingCashForUser
} = require('./cashBalance');
const {
  canonical,
  hash,
  istDate
} = require('./stockOperations');
const BASE = 'posSandboxes/test',
  STAFF = ['owner', 'manager', 'billing'];
function fail(message, code = 'failed-precondition') {
  throw new HttpsError(code, message, {
    financeRejected: true,
    ...(code === 'invalid-argument' ? {
      financeUnposted: true
    } : {})
  });
}
function id(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_:%.~-]{1,180}$/.test(value)) fail('Invalid financial reference.', 'invalid-argument');
  return value;
}
function text(value, label, optional = false, max = 1000) {
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(label + ' is required.', 'invalid-argument');
  return value.trim();
}
function paise(value, label = 'Amount', min = 0) {
  if (!Number.isSafeInteger(value) || value < min) fail(label + ' must be a valid integer amount in paise.', 'invalid-argument');
  return value;
}
function rupees(value, label = 'Amount', min = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) fail(label + ' must have at most two decimals.', 'invalid-argument');
  return paise(Math.round(value * 100), label, min);
}
function safe(value) {
  if (!Number.isSafeInteger(value)) fail('Amount exceeds the safe integer range.');
  return value;
}
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) fail('Financial request contains unsupported fields.', 'invalid-argument');
  return value;
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) fail('Invalid business date.', 'invalid-argument');
  return value;
}
function expectedCash(ledger) {
  const c = ledger.checkpoint;
  return safe(c ? paise(c.cashActualPaise) + safe(ledger.cashNetPaise - c.cashNetPaise) : ledger.cashNetPaise);
}
function capability(actor, name) {
  return actor.role === 'owner' || ['vendor.manage', 'purchase.create', 'settlement.create', 'settlement.correct', 'return.create', 'vendorLedger.view'].includes(name) || actor.profile.purchasingCapabilities?.[name] === true;
}
function requireCapability(actor, name) {
  if (!capability(actor, name)) fail('Your account cannot perform this operation.', 'permission-denied');
}
function createFinanceOperations(db, clock = () => Date.now()) {
  const ref = (collection, key) => db.doc(collection + '/' + id(key));
  const posRef = (collection, key) => db.doc(BASE + '/' + collection + '/' + id(key));
  async function actorFor(tx, request, roles = STAFF) {
    if (!request.auth?.uid) fail('Sign in before posting a financial operation.', 'unauthenticated');
    const profile = (await tx.get(ref('users', request.auth.uid))).data();
    if (!activeUser(profile) || !roles.includes(profile.role)) fail('Your account cannot perform this operation.', 'permission-denied');
    return {
      uid: request.auth.uid,
      id: request.auth.uid,
      name: text(profile.name || request.auth.uid, 'Account name'),
      role: profile.role,
      profile
    };
  }
  async function run(request, kind, intent, roles, post) {
    const operationId = id(intent.operationId),
      intentHash = hash(JSON.stringify(canonical(intent)));
    return db.runTransaction(async tx => {
      const actor = await actorFor(tx, request, roles),
        opRef = ref('financeOperations', operationId),
        saved = await tx.get(opRef);
      if (saved.exists) {
        const op = saved.data();
        if (op.actorUid !== actor.uid || op.kind !== kind || op.intentHash !== intentHash) fail('This operation belongs to a different actor or intent. Recover the original result.', 'already-exists');
        return op.result;
      }
      const nowMs = clock(),
        timestamp = new Date(nowMs).toISOString(),
        writes = [],
        ctx = {
          tx,
          actor,
          nowMs,
          timestamp,
          writes,
          operationId,
          request
        };
      let result;
      try {
        result = await post(ctx);
      } catch (error) {
        if (error instanceof HttpsError) error.details = {
          ...error.details,
          financeUnposted: true
        };else if (error instanceof Error) throw new HttpsError('failed-precondition', error.message, {
          financeRejected: true,
          financeUnposted: true
        });
        throw error;
      }
      writes.forEach(fn => fn());
      tx.create(opRef, {
        kind,
        actorUid: actor.uid,
        intentHash,
        result,
        createdAt: timestamp
      });
      return result;
    });
  }
  async function counter(ctx, {
    allowReservation = null,
    allowOwnerWithoutJoining = false,
    businessDate = istDate(ctx.timestamp)
  } = {}) {
    const {
        tx,
        actor,
        request,
        nowMs
      } = ctx,
      ledgerRef = posRef('handover', 'main'),
      cashierRef = posRef('cashierStates', actor.uid);
    const [l, c] = await Promise.all([tx.get(ledgerRef), tx.get(cashierRef)]),
      ledger = l.data(),
      cashier = c.data(),
      authTime = request.auth?.token?.auth_time;
    if (!ledger?.initialized || ledger.counterSession?.status !== 'open' || ledger.counterSession.date !== businessDate || ledger.checkpoint?.date !== businessDate) fail('Open the correct shared counter before using drawer cash.');
    const ownerMayCount = allowOwnerWithoutJoining && actor.role === 'owner';
    if (!Number.isSafeInteger(authTime) || !ownerMayCount && (cashier?.uid !== actor.uid || cashier.authTime !== authTime || cashier.closed !== false || cashier.joinedCounterId !== ledger.counterSession.openingReconciliationId)) fail('Join the shared counter before this operation.');
    const reservation = ledger.countReservation,
      live = reservation && (!reservation.startedAt?.toMillis || nowMs < reservation.startedAt.toMillis() + 300000);
    if (live && reservation.id !== allowReservation) fail('The shared drawer is being counted. Wait for the count to finish or be cancelled.');
    return {
      ledger,
      ledgerRef,
      cashier,
      cashierRef
    };
  }
  function debitCounter(ctx, c, amountPaise) {
    paise(amountPaise);
    if (amountPaise > expectedCash(c.ledger)) fail('Counter cash is insufficient for this payment.');
    ctx.writes.push(() => ctx.tx.set(c.ledgerRef, {
      ...c.ledger,
      cashNetPaise: safe(c.ledger.cashNetPaise - amountPaise),
      revision: c.ledger.revision + 1,
      lastOperation: 'payment',
      lastOperationId: ctx.operationId,
      updatedByUid: ctx.actor.uid
    }));
    ctx.writes.push(() => ctx.tx.set(c.cashierRef, {
      ...c.cashier,
      needsLogoutCheck: true,
      updatedAt: ctx.timestamp,
      lastFinancialOperationId: ctx.operationId
    }));
  }
  async function bank(ctx, deltaPaise) {
    if (!Number.isSafeInteger(deltaPaise)) fail('Invalid bank amount.');
    const controlRef = ref('bankBalanceControl', 'main'),
      settingsRef = ref('appMetadata', 'appSettings');
    const [s, settings] = await Promise.all([ctx.tx.get(controlRef), ctx.tx.get(settingsRef)]);
    const control = s.data();
    if (!control?.initialized) fail('The owner must confirm the bank book opening balance before bank-funded posting.');
    const balance = safe(paise(control.balancePaise) + deltaPaise);
    if (balance < 0) fail('Recorded bank balance is insufficient.');
    if (rupees(settings.get('currentBankBalance') ?? 0) !== control.balancePaise) fail('Bank setting and trusted balance disagree. Owner reconciliation is required; no payment was posted.');
    ctx.writes.push(() => ctx.tx.set(controlRef, {
      ...control,
      balancePaise: balance,
      revision: control.revision + 1,
      lastOperationId: ctx.operationId,
      updatedAt: ctx.timestamp,
      updatedByUid: ctx.actor.uid
    }));
    ctx.writes.push(() => ctx.tx.set(settingsRef, {
      currentBankBalance: balance / 100
    }, {
      merge: true
    }));
    return {
      beforePaise: control.balancePaise,
      afterPaise: balance,
      revision: control.revision + 1
    };
  }
  async function holderRecords(tx) {
    const [users, cashouts, transfers] = await Promise.all([tx.get(db.collection('users').limit(501)), tx.get(db.collection('dailyCashouts').limit(5001)), tx.get(db.collection('cashTransfers').limit(5001))]);
    if (users.size > 500 || cashouts.size > 5000 || transfers.size > 5000) fail('Cash holder history exceeds the safe compatibility read bound. A reviewed balance index is required; no balance was guessed.');
    const rows = s => s.docs.map(d => ({
      id: d.id,
      data: d.data()
    }));
    return {
      users: rows(users),
      cashouts: rows(cashouts),
      transfers: rows(transfers)
    };
  }
  function holderBalances(records, extraCashout = null) {
    const cashouts = extraCashout ? [...records.cashouts, {
      id: extraCashout.id,
      data: extraCashout
    }] : records.cashouts;
    return records.users.filter(u => activeUser(u.data)).map(u => ({
      userId: u.id,
      name: u.data.name,
      amountPaise: rupees(pendingCashForUser(u.id, records.users, cashouts, records.transfers), 'Holder balance', -Number.MAX_SAFE_INTEGER)
    }));
  }
  return {
    db,
    ref,
    posRef,
    run,
    actorFor,
    counter,
    debitCounter,
    bank,
    holderRecords,
    holderBalances,
    clock
  };
}
module.exports = {
  BASE,
  STAFF,
  fail,
  id,
  text,
  paise,
  rupees,
  safe,
  object,
  date,
  istDate,
  expectedCash,
  capability,
  requireCapability,
  createFinanceOperations,
  Timestamp
};
