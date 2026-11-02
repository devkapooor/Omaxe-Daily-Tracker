'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { createVendorMasterMigrationHandlers } = require('./vendorMasterMigration')

function fixture() {
  const store = new Map()
  const docRef = (collection, id) => ({ collection, id, path: `${collection}/${id}` })
  const put = (collection, id, value) => store.set(docRef(collection, id).path, structuredClone(value))
  const snapshot = target => {
    const value = store.get(target.path)
    return { id: target.id, ref: target, exists: value !== undefined, data: () => value && structuredClone(value), get: key => value?.[key] }
  }
  const db = {
    collection: name => ({ limit: count => ({ collection: name, count }) }),
    runTransaction: operation => operation(tx),
  }
  const tx = {
    async get(target) {
      if (target.collection && target.count) {
        const docs = [...store.keys()].filter(path => path.startsWith(`${target.collection}/`)).slice(0, target.count)
          .map(path => snapshot({ collection: target.collection, id: path.slice(target.collection.length + 1), path }))
        return { docs, size: docs.length, empty: docs.length === 0 }
      }
      return snapshot(target)
    },
    set(target, value) { store.set(target.path, structuredClone(value)) },
    update(target, value) {
      const next = structuredClone(store.get(target.path) ?? {})
      for (const [key, item] of Object.entries(value)) {
        if (key === 'vendors') delete next[key]
        else next[key] = item
      }
      store.set(target.path, next)
    },
    create(target, value) { if (store.has(target.path)) throw new Error(`already exists: ${target.path}`); store.set(target.path, structuredClone(value)) },
    delete(target) { store.delete(target.path) },
  }
  const ops = {
    db,
    ref: (collection, id) => docRef(collection, id),
    object(value, keys) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error('Invalid request fields'); return value },
    id(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_:%.~-]{1,180}$/.test(value)) throw new Error('Invalid ID'); return value },
    fail(message) { throw new Error(message) },
    async actorFor(_tx, _request, roles) { assert.deepEqual(roles, ['owner']); return { uid: 'owner-fixture', name: 'Test Owner', role: 'owner' } },
    async run(_request, _kind, _intent, roles, post) {
      assert.deepEqual(roles, ['owner'])
      const ctx = { tx, writes: [], actor: { uid: 'owner-fixture', name: 'Test Owner', role: 'owner' }, timestamp: '2026-10-31T05:00:00.000Z', operationId: 'migration-fixture' }
      const result = await post(ctx)
      for (const write of ctx.writes) write()
      return result
    },
  }
  put('appMetadata', 'vendorLedgerV2Config', { enabled: true, activationDate: '2026-01-01', balanceCutoverId: 'cutover-1', balanceCutoverDate: '2026-10-31' })
  put('appMetadata', 'nameDirectory', { people: ['Real Person'], vendors: ['Directory Only Supply', 'Alpha Supply'] })
  put('vendors', 'vendor-legacy-match', { id: 'vendor-legacy-match', name: 'Alpha Supply', ownerName: 'Owner A', contact: '111', address: 'Address A', companiesProvided: 'Brand A, Brand B', notes: 'Legacy note', openingOutstandingRemaining: 5000 })
  put('vendors', 'vendor-legacy-new', { id: 'vendor-legacy-new', name: 'New Supply', ownerName: 'Owner N', contact: '222', address: 'Address N', companiesProvided: 'Brand N', notes: 'New note', openingOutstandingRemaining: 9000 })
  put('vendorsV2', 'vendor-v2-alpha', { id: 'vendor-v2-alpha', canonicalName: 'Alpha Supply', aliases: [], ownerName: '', contact: '', address: 'Current address', suppliedBrands: ['Brand Existing'], notes: '', gstin: '09AAAAA0000A1Z5', active: true, openingBalancePaise: 0, revision: 2, createdAt: '2026-01-01T00:00:00.000Z', createdByUserId: 'owner', updatedAt: '2026-01-01T00:00:00.000Z', updatedByUserId: 'owner' })
  return { handlers: createVendorMasterMigrationHandlers(ops), store, docRef, request: data => ({ auth: { uid: 'owner-fixture' }, data }) }
}

