import { useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import type { VendorLedgerV2Config } from '@/domain/appTypes'
import type { AppUser } from '@/domain/financeTypes'
import type { VendorV2 } from '@/domain/vendorLedgerV2'
import { functions } from '@/shared/lib/firebase'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { SelectField } from '@/shared/ui/select-field'

type PreviewRecord = {
  legacyVendorId: string
  sourceKind: 'legacy-vendor' | 'directory-name'
  name: string
  ownerName: string
  contact: string
  address: string
  companiesProvided: string
  notes: string
  candidateVendorIds: string[]
  suggestedVendorId: string | null
}
type Preview = { legacyCount: number; legacyRecordCount: number; directoryNameCount: number; currentCount: number; records: PreviewRecord[]; vendors: Array<{ id: string; canonicalName: string; active: boolean }> }
type MigrationResult = { migrationId: string; migratedCount: number; createdCount: number; mergedCount: number; removedLegacyRecords: number; removedDirectoryNames: number; payableEffectPaise: number }
const createPrefix = 'create-new:'
const sourcePrefix = 'merge-source:'
const previewCall = httpsCallable<Record<string, never>, Preview>(functions, 'previewLegacyVendorMasterMigration')
const applyCall = httpsCallable<{ operationId: string; mappings: Array<{ legacyVendorId: string; targetVendorId: string }>; confirmation: string }, MigrationResult>(functions, 'applyLegacyVendorMasterMigration')

export function LegacyVendorMigrationControl({ user, config, currentVendors }: { user: AppUser; config: VendorLedgerV2Config; currentVendors: VendorV2[] }) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [destinations, setDestinations] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const vendorNames = useMemo(() => new Map(currentVendors.map(vendor => [vendor.id, vendor.canonicalName])), [currentVendors])
  if (user.role !== 'owner') return null

  async function loadPreview() {
    setBusy(true); setError(''); setMessage('')
    try {
      const result = (await previewCall({})).data
      setPreview(result)
      setDestinations(Object.fromEntries(result.records.map(record => [record.legacyVendorId, ''])))
      if (!result.legacyCount) setMessage('No legacy vendor records remain to migrate.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load the legacy vendor review.')
    } finally { setBusy(false) }
  }

  async function applyMigration() {
    if (!preview || Object.values(destinations).some(value => !value)) return
    const confirmation = window.prompt('Vendor profile fields will move to the selected V2 records. Legacy opening balances are ignored; historical purchases and payments stay unchanged. Type exactly: MOVE LEGACY VENDORS')
    if (confirmation !== 'MOVE LEGACY VENDORS') return
    setBusy(true); setError(''); setMessage('')
    try {
      const orderedRecords = [...preview.records].sort((left, right) => {
        const leftCreates = destinations[left.legacyVendorId] === `${createPrefix}${left.legacyVendorId}`
        const rightCreates = destinations[right.legacyVendorId] === `${createPrefix}${right.legacyVendorId}`
        return Number(rightCreates) - Number(leftCreates)
      })
      const mappings = orderedRecords.map(record => {
        const destination = destinations[record.legacyVendorId]
        const targetVendorId = destination.startsWith(createPrefix) ? record.legacyVendorId : destination.startsWith(sourcePrefix) ? destination.slice(sourcePrefix.length) : destination
        return { legacyVendorId: record.legacyVendorId, targetVendorId }
      })
      const result = (await applyCall({ operationId: `vendor-migration-${crypto.randomUUID()}`, mappings, confirmation })).data
      setMessage(`Migration complete: ${result.migratedCount} moved, ${result.createdCount} new V2 vendors, ${result.mergedCount} linked to existing vendors. Payable effect: ₹0.`)
      setPreview(null)
      setDestinations({})
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Vendor migration failed. Review the latest preview before retrying.')
    } finally { setBusy(false) }
  }

  const options = [
    { value: '', label: 'Choose a V2 vendor', disabled: true },
    ...(preview?.vendors.map(vendor => ({ value: vendor.id, label: `${vendor.canonicalName}${vendor.active ? '' : ' (inactive)'}` })) ?? []),
  ]

  return <Card>
    <CardHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="font-semibold">Move legacy vendor profiles</h2><p className="text-xs text-muted-foreground">One-time owner review. Legacy balances and purchase/payment totals are not imported.</p></div>
      <Button size="sm" variant="outline" disabled={busy || !config.enabled} onClick={() => void loadPreview()}>{busy ? 'Working...' : preview ? 'Refresh review' : 'Review legacy vendors'}</Button>
    </CardHeader>
    {error ? <CardContent><p role="alert" className="text-sm text-destructive">{error}</p></CardContent> : null}
    {message ? <CardContent><p role="status" className="text-sm">{message}</p></CardContent> : null}
    {preview?.legacyCount ? <CardContent className="grid gap-3 pt-0">
      <p className="rounded border p-3 text-sm">Review all {preview.legacyCount} profiles: {preview.legacyRecordCount} old vendor records and {preview.directoryNameCount} saved vendor names. Existing V2 details are kept when already filled; missing contact, address, owner, notes and supplied brands can be filled from the legacy profile. Old opening balances are not imported. Originals are kept in a restricted recovery archive; old collection records and directory names are removed after the move.</p>
      {preview.records.map(record => {
        const destination = destinations[record.legacyVendorId] ?? ''
        const canCreate = !preview.vendors.some(vendor => vendor.id === record.legacyVendorId)
        const rowOptions = [
          ...options,
          ...(canCreate ? [{ value: `${createPrefix}${record.legacyVendorId}`, label: 'Create separate V2 vendor (zero opening balance)' }] : []),
          ...preview.records.filter(candidate => candidate.legacyVendorId !== record.legacyVendorId && destinations[candidate.legacyVendorId] === `${createPrefix}${candidate.legacyVendorId}`).map(candidate => ({ value: `${sourcePrefix}${candidate.legacyVendorId}`, label: `Link to new profile: ${candidate.name}` })),
        ]
        return <article key={record.legacyVendorId} className="grid gap-2 rounded-lg border p-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
          <div className="min-w-0 text-sm"><strong>{record.name || 'Name missing'}</strong><p className="text-xs text-muted-foreground">{record.sourceKind === 'legacy-vendor' ? 'Legacy record' : 'Saved vendor name'}: {record.legacyVendorId}</p><dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Owner</dt><dd className="break-words">{record.ownerName || 'Not recorded'}</dd></div><div><dt className="text-xs text-muted-foreground">Contact</dt><dd className="break-words">{record.contact || 'Not recorded'}</dd></div><div><dt className="text-xs text-muted-foreground">Address</dt><dd className="break-words">{record.address || 'Not recorded'}</dd></div><div><dt className="text-xs text-muted-foreground">Supplied brands</dt><dd className="break-words">{record.companiesProvided || 'Not recorded'}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Notes</dt><dd className="break-words">{record.notes || 'Not recorded'}</dd></div></dl><p className="mt-2 text-xs text-muted-foreground">Suggested matches: {record.candidateVendorIds.map(id => vendorNames.get(id) ?? id).join(', ') || 'none'}</p></div>
          <div className="grid content-start gap-2"><label className="text-xs font-medium">Move this profile to</label><SelectField aria-label={`Move ${record.name} to`} options={rowOptions} value={destination} onValueChange={value => setDestinations(current => ({ ...current, [record.legacyVendorId]: value }))} /><p className="text-xs text-muted-foreground">Choose an existing record only after confirming it is the same vendor. Otherwise create a separate profile.</p></div>
        </article>
      })}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><span className="text-xs text-muted-foreground">Every row needs a destination. The transaction writes the V2 profile, restricted archive, migration audit and source removal atomically.</span><Button variant="destructive" disabled={busy || preview.records.some(record => { const value = destinations[record.legacyVendorId] ?? ''; return !value || (value.startsWith(sourcePrefix) && destinations[value.slice(sourcePrefix.length)] !== `${createPrefix}${value.slice(sourcePrefix.length)}`) })} onClick={() => void applyMigration()}>{busy ? 'Moving profiles...' : 'Move reviewed vendor profiles'}</Button></div>
    </CardContent> : null}
  </Card>
}
