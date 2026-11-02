'use strict'

const { createHash } = require('node:crypto')
const { FieldValue } = require('firebase-admin/firestore')
const p = require('./financeOperations')
const MAX_MIGRATION_PROFILES = 150

const normalizedName = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-IN')
const unique = values => [...new Set(values.map(value => String(value ?? '').trim()).filter(Boolean))]
const splitBrands = value => unique(String(value ?? '').split(/[;,\n]/))
const directoryProfileId = name => `directory-${createHash('sha256').update(normalizedName(name)).digest('hex').slice(0, 32)}`
function sourceProfiles(legacyDocs, directoryNames) {
  const profileMap = new Map(legacyDocs.map(doc => [doc.id, { id: doc.id, sourceKind: 'legacy-vendor', data: doc.data(), ref: doc.ref }]))
  const legacyNameKeys = new Set(legacyDocs.map(doc => normalizedName(doc.get('name'))).filter(Boolean))
  const seen = new Set()
  for (const name of directoryNames) {
    if (typeof name !== 'string' || !name.trim()) continue
    const key = normalizedName(name)
    if (legacyNameKeys.has(key) || seen.has(key)) continue
    seen.add(key)
    const id = directoryProfileId(name)
    if (profileMap.has(id)) p.fail('Legacy vendor reference IDs conflict. Review the source data before migration.')
    profileMap.set(id, { id, sourceKind: 'directory-name', data: { name: name.trim() } })
  }
  return profileMap
}

