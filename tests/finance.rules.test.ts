import { afterAll, beforeAll, describe, it } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
let env: RulesTestEnvironment;
const projectId = 'demo-finance-rules';
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync('firestore.rules', 'utf8')
    }
  });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const role of ['owner', 'manager', 'billing']) await setDoc(doc(db, 'users', role), {
      name: 'Synthetic ' + role,
      role,
      disabled: false,
      approvalStatus: 'approved'
    });
    await setDoc(doc(db, 'appMetadata', 'appSettings'), {
      currentBankBalance: 5000,
      marginPercentage: 25
    });
    await setDoc(doc(db, 'appMetadata', 'vendorLedgerV2Config'), {
      enabled: true,
      activationDate: '2026-10-01'
    });
    await setDoc(doc(db, 'appMetadata', 'vendorCatalog'), {
      vendors: []
    });
    await setDoc(doc(db, 'cashouts', 'posted'), {
      sourceKind: 'vendor-payment',
      amount: 100
    });
    await setDoc(doc(db, 'bankBalanceControl', 'main'), {
      initialized: true,
      balancePaise: 500000
    });
    await setDoc(doc(db, 'financeOperations', 'private'), {
      actorUid: 'billing',
      result: {}
    });
    await setDoc(doc(db, 'posSandboxes', 'test', 'handover', 'main'), {
      initialized: true,
      revision: 10,
      cashNetPaise: 0,
      dailyTotals: {},
      countReservation: {
        id: 'protected-cashout',
        uid: 'owner',
        authTime: 42,
        name: 'Owner',
        kind: 'cashout',
        startedAt: Timestamp.now()
      },
      lastOperation: 'count-reserve',
      updatedByUid: 'owner'
    });
  });
});
afterAll(async () => env.cleanup());
describe('trusted financial Rules cutover', () => {
  for (const role of ['owner', 'manager', 'billing']) {
    it(role + ' cannot recreate financial postings directly', async () => {
      const db = env.authenticatedContext(role, {
        auth_time: 42
      }).firestore();
      for (const name of ['sales', 'purchases', 'cashouts', 'dailyCashouts', 'cashMovementControl', 'vendors', 'vendorsV2', 'purchasesV2', 'invoiceReservationsV2', 'vendorSettlementsV2', 'vendorSettlementStatesV2', 'vendorAccountStatesV2', 'invoiceStatesV2', 'vendorReturnsV2', 'chequeBooksV2', 'chequesV2', 'vendorLedgerEntriesV2', 'invoiceAllocationsV2', 'cashoutCorrectionRequests', 'vendorLedgerCorrectionRequestsV2', 'cashTransfers', 'financeOperations', 'financeCashoutQuotes', 'bankBalanceControl']) await assertFails(setDoc(doc(db, name, 'forged-' + role), {
        id: 'forged-' + role,
        amount: 1,
        revision: 1,
        actorUid: role,
        createdByUserId: role,
        requestedByUserId: role
      }));
      await assertFails(setDoc(doc(db, 'posSandboxes', 'test', 'drawerClosures', 'forged-' + role), {
        id: 'forged-' + role,
        cashoutId: 'forged-' + role,
        recordedByUid: role
      }));
    });
    it(role + ' cannot change bank balance through any overlapping metadata branch', async () => {
      const db = env.authenticatedContext(role).firestore();
      await assertFails(updateDoc(doc(db, 'appMetadata', 'appSettings'), {
        currentBankBalance: 999999
      }));
      await assertFails(setDoc(doc(db, 'appMetadata', 'vendorCatalog'), {
        vendors: [{
          name: 'Forged',
          openingOutstanding: 999
        }]
      }));
    });
    it(role + ' cannot read private operation receipts or release protected Cashout counts', async () => {
      const db = env.authenticatedContext(role, {
        auth_time: 42
      }).firestore();
      await assertFails(getDoc(doc(db, 'financeOperations', 'private')));
      await assertFails(updateDoc(doc(db, 'posSandboxes', 'test', 'handover', 'main'), {
        countReservation: null,
        revision: 11,
        lastOperation: 'count-release',
        lastOperationId: 'protected-cashout',
        updatedByUid: role
      }));
    });
  }
  it('bank control is owner-only; staff retains source reads and general owner settings use trusted publication', async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext('billing').firestore(), 'cashouts', 'posted')));
    await assertFails(getDoc(doc(env.authenticatedContext('billing').firestore(), 'bankBalanceControl', 'main')));
    await assertFails(getDoc(doc(env.authenticatedContext('manager').firestore(), 'bankBalanceControl', 'main')));
    await assertSucceeds(getDoc(doc(env.authenticatedContext('owner').firestore(), 'bankBalanceControl', 'main')));
    await assertFails(updateDoc(doc(env.authenticatedContext('owner').firestore(), 'appMetadata', 'appSettings'), {
      marginPercentage: 26
    }));
  });
  it('unauthenticated financial reads and writes fail', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'cashouts', 'posted')));
    await assertFails(setDoc(doc(db, 'cashouts', 'forged'), {
      amount: 1
    }));
  });
});
