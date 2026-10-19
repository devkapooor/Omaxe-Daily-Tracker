import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '@/shared/lib/firebase';
type Intent = Record<string, unknown>;
export type PendingFinanceOperation = {
  uid: string;
  kind: string;
  intent: Intent;
  createdAt: string;
};
const inFlight = new Map<string, { intentKey: string; promise: Promise<unknown> }>();
const key = (uid: string) => 'alphahub:finance-operation:' + auth.app.options.projectId + ':' + uid;
const clean = (value: unknown): unknown => Array.isArray(value) ? value.map(clean) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, clean(v)])) : value;
const signature = (intent: Intent) => JSON.stringify(clean(Object.fromEntries(Object.entries(intent).filter(([k]) => k !== 'operationId'))));
function notify() {
  window.dispatchEvent(new Event('alphahub-finance-operation'));
}
export function pendingFinanceOperation(uid = auth.currentUser?.uid): PendingFinanceOperation | null {
  if (!uid) return null;
  const raw = localStorage.getItem(key(uid)) ?? Object.keys(localStorage)
    .filter(name => name.startsWith(key(uid) + ':journal:'))
    .map(name => localStorage.getItem(name)).find(Boolean);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingFinanceOperation;
    if (parsed.uid !== uid || !parsed.kind || !parsed.intent?.operationId) throw new Error('Invalid recovery reference');
    return parsed;
  } catch {
    throw new Error('The saved payment recovery reference is unreadable. Preserve it for review; do not submit another payment.');
  }
}
export const financeOperationInFlight = (uid: string) => inFlight.has(uid);
function clearPending(pending: PendingFinanceOperation) {
  localStorage.removeItem(key(pending.uid) + ':journal:' + String(pending.intent.operationId));
  if (pendingFinanceOperation(pending.uid)?.intent.operationId === pending.intent.operationId) {
    localStorage.removeItem(key(pending.uid));
  }
}
async function dispatch<T>(pending: PendingFinanceOperation): Promise<T> {
  if (auth.currentUser?.uid !== pending.uid) throw new Error('Sign in as the original recorder to recover this operation.');
  const callable = pending.kind === 'cash-transfer' ? httpsCallable<Intent, T>(functions, 'createCashTransfer') : httpsCallable<{
    kind: string;
    intent: Intent;
  }, T>(functions, 'postFinanceOperation');
  try {
    const result = pending.kind === 'cash-transfer' ? await callable(pending.intent as Intent & {
      kind: string;
      intent: Intent;
    }) : await callable({
      kind: pending.kind,
      intent: pending.intent
    } as Intent & {
      kind: string;
      intent: Intent;
    });
    clearPending(pending);
    notify();
    return result.data;
  } catch (error) {
    if ((error as {
      details?: {
        financeUnposted?: boolean;
      };
    })?.details?.financeUnposted === true) {
      clearPending(pending);
      notify();
    }
    throw error;
  }
}
export function postFinanceOperation<T = unknown>(kind: string, intent: Intent): Promise<T> {
  const uid = auth.currentUser?.uid;
  if (!uid) return Promise.reject(new Error('Sign in before posting a payment.'));
  const saved = pendingFinanceOperation(uid);
  if (saved && (saved.kind !== kind || signature(saved.intent) !== signature(intent))) return Promise.reject(new Error('Recover the previous financial operation before making another change.'));
  const intentKey = kind + ':' + signature(intent);
  const active = inFlight.get(uid);
  if (active) {
    if (active.intentKey !== intentKey) return Promise.reject(new Error('Wait for the current financial operation to finish.'));
    return active.promise as Promise<T>;
  }
  const pending = saved ?? {
    uid,
    kind,
    intent: clean({
      ...intent,
      operationId: intent.operationId ?? crypto.randomUUID()
    }) as Intent,
    createdAt: new Date().toISOString()
  };
  // Fail closed if persistence is unavailable: no request precedes the saved intent.
  // Separate journal keys preserve both recovery references if two tabs race.
  localStorage.setItem(key(uid) + ':journal:' + String(pending.intent.operationId), JSON.stringify(pending));
  localStorage.setItem(key(uid), JSON.stringify(pending));
  const promise = dispatch<T>(pending).finally(() => { inFlight.delete(uid); notify(); });
  inFlight.set(uid, { intentKey, promise });
  notify();
  return promise;
}
export async function recoverFinanceOperation<T = unknown>(): Promise<T> {
  const pending = pendingFinanceOperation();
  if (!pending) throw new Error('No financial operation needs recovery.');
  const result = await postFinanceOperation<T>(pending.kind, pending.intent);
  if (pending.kind === 'cashout-count-start') localStorage.setItem('alphahub:cashout-count:' + pending.uid, JSON.stringify(result));
  sessionStorage.setItem('alphahub:finance-recovered', JSON.stringify({
    uid: pending.uid,
    kind: pending.kind,
    reference: pending.intent.operationId
  }));
  return result;
}
export async function presentDueCheque(chequeNumber: string) {
  return (await httpsCallable<{
    chequeNumber: string;
  }, unknown>(functions, 'presentDueCheque')({
    chequeNumber
  })).data;
}
export type FinanceCashoutQuote = {
  id: string;
  actorUid: string;
  date: string;
  reservationId: string;
  expiresAtMs: number;
  handoverRevision: number;
  grossMethods: {
    cash: number;
    upi: number;
    card: number;
    bankTransfer: number;
  };
  cashRefundPaise: number;
  windowRefundPaise: number;
  ordinaryCashExpensePaise: number;
  vendorCashPaymentPaise: number;
  cashPaidOutPaise: number;
  netCashCollectionsPaise: number;
  expectedDrawerPaise: number;
  openingCheckpointPaise: number;
  subsequentNetCashPaise: number;
  checkpointId: string;
  legacyUntrackedCashOutflowPaise: number;
  posRefundDayRevision: number;
  posRefundDayTotalPaise: number;
};
export async function getFinanceCashoutSummary(date: string) {
  return (await httpsCallable<{
    date: string;
  }, FinanceCashoutQuote>(functions, 'getFinanceCashoutSummary')({
    date
  })).data;
}