function createVendorMasterMigrationHandlers(ops) {
  const { db, ref, run } = ops
  const vendors = () => db.collection('vendors')
  const vendorsV2 = () => db.collection('vendorsV2')
  const vendorCandidates = (legacy, current) => {
    const name = normalizedName(legacy.name)
    return current.filter(vendor => [vendor.canonicalName, ...(vendor.aliases ?? [])].some(candidate => normalizedName(candidate) === name))
  }
  const requireEnabledLedger = config => {
    if (config?.enabled !== true) p.fail('Enable the V2 vendor ledger before migrating vendor identities.')
    if (!config.activationDate) p.fail('Vendor ledger activation date is unavailable; no migration was performed.')
  }

  async function preview(request) {
    return db.runTransaction(async tx => {
      await ops.actorFor(tx, request, ['owner'])
      const [configSnap, legacySnap, directorySnap, v2Snap] = await Promise.all([
        tx.get(ref('appMetadata', 'vendorLedgerV2Config')),
        tx.get(vendors().limit(501)),
        tx.get(ref('appMetadata', 'nameDirectory')),
        tx.get(vendorsV2().limit(501)),
      ])
      requireEnabledLedger(configSnap.data())
      if (legacySnap.size > 500 || v2Snap.size > 500) p.fail('Vendor collections exceed the safe review limit. No migration was performed.')
      const current = v2Snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      const directoryNames = Array.isArray(directorySnap.data()?.vendors) ? directorySnap.data().vendors : []
      const profiles = [...sourceProfiles(legacySnap.docs, directoryNames).values()]
      if (directoryNames.length > MAX_MIGRATION_PROFILES || profiles.length > MAX_MIGRATION_PROFILES) p.fail(`Vendor migration is limited to ${MAX_MIGRATION_PROFILES} source profiles per transaction. No data was changed.`)
      return {
        legacyCount: profiles.length,
        legacyRecordCount: legacySnap.size,
        directoryNameCount: directoryNames.length,
        currentCount: current.length,
        records: profiles.map(profile => {
          const source = profile.data
          const candidates = vendorCandidates(source, current)
          return {
            legacyVendorId: profile.id,
            sourceKind: profile.sourceKind,
            name: String(source.name ?? ''),
            ownerName: String(source.ownerName ?? ''),
            contact: String(source.contact ?? ''),
            address: String(source.address ?? ''),
            companiesProvided: String(source.companiesProvided ?? ''),
            notes: String(source.notes ?? ''),
            candidateVendorIds: candidates.map(candidate => candidate.id),
            suggestedVendorId: candidates.length === 1 ? candidates[0].id : null,
          }
        }).sort((left, right) => left.name.localeCompare(right.name)),
        vendors: current.map(vendor => ({ id: vendor.id, canonicalName: vendor.canonicalName, active: vendor.active === true }))
          .sort((left, right) => left.canonicalName.localeCompare(right.canonicalName)),
      }
    })
  }

  async function apply(request) {
    const d = p.object(request.data, ['operationId', 'mappings', 'confirmation'])
    p.id(d.operationId)
    if (d.confirmation !== 'MOVE LEGACY VENDORS') p.fail('Type the exact vendor migration confirmation.')
    if (!Array.isArray(d.mappings) || d.mappings.length > 500) p.fail('Review every legacy vendor before migration.', 'invalid-argument')
    const mappings = d.mappings.map(entry => {
      const mapping = p.object(entry, ['legacyVendorId', 'targetVendorId'])
      return { legacyVendorId: p.id(mapping.legacyVendorId), targetVendorId: p.id(mapping.targetVendorId) }
    })
    if (new Set(mappings.map(mapping => mapping.legacyVendorId)).size !== mappings.length) p.fail('A legacy vendor appears more than once in the review map.', 'invalid-argument')

    return run(request, 'vendor-master-migration', { ...d, mappings }, ['owner'], async ctx => {
      const [configSnap, legacySnap, directorySnap, v2Snap] = await Promise.all([
        ctx.tx.get(ref('appMetadata', 'vendorLedgerV2Config')),
        ctx.tx.get(vendors().limit(501)),
        ctx.tx.get(ref('appMetadata', 'nameDirectory')),
        ctx.tx.get(vendorsV2().limit(501)),
      ])
      requireEnabledLedger(configSnap.data())
      if (legacySnap.size > 500 || v2Snap.size > 500) p.fail('Vendor collections exceed the safe migration limit. No migration was performed.')
      const directoryNames = Array.isArray(directorySnap.data()?.vendors) ? directorySnap.data().vendors : []
      const profiles = sourceProfiles(legacySnap.docs, directoryNames)
      if (directoryNames.length > MAX_MIGRATION_PROFILES || profiles.size > MAX_MIGRATION_PROFILES) p.fail(`Vendor migration is limited to ${MAX_MIGRATION_PROFILES} source profiles per transaction. No data was changed.`)
      if (profiles.size !== mappings.length) p.fail('Legacy vendor sources changed after review. Reload the migration preview; nothing was changed.', 'aborted')
      if (mappings.some(mapping => !profiles.has(mapping.legacyVendorId))) p.fail('The migration map does not match the current legacy vendor sources. Reload the preview; nothing was changed.', 'aborted')
      const currentById = new Map(v2Snap.docs.map(doc => [doc.id, { ref: doc.ref, data: doc.data() }]))
      const targetById = new Map([...currentById].map(([id, value]) => [id, { ...value.data }]))
      const createdIds = new Set()
      const mergedIds = new Set()

      for (const mapping of mappings) {
        const profile = profiles.get(mapping.legacyVendorId)
        const source = profile.data
        const name = String(source.name ?? '').trim()
        if (!name) p.fail('A legacy vendor has no name. Correct its identity before migration.')
        let target = targetById.get(mapping.targetVendorId)
        if (!target) {
          if (mapping.targetVendorId !== mapping.legacyVendorId) p.fail('A new vendor must retain its legacy stable ID. Review the migration map; nothing was changed.')
          const collision = [...targetById.values()].some(vendor => [vendor.canonicalName, ...(vendor.aliases ?? [])].some(candidate => normalizedName(candidate) === normalizedName(name)))
          if (collision) p.fail('A new vendor name matches an existing vendor. Link it to the correct vendor or resolve the duplicate name before migrating.')
          const config = configSnap.data()
          const created = {
            id: mapping.targetVendorId,
            canonicalName: name,
            ...(String(source.ownerName ?? '').trim() ? { ownerName: String(source.ownerName).trim() } : {}),
            aliases: [],
            contact: String(source.contact ?? '').trim(),
            address: String(source.address ?? '').trim(),
            suppliedBrands: splitBrands(source.companiesProvided),
            ...(String(source.notes ?? '').trim() ? { notes: String(source.notes).trim() } : {}),
            active: true,
            openingBalancePaise: 0,
            revision: 1,
            createdAt: ctx.timestamp,
            createdByUserId: ctx.actor.uid,
            updatedAt: ctx.timestamp,
            updatedByUserId: ctx.actor.uid,
            ...(config.balanceCutoverId ? {
              balanceCutoverId: config.balanceCutoverId,
              balanceCutoverDate: config.balanceCutoverDate,
              cutoverOpeningCaptured: false,
            } : {}),
          }
          targetById.set(mapping.targetVendorId, created)
          createdIds.add(mapping.targetVendorId)
          ctx.writes.push(() => ctx.tx.create(ref('vendorsV2', mapping.targetVendorId), targetById.get(mapping.targetVendorId)))
        } else {
          const canonical = String(target.canonicalName ?? '').trim()
          const aliases = unique([...(target.aliases ?? []), ...(normalizedName(canonical) === normalizedName(name) ? [] : [name])])
          const suppliedBrands = unique([...(target.suppliedBrands ?? []), ...splitBrands(source.companiesProvided)])
          const merged = {
            ...target,
            ...(target.ownerName || !String(source.ownerName ?? '').trim() ? {} : { ownerName: String(source.ownerName).trim() }),
            ...(target.contact || !String(source.contact ?? '').trim() ? {} : { contact: String(source.contact).trim() }),
            ...(target.address || !String(source.address ?? '').trim() ? {} : { address: String(source.address).trim() }),
            ...(target.notes || !String(source.notes ?? '').trim() ? {} : { notes: String(source.notes).trim() }),
            aliases,
            suppliedBrands,
            revision: (target.revision ?? 0) + 1,
            updatedAt: ctx.timestamp,
            updatedByUserId: ctx.actor.uid,
          }
          targetById.set(mapping.targetVendorId, merged)
          if (!createdIds.has(mapping.targetVendorId)) mergedIds.add(mapping.targetVendorId)
        }
      }

      for (const id of mergedIds) {
        const current = currentById.get(id)
        ctx.writes.push(() => ctx.tx.set(current.ref, targetById.get(id)))
      }

      const migrationId = d.operationId
      for (const mapping of mappings) {
        const profile = profiles.get(mapping.legacyVendorId)
        if (profile.sourceKind === 'legacy-vendor') {
          const archiveId = createHash('sha256').update(`${migrationId}:${mapping.legacyVendorId}`).digest('hex')
          ctx.writes.push(() => ctx.tx.create(ref('vendorMasterMigrationArchives', archiveId), {
            migrationId,
            legacyVendorId: mapping.legacyVendorId,
            targetVendorId: mapping.targetVendorId,
            originalRecord: profile.data,
            archivedAt: ctx.timestamp,
            archivedByUserId: ctx.actor.uid,
          }))
          ctx.writes.push(() => ctx.tx.delete(profile.ref))
        }
      }
      if (directorySnap.exists && Array.isArray(directorySnap.data()?.vendors) && directorySnap.data().vendors.length) {
        const archiveId = createHash('sha256').update(`${migrationId}:nameDirectory-vendors`).digest('hex')
        ctx.writes.push(() => ctx.tx.create(ref('vendorMasterMigrationArchives', archiveId), {
          migrationId,
          source: 'appMetadata/nameDirectory.vendors',
          originalVendorNames: directorySnap.data().vendors,
          archivedAt: ctx.timestamp,
          archivedByUserId: ctx.actor.uid,
        }))
        ctx.writes.push(() => ctx.tx.update(ref('appMetadata', 'nameDirectory'), { vendors: FieldValue.delete() }))
      }
      const result = {
        migrationId,
        migratedCount: mappings.length,
        createdCount: createdIds.size,
        mergedCount: mergedIds.size,
        removedLegacyRecords: legacySnap.size,
        removedDirectoryNames: directoryNames.length,
        payableEffectPaise: 0,
      }
      ctx.writes.push(() => ctx.tx.create(ref('vendorMasterMigrations', migrationId), {
        ...result,
        mappings,
        createdAt: ctx.timestamp,
        createdByUserId: ctx.actor.uid,
        note: 'Vendor identity migration only. Legacy opening balances and transaction amounts were not imported.',
      }))
      return result
    })
  }

  return { preview, apply }
}

module.exports = { createVendorMasterMigrationHandlers, normalizedName, splitBrands, MAX_MIGRATION_PROFILES }
