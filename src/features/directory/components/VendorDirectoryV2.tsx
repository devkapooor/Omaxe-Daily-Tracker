import { useMemo, useState } from 'react'
import type { UserRole } from '@/domain/financeTypes'
import type { VendorV2 } from '@/domain/vendorLedgerV2'
import { buildVendorAliasReview, vendorIdentitySearchText } from '@/domain/vendorIdentityV2'
import { Badge } from '@/shared/ui/badge'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { SectionHeading } from '@/shared/ui/section-heading'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'

type VendorDirectoryV2Props = {
  currentUserRole: UserRole
  legacyVendorNames: string[]
  vendors: VendorV2[]
}

const emptyTabCopy = {
  ledger: 'Ledger activity will appear after the V2 purchase and settlement phases are activated.',
  purchases: 'V2 purchase invoices will appear here after the purchase workflow is activated.',
  returns: 'Vendor returns will appear here after the returns workflow is activated.',
  cheques: 'Vendor cheques will appear here through the unified Cheque Register.',
} as const

export function VendorDirectoryV2({ currentUserRole, legacyVendorNames, vendors }: VendorDirectoryV2Props) {
  const [search, setSearch] = useState('')
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(vendors[0]?.id ?? null)
  const query = search.trim().toLocaleLowerCase('en-IN')
  const filteredVendors = useMemo(
    () => vendors.filter((vendor) => !query || vendorIdentitySearchText(vendor).includes(query)),
    [query, vendors],
  )
  const selectedVendor = vendors.find((vendor) => vendor.id === selectedVendorId) ?? vendors[0] ?? null
  const aliasReview = useMemo(
    () => currentUserRole === 'owner' ? buildVendorAliasReview(legacyVendorNames, vendors) : [],
    [currentUserRole, legacyVendorNames, vendors],
  )

  return (
    <section className="grid gap-3">
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading eyebrow="V2 vendor identity" title="Stable Vendor Directory" />
          <FieldLabel className="w-full sm:max-w-sm" label="Search vendor details">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search V2 vendors" />
          </FieldLabel>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-[minmax(15rem,0.75fr)_minmax(0,1.25fr)]">
          <div className="grid content-start gap-2">
            {filteredVendors.length === 0 ? (
              <p className="rounded-2xl border border-border/70 bg-secondary/45 p-4 text-sm text-muted-foreground">No V2 vendors found.</p>
            ) : null}
            {filteredVendors.map((vendor) => (
              <button
                key={vendor.id}
                type="button"
                className="rounded-2xl border border-border/70 bg-secondary/50 p-3 text-left transition-colors hover:bg-secondary/75"
                onClick={() => setSelectedVendorId(vendor.id)}
              >
                <span className="flex items-center justify-between gap-2">
                  <strong className="text-sm text-foreground">{vendor.canonicalName}</strong>
                  <Badge variant={vendor.active ? 'success' : 'secondary'}>{vendor.active ? 'Active' : 'Inactive'}</Badge>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">ID: {vendor.id}</span>
                {vendor.aliases.length > 0 ? <span className="mt-1 block text-xs text-muted-foreground">Aliases: {vendor.aliases.join(', ')}</span> : null}
              </button>
            ))}
          </div>

          {selectedVendor ? (
            <Card className="border-cyan-400/15 bg-secondary/30">
              <CardHeader>
                <SectionHeading eyebrow={`Vendor ID ${selectedVendor.id}`} title={selectedVendor.canonicalName} />
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="overview">
                  <TabsList className="grid-cols-5 overflow-x-auto">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="ledger">Ledger</TabsTrigger>
                    <TabsTrigger value="purchases">Purchases</TabsTrigger>
                    <TabsTrigger value="returns">Returns</TabsTrigger>
                    <TabsTrigger value="cheques">Cheques</TabsTrigger>
                  </TabsList>
                  <TabsContent value="overview" className="grid gap-2 pt-3 text-sm">
                    <p><span className="text-muted-foreground">Owner:</span> {selectedVendor.ownerName || 'Not provided'}</p>
                    <p><span className="text-muted-foreground">Contact:</span> {selectedVendor.contact || 'Not provided'}</p>
                    <p><span className="text-muted-foreground">Address:</span> {selectedVendor.address || 'Not provided'}</p>
                    <p><span className="text-muted-foreground">Brands:</span> {selectedVendor.suppliedBrands.join(', ') || 'Not provided'}</p>
                    <p><span className="text-muted-foreground">Notes:</span> {selectedVendor.notes || 'Not provided'}</p>
                    <p><span className="text-muted-foreground">Opening:</span> New V2 vendors default to zero; legacy balances are excluded.</p>
                  </TabsContent>
                  {Object.entries(emptyTabCopy).map(([tab, copy]) => (
                    <TabsContent key={tab} value={tab} className="pt-3">
                      <p className="rounded-2xl border border-border/70 bg-background/25 p-4 text-sm text-muted-foreground">{copy}</p>
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          ) : null}
        </CardContent>
      </Card>

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
