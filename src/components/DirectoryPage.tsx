import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { UserRole } from '@/domain/financeTypes'
import type { VendorRecord } from '@/domain/appTypes'
import { money, normalizeName } from '@/app/uiHelpers'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FieldLabel } from '@/components/ui/field-label'
import { Input } from '@/components/ui/input'
import { SectionHeading } from '@/components/ui/section-heading'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

type DirectoryPageProps = {
  currentUserRole: UserRole
  isBusy: boolean
  partyOptions: string[]
  vendors: VendorRecord[]
  vendorOutstandingByName: Map<string, number>
  onAddParty: (name: string) => Promise<void>
  onSaveVendor: (vendor: Omit<VendorRecord, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
}

export function DirectoryPage({
  currentUserRole,
  isBusy,
  partyOptions,
  vendors,
  vendorOutstandingByName,
  onAddParty,
  onSaveVendor,
}: DirectoryPageProps) {
  const [vendorSearch, setVendorSearch] = useState('')
  const [partySearch, setPartySearch] = useState('')
  const [partyName, setPartyName] = useState('')
  const [directoryError, setDirectoryError] = useState('')
  const [vendorName, setVendorName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [contact, setContact] = useState('')
  const [address, setAddress] = useState('')
  const [companiesProvided, setCompaniesProvided] = useState('')
  const [notes, setNotes] = useState('')
  const [openingOutstanding, setOpeningOutstanding] = useState('')
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null)
  const [selectedVendor, setSelectedVendor] = useState<VendorRecord | null>(null)
  const canSeeOutstanding = currentUserRole === 'owner'

  const filteredVendors = useMemo(() => {
    const query = vendorSearch.trim().toLowerCase()
    if (!query) return vendors
    return vendors.filter(
      (vendor) =>
        vendor.name.toLowerCase().includes(query) ||
        vendor.ownerName.toLowerCase().includes(query) ||
        vendor.contact.toLowerCase().includes(query) ||
        vendor.address.toLowerCase().includes(query) ||
        vendor.companiesProvided.toLowerCase().includes(query) ||
        vendor.notes.toLowerCase().includes(query),
    )
  }, [vendorSearch, vendors])

  const filteredParties = useMemo(() => {
    const query = partySearch.trim().toLowerCase()
    if (!query) return partyOptions
    return partyOptions.filter((party) => party.toLowerCase().includes(query))
  }, [partyOptions, partySearch])

  function resetVendorForm() {
    setVendorName('')
    setOwnerName('')
    setContact('')
    setAddress('')
    setCompaniesProvided('')
    setNotes('')
    setOpeningOutstanding('')
    setEditingVendorId(null)
    setDirectoryError('')
  }

  function beginEditVendor(vendor: VendorRecord) {
    setEditingVendorId(vendor.id)
    setVendorName(vendor.name)
    setOwnerName(vendor.ownerName)
    setContact(vendor.contact)
    setAddress(vendor.address)
    setCompaniesProvided(vendor.companiesProvided)
    setNotes(vendor.notes)
    setOpeningOutstanding(String(vendor.openingOutstanding ?? 0))
    setDirectoryError('')
  }

  async function handlePartySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = normalizeName(partyName)
    if (!normalized) {
      setDirectoryError('Party name is required.')
      return
    }
    try {
      await onAddParty(normalized)
      setPartyName('')
      setDirectoryError('')
    } catch (cause) {
      setDirectoryError(cause instanceof Error ? cause.message : 'Unable to save the party.')
    }
  }

  async function handleVendorSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedVendorName = normalizeName(vendorName)
    const normalizedOwnerName = normalizeName(ownerName)
    const trimmedContact = contact.trim()
    const trimmedAddress = address.trim()
    const trimmedCompaniesProvided = companiesProvided.trim()
    const trimmedNotes = notes.trim()
    const existingVendor = editingVendorId ? vendors.find((vendor) => vendor.id === editingVendorId) : null
    const parsedOpeningOutstanding = canSeeOutstanding
      ? Number(openingOutstanding || '0')
      : existingVendor?.openingOutstanding ?? 0

    if (!normalizedVendorName) {
      setDirectoryError('Vendor name is required.')
      return
    }
    if (!normalizedOwnerName) {
      setDirectoryError('Owner name is required.')
      return
    }
    if (!trimmedContact) {
      setDirectoryError('Contact number is required.')
      return
    }
    if (!trimmedAddress) {
      setDirectoryError('Address is required.')
      return
    }
    if (!trimmedCompaniesProvided) {
      setDirectoryError('Companies provided is required.')
      return
    }
    if (!Number.isFinite(parsedOpeningOutstanding) || parsedOpeningOutstanding < 0) {
      setDirectoryError('Opening outstanding must be zero or more.')
      return
    }

    try {
      await onSaveVendor({
        name: normalizedVendorName,
        ownerName: normalizedOwnerName,
        contact: trimmedContact,
        address: trimmedAddress,
        companiesProvided: trimmedCompaniesProvided,
        notes: trimmedNotes,
        openingOutstanding: parsedOpeningOutstanding,
        openingOutstandingRemaining: parsedOpeningOutstanding,
      })
      resetVendorForm()
    } catch (cause) {
      setDirectoryError(cause instanceof Error ? cause.message : 'Unable to save the vendor.')
    }
  }

  return (
    <section className="grid gap-3">
      {directoryError ? (
        <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {directoryError}
        </div>
      ) : null}

      <Tabs defaultValue="vendors" className="grid gap-3">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="vendors">Vendor Directory</TabsTrigger>
          <TabsTrigger value="party">Party Directory</TabsTrigger>
        </TabsList>

        <TabsContent value="vendors">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] xl:items-stretch">
            <Card className="xl:flex xl:min-h-0 xl:flex-col xl:h-full">
              <CardHeader className="pb-3">
                <SectionHeading eyebrow="Directory" title={editingVendorId ? 'Edit Vendor' : 'Add Vendor'} />
              </CardHeader>
              <CardContent className="xl:flex-1 xl:overflow-y-auto">
                <form className="grid gap-4 md:grid-cols-2" onSubmit={handleVendorSubmit}>
                  <FieldLabel label="Vendor Name">
                    <Input value={vendorName} onChange={(event) => setVendorName(event.target.value)} placeholder="Vendor name" required />
                  </FieldLabel>

                  <FieldLabel label="Owner Name">
                    <Input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="Owner name" required />
                  </FieldLabel>

                  <FieldLabel label="Contact">
                    <Input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Contact number" required />
                  </FieldLabel>

                  <FieldLabel label="Address">
                    <Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Vendor address" required />
                  </FieldLabel>

                  <FieldLabel className="md:col-span-2" label="Companies Provided">
                    <Input value={companiesProvided} onChange={(event) => setCompaniesProvided(event.target.value)} placeholder="Example: ITC, HUL, Britannia" required />
                  </FieldLabel>

                  <FieldLabel className="md:col-span-2" label="Notes / Comments">
                    <Textarea
                      className="min-h-[64px]"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      rows={2}
                      placeholder="Payment terms, service quality, or stock rhythm"
                    />
                  </FieldLabel>

                  {canSeeOutstanding ? (
                    <FieldLabel label="Opening Outstanding">
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={openingOutstanding}
                        onChange={(event) => setOpeningOutstanding(event.target.value)}
                        placeholder="0"
                      />
                    </FieldLabel>
                  ) : null}

                  <div className="flex gap-2 md:col-span-2">
                    <Button className="flex-1" disabled={isBusy}>
                      {isBusy ? 'Saving...' : editingVendorId ? 'Update Vendor' : 'Save Vendor'}
                    </Button>
                    {editingVendorId ? (
                      <Button type="button" variant="outline" onClick={resetVendorForm}>
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="flex min-h-0 flex-col xl:h-full">
              <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
                <SectionHeading eyebrow="Directory" title="Saved Vendors" />
                <FieldLabel className="w-full sm:max-w-xs" label="Search">
                  <Input
                    placeholder="Name, owner, contact, address, company, notes"
                    value={vendorSearch}
                    onChange={(event) => setVendorSearch(event.target.value)}
                  />
                </FieldLabel>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 overflow-hidden">
                <div className="grid max-h-[26rem] gap-3 overflow-y-auto pr-1 sm:max-h-[30rem] xl:min-h-0 xl:max-h-[calc(100dvh-17rem)]">
                  {filteredVendors.length === 0 ? <p className="text-sm font-medium text-muted-foreground">No vendors found.</p> : null}
                  {filteredVendors.map((vendor) => (
                    <button
                      key={vendor.id}
                      type="button"
                      className="rounded-3xl border border-border/70 bg-secondary/55 p-4 text-left transition-colors hover:bg-secondary/75"
                      onClick={() => setSelectedVendor(vendor)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-base font-bold text-foreground">{vendor.name}</strong>
                        {canSeeOutstanding ? (
                          <span className="text-sm font-semibold text-foreground">
                            Outstanding {money(vendorOutstandingByName.get(vendor.name.toLowerCase()) ?? 0)}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="party">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <Card className="xl:flex xl:min-h-0 xl:flex-col">
              <CardHeader className="pb-3">
                <SectionHeading eyebrow="Directory" title="Add Party" />
              </CardHeader>
              <CardContent>
                <form className="grid gap-4" onSubmit={handlePartySubmit}>
                  <FieldLabel label="Party Name">
                    <Input
                      value={partyName}
                      onChange={(event) => setPartyName(event.target.value)}
                      placeholder="Enter party name"
                      required
                    />
                  </FieldLabel>
                  <Button disabled={isBusy}>{isBusy ? 'Saving...' : 'Save Party'}</Button>
                </form>
              </CardContent>
            </Card>

            <Card className="xl:flex xl:min-h-0 xl:flex-col">
              <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
                <SectionHeading eyebrow="Directory" title="Party Directory" />
                <FieldLabel className="w-full sm:max-w-xs" label="Search">
                  <Input placeholder="Search party" value={partySearch} onChange={(event) => setPartySearch(event.target.value)} />
                </FieldLabel>
              </CardHeader>
              <CardContent className="xl:min-h-0 xl:flex-1 xl:overflow-hidden">
                <div className="grid gap-3 sm:grid-cols-2 xl:min-h-0 xl:overflow-y-auto xl:pr-1 xl:grid-cols-3">
                  {filteredParties.length === 0 ? <p className="text-sm font-medium text-muted-foreground">No parties found.</p> : null}
                  {filteredParties.map((party) => (
                    <article key={party} className="rounded-2xl border border-border/70 bg-secondary/55 px-4 py-3">
                      <strong className="text-sm font-bold text-foreground">{party}</strong>
                    </article>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {selectedVendor ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/40 px-3 py-6 backdrop-blur-sm">
          <Card className="max-h-[90vh] w-full max-w-[38rem] overflow-y-auto">
            <CardHeader className="gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-3">
                  <SectionHeading eyebrow="Vendor Directory" title={selectedVendor.name} />
                  {canSeeOutstanding ? (
                    <p className="text-sm font-medium text-muted-foreground">
                      Outstanding {money(vendorOutstandingByName.get(selectedVendor.name.toLowerCase()) ?? 0)} | Opening {money(selectedVendor.openingOutstandingRemaining ?? 0)}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  onClick={() => setSelectedVendor(null)}
                  aria-label="Close vendor details"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                Review the full saved vendor profile and open edit mode if something needs to change.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3.5 md:grid-cols-2">
              <DetailBlock label="Vendor Name" value={selectedVendor.name} />
              <DetailBlock label="Owner" value={selectedVendor.ownerName} />
              <DetailBlock label="Contact" value={selectedVendor.contact} />
              <DetailBlock label="Address" value={selectedVendor.address} />
              <DetailBlock className="md:col-span-2" label="Companies Provided" value={selectedVendor.companiesProvided} />
              {selectedVendor.notes ? <DetailBlock className="md:col-span-2" label="Notes" value={selectedVendor.notes} /> : null}
              {canSeeOutstanding ? (
                <DetailBlock
                  className="md:col-span-2"
                  label="Outstanding"
                  value={`Total ${money(vendorOutstandingByName.get(selectedVendor.name.toLowerCase()) ?? 0)} | Opening ${money(selectedVendor.openingOutstandingRemaining ?? 0)}`}
                />
              ) : null}
              <div className="md:col-span-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    beginEditVendor(selectedVendor)
                    setSelectedVendor(null)
                  }}
                >
                  Edit Vendor
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </section>
  )
}

function DetailBlock({
  className,
  label,
  value,
}: {
  className?: string
  label: string
  value: string
}) {
  return (
    <div className={className ? `space-y-1 ${className}` : 'space-y-1'}>
      <span className="block text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">{value}</pre>
    </div>
  )
}
