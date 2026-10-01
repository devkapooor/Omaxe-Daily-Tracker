import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { UserRole } from '@/domain/financeTypes'
import type { VendorV2 } from '@/domain/vendorLedgerV2'
import { buildVendorAliasReview, vendorIdentitySearchText } from '@/domain/vendorIdentityV2'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { SectionHeading } from '@/shared/ui/section-heading'

type VendorDirectoryV2Props = {
  currentUserRole: UserRole
  legacyVendorNames: string[]
  onAddVendor?: () => void
  vendors: VendorV2[]
}

export function VendorDirectoryV2({ currentUserRole, legacyVendorNames, onAddVendor, vendors }: VendorDirectoryV2Props) {
  const [search, setSearch] = useState('')
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const vendorTriggerRef = useRef<HTMLButtonElement | null>(null)
  const query = search.trim().toLocaleLowerCase('en-IN')
  const filteredVendors = useMemo(
    () => vendors.filter((vendor) => !query || vendorIdentitySearchText(vendor).includes(query)),
    [query, vendors],
  )
  const selectedVendor = vendors.find((vendor) => vendor.id === selectedVendorId) ?? null
  const aliasReview = useMemo(
    () => currentUserRole === 'owner' ? buildVendorAliasReview(legacyVendorNames, vendors) : [],
    [currentUserRole, legacyVendorNames, vendors],
  )

  useEffect(() => {
    if (!selectedVendorId) return
    closeButtonRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedVendorId(null)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      vendorTriggerRef.current?.focus()
    }
  }, [selectedVendorId])

  return (
    <section className="grid gap-3">
      <Card>
        <CardHeader className="gap-3 border-b border-border/60 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <SectionHeading eyebrow={`${vendors.length} ${vendors.length === 1 ? 'vendor' : 'vendors'}`} title="Vendors" />
            <p className="mt-1 text-sm text-muted-foreground">Profiles used across purchases, payments, balances, and cheques.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
            <FieldLabel className="w-full sm:w-72" label="Search">
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, contact, company..." />
            </FieldLabel>
            {onAddVendor ? <Button type="button" onClick={onAddVendor}><Plus className="size-4" /> Add Vendor</Button> : null}
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 pt-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredVendors.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/80 bg-secondary/25 p-6 text-center sm:col-span-2 xl:col-span-3">
              <p className="font-semibold text-foreground">{vendors.length === 0 ? 'No vendors added yet' : 'No vendors match this search'}</p>
              <p className="mt-1 text-sm text-muted-foreground">{vendors.length === 0 ? 'Use Add Vendor to create the first profile.' : 'Try a different name, contact, company, or note.'}</p>
            </div>
          ) : null}
          {filteredVendors.map((vendor) => (
            <button
              key={vendor.id}
              type="button"
              className="group rounded-2xl border border-border/70 bg-secondary/45 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(event) => {
                vendorTriggerRef.current = event.currentTarget
                setSelectedVendorId(vendor.id)
              }}
            >
              <span className="flex items-start justify-between gap-3">
                <strong className="text-sm font-bold text-foreground group-hover:text-cyan-700">{vendor.canonicalName}</strong>
                <Badge variant={vendor.active ? 'success' : 'secondary'}>{vendor.active ? 'Active' : 'Inactive'}</Badge>
              </span>
              <span className="mt-2 block text-xs text-muted-foreground">{vendor.contact || 'No contact provided'}</span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">{vendor.suppliedBrands.join(', ') || 'No companies provided'}</span>
            </button>
          ))}
        </CardContent>
      </Card>

      {selectedVendor ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/65 px-3 py-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="vendor-details-title">
          <Card className="max-h-[92dvh] w-full max-w-[42rem] overflow-y-auto border-cyan-200 shadow-[0_24px_80px_rgba(38,78,118,0.22)]">
            <CardHeader className="gap-3 border-b border-border/70">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="mb-2"><Badge variant={selectedVendor.active ? 'success' : 'secondary'}>{selectedVendor.active ? 'Active vendor' : 'Inactive vendor'}</Badge></div>
                  <h2 id="vendor-details-title" className="text-xl font-black text-foreground">{selectedVendor.canonicalName}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Vendor profile details</p>
                </div>
                <Button ref={closeButtonRef} type="button" size="icon" variant="ghost" aria-label="Close vendor details" onClick={() => setSelectedVendorId(null)}>
                  <X className="size-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
              <VendorDetail label="Owner" value={selectedVendor.ownerName || 'Not provided'} />
              <VendorDetail label="Contact" value={selectedVendor.contact || 'Not provided'} />
              <VendorDetail className="sm:col-span-2" label="Address" value={selectedVendor.address || 'Not provided'} />
              <VendorDetail className="sm:col-span-2" label="Companies Provided" value={selectedVendor.suppliedBrands.join(', ') || 'Not provided'} />
              {selectedVendor.aliases.length > 0 ? <VendorDetail className="sm:col-span-2" label="Known As" value={selectedVendor.aliases.join(', ')} /> : null}
              <VendorDetail className="sm:col-span-2" label="Notes / Comments" value={selectedVendor.notes || 'Not provided'} />
              <div className="sm:col-span-2 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 px-3.5 py-3">
                <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-700">Opening Balance</span>
                <strong className="mt-1 block text-base text-foreground">INR {(selectedVendor.openingBalancePaise / 100).toLocaleString('en-IN')}</strong>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {currentUserRole === 'owner' && legacyVendorNames.length > 0 ? (
        <Card>
          <CardHeader>
            <SectionHeading eyebrow="Owner review" title="Legacy Name Matching" />
            <p className="text-sm text-muted-foreground">Review only. These matches do not copy balances or write aliases.</p>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {aliasReview.map((candidate) => (
              <div key={candidate.normalizedLegacyName} className="rounded-2xl border border-border/70 bg-secondary/45 p-3">
                <div className="flex items-start justify-between gap-2">
                  <strong className="text-sm text-foreground">{candidate.legacyName}</strong>
                  <Badge variant={candidate.status === 'ambiguous' ? 'warning' : candidate.status === 'unmatched' ? 'secondary' : 'outline'}>
                    {candidate.status.replace('-', ' ')}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {candidate.vendorIds.length > 0 ? `Matches: ${candidate.vendorIds.join(', ')}` : 'No V2 vendor selected.'}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </section>
  )
}

function VendorDetail({ className, label, value }: { className?: string; label: string; value: string }) {
  return (
    <div className={className ? `space-y-1 ${className}` : 'space-y-1'}>
      <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <p className="whitespace-pre-wrap text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}