describe('legacy vendor master migration', () => {
  it('previews identity candidates without changing either collection', async () => {
    const { handlers, store, request } = fixture()
    const before = structuredClone([...store.entries()])
    const result = await handlers.preview(request({}))

    assert.equal(result.legacyCount, 3)
    assert.equal(result.legacyRecordCount, 2)
    assert.equal(result.directoryNameCount, 2)
    assert.equal(result.currentCount, 1)
    assert.equal(result.records.find(row => row.legacyVendorId === 'vendor-legacy-match').suggestedVendorId, 'vendor-v2-alpha')
    assert.equal(result.records.find(row => row.legacyVendorId === 'vendor-legacy-new').suggestedVendorId, null)
    assert.deepEqual([...store.entries()], before)
  })

  it('requires a reviewed map for every legacy record before writing', async () => {
    const { handlers, store, request } = fixture()
    const before = structuredClone([...store.entries()])
    await assert.rejects(handlers.apply(request({ operationId: 'migration-fixture', confirmation: 'MOVE LEGACY VENDORS', mappings: [{ legacyVendorId: 'vendor-legacy-match', targetVendorId: 'vendor-v2-alpha' }] })), /changed after review/i)
    assert.deepEqual([...store.entries()], before)
  })

  it('merges reviewed identities, creates new vendors at zero, archives originals and removes legacy source docs', async () => {
    const { handlers, store, docRef, request } = fixture()
    const preview = await handlers.preview(request({}))
    const directoryName = preview.records.find(row => row.sourceKind === 'directory-name')
    const result = await handlers.apply(request({
      operationId: 'migration-fixture',
      confirmation: 'MOVE LEGACY VENDORS',
      mappings: [
        { legacyVendorId: 'vendor-legacy-match', targetVendorId: 'vendor-v2-alpha' },
        { legacyVendorId: 'vendor-legacy-new', targetVendorId: 'vendor-legacy-new' },
        { legacyVendorId: directoryName.legacyVendorId, targetVendorId: directoryName.legacyVendorId },
      ],
    }))

    assert.deepEqual(result, { migrationId: 'migration-fixture', migratedCount: 3, createdCount: 2, mergedCount: 1, removedLegacyRecords: 2, removedDirectoryNames: 2, payableEffectPaise: 0 })
    assert.equal(store.has(docRef('vendors', 'vendor-legacy-match').path), false)
    assert.equal(store.has(docRef('vendors', 'vendor-legacy-new').path), false)
    const merged = store.get(docRef('vendorsV2', 'vendor-v2-alpha').path)
    assert.equal(merged.gstin, '09AAAAA0000A1Z5')
    assert.equal(merged.address, 'Current address')
    assert.equal(merged.ownerName, 'Owner A')
    assert.deepEqual(merged.suppliedBrands, ['Brand Existing', 'Brand A', 'Brand B'])
    const created = store.get(docRef('vendorsV2', 'vendor-legacy-new').path)
    assert.equal(created.openingBalancePaise, 0)
    assert.equal(created.cutoverOpeningCaptured, false)
    assert.deepEqual(created.suppliedBrands, ['Brand N'])
    assert.equal(store.get(docRef('vendorsV2', directoryName.legacyVendorId).path).canonicalName, 'Directory Only Supply')
    assert.deepEqual(store.get(docRef('appMetadata', 'nameDirectory').path), { people: ['Real Person'] })
    assert.equal(store.get(docRef('vendorMasterMigrationArchives', 'archive-id-is-hashed').path), undefined)
    const archiveCount = [...store.keys()].filter(path => path.startsWith('vendorMasterMigrationArchives/')).length
    assert.equal(archiveCount, 3)
    assert.equal([...store.keys()].filter(path => path.startsWith('vendorMasterMigrations/')).length, 1)
  })

  it('requires the exact migration confirmation and preserves the legacy source', async () => {
    const { handlers, store, request } = fixture()
    const before = structuredClone([...store.entries()])
    await assert.rejects(handlers.apply(request({ operationId: 'migration-fixture', confirmation: 'MOVE VENDORS', mappings: [] })), /exact vendor migration confirmation/i)
    assert.deepEqual([...store.entries()], before)
  })
})
