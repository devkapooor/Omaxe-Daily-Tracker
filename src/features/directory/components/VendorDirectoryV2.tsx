import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { UserRole } from '@/domain/financeTypes'
import type { VendorV2 } from '@/domain/vendorLedgerV2'
import { partyNameKey } from '@/domain/partyDirectory'
import { vendorIdentitySearchText } from '@/domain/vendorIdentityV2'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
import { BusinessReference } from '@/shared/businessReferences'

export function VendorDirectoryV2({ currentUserRole, legacyVendorNames, onAddVendor, vendors, partyNames = [], savedPartyNames = [], confirmedPartyNames = [], referenceNames = [], onSaveParty, onRenameParty, onEditOpening, onUpdateVendorGstin }: {
  currentUserRole: UserRole; legacyVendorNames: string[]; onAddVendor?: () => void; vendors: VendorV2[]
  partyNames?: string[]; savedPartyNames?: string[]; confirmedPartyNames?: string[]; referenceNames?: string[]
  onSaveParty?: (name: string) => Promise<void>; onRenameParty?: (before: string, after: string) => Promise<void>
  onEditOpening?: (vendor: VendorV2) => void
  onUpdateVendorGstin?: (vendor: VendorV2, gstin: string) => Promise<void>
}) {
  const [search, setSearch] = useState(''), [filter, setFilter] = useState('all')
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null)
  const [selectedParty, setSelectedParty] = useState<string | null>(null), [rename, setRename] = useState('')
  const [vendorGstin, setVendorGstin] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!selectedVendorId && !selectedParty) return
    closeRef.current?.focus()
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSelectedVendorId(null); setSelectedParty(null) } }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [selectedVendorId, selectedParty])
  const selected = vendors.find(vendor => vendor.id === selectedVendorId)
  useEffect(() => { setVendorGstin(selected?.gstin ?? '') }, [selected?.gstin, selectedVendorId])
  const saved = new Set(savedPartyNames.map(partyNameKey)), references = new Set(referenceNames.map(partyNameKey))
  const confirmed = new Set([...savedPartyNames, ...confirmedPartyNames].map(partyNameKey))
  const words = search.trim().toLocaleLowerCase('en-IN').split(/\s+/).filter(Boolean)
  const visibleVendors = vendors.filter(vendor => (filter === 'all' || filter === 'vendors') && words.every(word => vendorIdentitySearchText(vendor).includes(word)))
  const others = useMemo(() => {
    const vendorLabels = new Set([...vendors.flatMap(vendor => [vendor.canonicalName, ...vendor.aliases]), ...legacyVendorNames].map(partyNameKey))
    const references = new Set(referenceNames.map(partyNameKey))
    // Unconfirmed expense labels are references, not directory entries. Their source history remains untouched.
    // Keep confirmed parties even when a supplier happens to share the same name.
    return [...new Map(partyNames.filter(name => confirmed.has(partyNameKey(name)) || (!vendorLabels.has(partyNameKey(name)) && !references.has(partyNameKey(name)))).map(name => [partyNameKey(name), name])).values()].sort((a, b) => a.localeCompare(b))
  }, [partyNames, legacyVendorNames, vendors, savedPartyNames, confirmedPartyNames, referenceNames])
  const visibleParties = others.filter(name => (filter === 'all' || filter === 'parties') && words.every(word => partyNameKey(name).includes(word)))
  async function save(action: () => Promise<void>) { setBusy(true); setError(''); try { await action(); setSelectedParty(null) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Party could not be saved.') } finally { setBusy(false) } }
  async function saveVendorTax(vendor: VendorV2) { if (!onUpdateVendorGstin) return; setBusy(true); setError(''); try { await onUpdateVendorGstin(vendor, vendorGstin.trim().toUpperCase()); setError('Vendor GSTIN saved.') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Vendor GSTIN could not be saved.') } finally { setBusy(false) } }
  return <Card className="min-w-0"><CardHeader className="gap-3 border-b sm:flex-row sm:items-end sm:justify-between">
    <div><h2 className="text-base font-semibold">Vendors &amp; Parties</h2><p className="text-xs text-muted-foreground">Showing vendors and confirmed parties; transaction history stays intact</p></div>
    <div className="flex flex-wrap gap-2"><FieldLabel label="Search names or aliases"><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search the directory" /></FieldLabel><FieldLabel label="Show"><NativeSelect value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All</option><option value="vendors">Vendors</option><option value="parties">Other parties</option></NativeSelect></FieldLabel>{onAddVendor ? <Button className="self-end" onClick={onAddVendor}><Plus className="size-4" />Add Party / Vendor</Button> : null}</div>
  </CardHeader><CardContent className="divide-y pt-0">
    {!visibleVendors.length && !visibleParties.length ? <p className="py-4 text-sm text-muted-foreground">No matching names.</p> : null}
    {visibleVendors.map(vendor => <button key={vendor.id} type="button" className="flex min-h-10 w-full items-center justify-between gap-3 py-2 text-left text-sm hover:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setSelectedVendorId(vendor.id)}><span><strong>{vendor.canonicalName}</strong><small className="block text-muted-foreground"><BusinessReference prefix="VENDOR" id={vendor.id}/></small></span><span className="text-[11px] text-muted-foreground">{vendor.active ? 'Vendor' : 'Inactive vendor'}</span></button>)}
    {visibleParties.map(name => <button key={partyNameKey(name)} type="button" className="flex min-h-10 w-full items-center justify-between gap-3 py-2 text-left text-sm hover:bg-secondary/50" onClick={() => { setSelectedParty(name); setRename(name); setError('') }}><span><strong>{name}</strong>{saved.has(partyNameKey(name))?<small className="block text-muted-foreground"><BusinessReference prefix="PARTY" id={name}/></small>:null}</span><span className="text-[11px] text-muted-foreground">{references.has(partyNameKey(name)) && !confirmed.has(partyNameKey(name)) ? 'Reference' : 'Party'}</span></button>)}
  </CardContent>
  {selected || selectedParty ? <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true" aria-label={selected ? 'Vendor details' : 'Party details'}><Card className="max-h-[88dvh] w-full max-w-xl overflow-y-auto"><CardHeader className="flex-row items-center justify-between border-b"><h2 className="font-semibold">{selected?.canonicalName ?? selectedParty}</h2><Button ref={closeRef} size="icon" variant="ghost" aria-label="Close directory details" onClick={() => { setSelectedVendorId(null); setSelectedParty(null) }}><X /></Button></CardHeader><CardContent className="grid gap-3 pt-4 text-sm">
    {selected ? <><p className="text-xs"><BusinessReference prefix="VENDOR" id={selected.id}/></p><dl className="grid grid-cols-2 gap-3">{[['Owner', selected.ownerName], ['Contact', selected.contact], ['Address', selected.address], ['Companies', selected.suppliedBrands.join(', ')], ['Known as', selected.aliases.join(', ')], ['Notes', selected.notes]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words">{value || 'Not provided'}</dd></div>)}</dl>{currentUserRole==='owner'&&onUpdateVendorGstin?<div className="grid gap-2 rounded border p-3"><FieldLabel label="Vendor GSTIN (optional)"><Input value={vendorGstin} maxLength={15} onChange={event=>setVendorGstin(event.target.value.toUpperCase())} placeholder="15-character GSTIN" /></FieldLabel><Button size="sm" className="justify-self-start" disabled={busy} onClick={()=>void saveVendorTax(selected)}>Save vendor GSTIN</Button></div>:<p><span className="text-xs text-muted-foreground">Vendor GSTIN: </span>{selected.gstin||'Not provided'}</p>}{error?<p role="status" className="text-sm">{error}</p>:null}<div className="flex flex-wrap items-center justify-between gap-2 rounded border p-3"><span>Opening payable <strong>₹{(selected.openingBalancePaise / 100).toLocaleString('en-IN')}</strong></span>{currentUserRole === 'owner' && onEditOpening ? <Button size="sm" variant="outline" onClick={() => { setSelectedVendorId(null); onEditOpening(selected) }}>Correct opening balance</Button> : null}</div><p className="text-xs text-muted-foreground">Opening balance is the amount brought forward, not the current outstanding.</p></> : selectedParty ? <>{saved.has(partyNameKey(selectedParty))?<p className="text-xs"><BusinessReference prefix="PARTY" id={selectedParty}/></p>:null}{error ? <p role="alert" className="text-destructive">{error}</p> : null}{saved.has(partyNameKey(selectedParty)) ? <><FieldLabel label="Party name"><Input value={rename} onChange={event => setRename(event.target.value)} /></FieldLabel><p className="text-xs text-muted-foreground">Renaming the saved directory label does not rewrite historical transactions.</p><Button disabled={busy || !rename.trim() || !onRenameParty} onClick={() => void save(() => onRenameParty!(selectedParty, rename.trim()))}>Save party name</Button></> : <><p>This name is preserved from existing records. No account has been merged or deleted.</p><p className="text-xs text-muted-foreground">Save it only after confirming it represents a real person or organisation.</p><Button disabled={busy || !onSaveParty} onClick={() => void save(() => onSaveParty!(selectedParty))}>Confirm and save as a party</Button></>}</> : null}
  </CardContent></Card></div> : null}
  </Card>
}
