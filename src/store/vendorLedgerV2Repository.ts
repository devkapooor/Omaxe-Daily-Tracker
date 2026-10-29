import { collection, doc, getDocFromServer, type Firestore } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import { postFinanceOperation } from '@/features/register/data/financeRepository';
import type { VendorLedgerV2Config } from '@/domain/appTypes';
import type { CutoverVendorDraft } from '@/domain/vendorLedgerCutover';
import type { CreatePurchaseV2Input, CreateSettlementV2Input, CreateVendorV2Input, CreateVendorChequeV2Input, CreateVendorReturnV2Input, ResolveVendorReturnV2Input, ChequeStatus, VendorLedgerCorrectionRequestV2, VendorSettlementStateV2, VendorV2, ChequeV2, VendorReturnV2 } from '@/domain/vendorLedgerV2';
export const vendorLedgerV2Collections = {
  vendors: 'vendorsV2',
  purchases: 'purchasesV2',
  invoiceReservations: 'invoiceReservationsV2',
  vendorAccountStates: 'vendorAccountStatesV2',
  invoiceStates: 'invoiceStatesV2',
  settlements: 'vendorSettlementsV2',
  settlementStates: 'vendorSettlementStatesV2',
  returns: 'vendorReturnsV2',
  chequeBooks: 'chequeBooksV2',
  cheques: 'chequesV2',
  ledgerEntries: 'vendorLedgerEntriesV2',
  allocations: 'invoiceAllocationsV2',
  correctionRequests: 'vendorLedgerCorrectionRequestsV2'
} as const;
export function vendorLedgerV2Refs(database: Firestore = db) {
  return {
    config: doc(database, 'appMetadata', 'vendorLedgerV2Config'),
    vendors: collection(database, vendorLedgerV2Collections.vendors),
    purchases: collection(database, vendorLedgerV2Collections.purchases),
    invoiceReservations: collection(database, vendorLedgerV2Collections.invoiceReservations),
    vendorAccountStates: collection(database, vendorLedgerV2Collections.vendorAccountStates),
    invoiceStates: collection(database, vendorLedgerV2Collections.invoiceStates),
    settlements: collection(database, vendorLedgerV2Collections.settlements),
    settlementStates: collection(database, vendorLedgerV2Collections.settlementStates),
    returns: collection(database, vendorLedgerV2Collections.returns),
    chequeBooks: collection(database, vendorLedgerV2Collections.chequeBooks),
    cheques: collection(database, vendorLedgerV2Collections.cheques),
    ledgerEntries: collection(database, vendorLedgerV2Collections.ledgerEntries),
    allocations: collection(database, vendorLedgerV2Collections.allocations),
    correctionRequests: collection(database, vendorLedgerV2Collections.correctionRequests)
  };
}
function intent(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => !['actor', 'actorUserId', 'timestamp'].includes(key) && value !== undefined));
}
export type ActivateVendorLedgerV2Input = {
  activationDate: string;
  vendors: CutoverVendorDraft[];
  actor: {
    id: string;
    name: string;
  };
  timestamp: string;
};
export async function activateVendorLedgerV2(_input: ActivateVendorLedgerV2Input, _database: Firestore = db): Promise<VendorLedgerV2Config> {
  void _input;
  void _database;
  throw new Error('Historical vendor activation/import requires a separately approved trusted migration. No records were changed.');
}
export async function createPurchaseV2(input: CreatePurchaseV2Input, _database: Firestore = db) {
  if (_database !== db) throw new Error('Custom client financial database contexts are unsupported; use the isolated callable environment.');
  return postFinanceOperation('vendor-purchase', {
    ...intent(input),
    operationId: 'purchase-' + input.id
  });
}
export async function createVendorV2(input: CreateVendorV2Input, _database: Firestore = db) {
  if (_database !== db) throw new Error('Custom client financial database contexts are unsupported; use the isolated callable environment.');
  return postFinanceOperation<{
    created: boolean;
    vendor: VendorV2;
  }>('vendor-create', {
    ...intent(input),
    operationId: 'vendor-' + input.id
  });
}
export function updateVendorGstin(vendor: VendorV2, gstin: string) {
  return postFinanceOperation<{ vendor: VendorV2; changed: boolean }>('vendor-gstin-update', {
    vendorId: vendor.id,
    expectedVendorRevision: vendor.revision,
    gstin: gstin.trim().toUpperCase(),
  });
}
export function correctVendorOpening(input: { vendorId: string; expectedVendorRevision: number; expectedAccountRevision: number; openingBalancePaise: number; reason: string; operationId: string }) {
  return postFinanceOperation<{ ledgerEntryId: string }>('vendor-opening-correction', input)
}
export async function createVendorChequeV2(input: CreateVendorChequeV2Input & {
  invoiceId?: string;
}, _database: Firestore = db) {
  if (_database !== db) throw new Error('Custom client financial database contexts are unsupported; use the isolated callable environment.');
  return postFinanceOperation<{
    created: boolean;
    cheque: ChequeV2;
  }>('cheque-issue', {
    ...intent(input),
    purpose: 'vendor-payment'
  });
}
export type TransitionVendorChequeV2Input = {
  chequeNumber: string | number;
  expectedRevision: number;
  toStatus: Exclude<ChequeStatus, 'draft'> | 'not-yet';
  actorUserId: string;
  timestamp: string;
  reason?: string;
};
export async function transitionVendorChequeV2(input: TransitionVendorChequeV2Input, _database: Firestore = db) {
  if (_database !== db) throw new Error('Custom client financial database contexts are unsupported; use the isolated callable environment.');
  return postFinanceOperation<{
    cheque: ChequeV2;
  }>('cheque-decision', intent(input));
}
export async function createSettlementV2(input: CreateSettlementV2Input, _database: Firestore = db) {
  if (_database !== db) throw new Error('Custom client financial database contexts are unsupported; use the isolated callable environment.');
  return postFinanceOperation('vendor-payment', {
    ...intent(input),
    operationId: 'settlement-' + input.id
  });
}
export type ApplyOwnerSettlementCorrectionV2Input = {
  id: string;
  sourceRecordId: string;
  proposed: Omit<VendorLedgerCorrectionRequestV2['proposed'], 'invoiceId'>;
  reason: string;
  actor: {
    id: string;
    name: string;
  };
  timestamp: string;
  expectedRevision?: number;
};
export type CreateSettlementCorrectionRequestV2Input = ApplyOwnerSettlementCorrectionV2Input;
async function correction(input: ApplyOwnerSettlementCorrectionV2Input, applyImmediately: boolean) {
  const revision = input.expectedRevision ?? (await getDocFromServer(doc(db, 'vendorSettlementStatesV2', input.sourceRecordId))).get('revision') as number;
  return postFinanceOperation('vendor-correction', {
    ...intent(input),
    expectedRevision: revision,
    applyImmediately,
    operationId: 'vendor-correction-' + input.id
  });
}
export async function applyOwnerSettlementCorrectionV2(input: ApplyOwnerSettlementCorrectionV2Input, _database: Firestore = db) {
  if (_database !== db) throw new Error('Custom client financial database contexts are unsupported; use the isolated callable environment.');
  return correction(input, true);
}
export async function createSettlementCorrectionRequestV2(input: CreateSettlementCorrectionRequestV2Input, _database: Firestore = db) {
  if (_database !== db) throw new Error('Custom client financial database contexts are unsupported; use the isolated callable environment.');
  return correction(input, false);
}
export async function applySettlementCorrectionV2(requestId: string, _actor: {
  id: string;
  name: string;
}, _timestamp: string, _database: Firestore = db) {
  if (_database !== db) throw new Error('Custom client financial database contexts are unsupported; use the isolated callable environment.');
  return postFinanceOperation('vendor-correction-decision', {
    requestId,
    decision: 'approve'
  });
}
export async function rejectSettlementCorrectionRequestV2(requestId: string, reason: string, _actor: {
  id: string;
  name: string;
}, _timestamp: string, _database: Firestore = db) {
  if (_database !== db) throw new Error('Custom client financial database contexts are unsupported; use the isolated callable environment.');
  return postFinanceOperation('vendor-correction-decision', {
    requestId,
    decision: 'reject',
    reason
  });
}
export async function withdrawSettlementCorrectionRequestV2(requestId: string, _actor: {
  id: string;
  name: string;
}, _timestamp: string, _database: Firestore = db) {
  if (_database !== db) throw new Error('Custom client financial database contexts are unsupported; use the isolated callable environment.');
  return postFinanceOperation('vendor-correction-decision', {
    requestId,
    decision: 'withdraw'
  });
}
export async function createVendorReturnV2(input: CreateVendorReturnV2Input, _database: Firestore = db) {
  if (_database !== db) throw new Error('Custom client financial database contexts are unsupported; use the isolated callable environment.');
  return postFinanceOperation<VendorReturnV2>('vendor-return', {
    ...intent(input),
    operationId: 'vendor-return-' + input.id
  });
}
export async function resolveVendorReturnV2(returnId: string, input: ResolveVendorReturnV2Input, _database: Firestore = db) {
  if (_database !== db) throw new Error('Custom client financial database contexts are unsupported; use the isolated callable environment.');
  const expectedRevision = (await getDocFromServer(doc(db, 'vendorReturnsV2', returnId))).get('revision') as number;
  return postFinanceOperation('vendor-return-decision', {
    ...intent(input),
    returnId,
    expectedRevision
  });
}
// Types remain exported through their domain source; no client financial transaction fallback.
export type { VendorSettlementStateV2 };
