import { useMemo, useState } from 'react'
import type { VendorRecord } from '@/domain/appTypes'
import { money, normalizeName, wordCount } from '@/app/uiHelpers'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FieldLabel } from '@/components/ui/field-label'
import { Input } from '@/components/ui/input'
import { SectionHeading } from '@/components/ui/section-heading'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type VendorsPageProps = {
  vendors: VendorRecord[]
  vendorOutstandingByName: Map<string, number>
  isBusy: boolean
  onSaveVendor: (vendor: Omit<VendorRecord, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
}

export function VendorsPage({ vendors, vendorOutstandingByName, isBusy, onSaveVendor }: VendorsPageProps) {
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [vendorName, setVendorName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [contact, setContact] = useState('')
  const [address, setAddress] = useState('')
  const [companiesProvided, setCompaniesProvided] = useState('')
  const [notes, setNotes] = useState('')
  const filteredVendors = useMemo(() => {
    const query = search.trim().toLowerCase()
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
  }, [search, vendors])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = normalizeName(vendorName)
    const normalizedOwnerName = normalizeName(ownerName)
    const trimmedContact = contact.trim()
    const trimmedAddress = address.trim()
    const trimmedCompaniesProvided = companiesProvided.trim()
    const trimmedNotes = notes.trim()

    if (!name) {
      setError('Vendor name is required.')
      return
    }
    if (!normalizedOwnerName) {
      setError('Owner name is required.')
      return
    }
    if (!trimmedContact) {
      setError('Contact number is required.')
      return
    }
    if (!trimmedAddress) {
      setError('Address is required.')
      return
    }
    if (!trimmedCompaniesProvided) {
      setError('Companies provided is required.')
      return
    }
    if (wordCount(trimmedNotes) > 40) {
      setError('Notes cannot be more than 40 words.')
      return
    }

    await onSaveVendor({
      name,
      ownerName: normalizedOwnerName,
      contact: trimmedContact,
      address: trimmedAddress,
      companiesProvided: trimmedCompaniesProvided,
      notes: trimmedNotes,
    })
    setError('')
    setVendorName('')
    setOwnerName('')
    setContact('')
    setAddress('')
    setCompaniesProvided('')
    setNotes('')
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <Card>
        <CardHeader>
          <SectionHeading eyebrow="Vendor Database" title="Add Vendor" />
        </CardHeader>
        <CardContent>
          <form className="grid gap-5 md:grid-cols-2" onSubmit={handleSubmit}>
            <FieldLabel label="Vendor Name">
              <Input
                name="name"
                placeholder="Vendor name"
                required
                value={vendorName}
                onChange={(event) => {
                  setVendorName(event.target.value)
                  setError('')
                }}
              />
            </FieldLabel>

            <FieldLabel label="Owner Name">
              <Input
                name="ownerName"
                placeholder="Owner name"
                required
                value={ownerName}
                onChange={(event) => {
                  setOwnerName(event.target.value)
                  setError('')
                }}
              />
            </FieldLabel>

            <FieldLabel label="Contact">
              <Input
                name="contact"
                placeholder="Phone number or contact info"
                required
                value={contact}
                onChange={(event) => {
                  setContact(event.target.value)
                  setError('')
                }}
              />
            </FieldLabel>

            <FieldLabel label="Address">
              <Input
                name="address"
                placeholder="Vendor address"
                required
                value={address}
                onChange={(event) => {
                  setAddress(event.target.value)
                  setError('')
                }}
              />
            </FieldLabel>

            <FieldLabel className="md:col-span-2" label="Companies Provided">
              <Input
                name="companiesProvided"
                placeholder="Example: ITC, HUL, Britannia"
                required
                value={companiesProvided}
                onChange={(event) => {
                  setCompaniesProvided(event.target.value)
                  setError('')
                }}
              />
            </FieldLabel>

            <FieldLabel className="md:col-span-2" label="Notes / Comments">
              <Textarea
                name="notes"
                rows={3}
                placeholder="Short notes about payment terms, service quality, or stock rhythm"
                value={notes}
                onChange={(event) => {
                  setNotes(event.target.value)
                  setError('')
                }}
              />
            </FieldLabel>

            <div className={cn('text-right text-xs font-bold text-muted-foreground md:col-span-2', wordCount(notes) > 40 && 'text-destructive')}>
              {wordCount(notes)}/40 words
            </div>
            {error && <p className="text-sm font-semibold text-destructive md:col-span-2">{error}</p>}
            <Button className="md:col-span-2" disabled={isBusy}>
              {isBusy ? 'Saving...' : 'Save Vendor'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading eyebrow="Directory" title="Saved Vendors" />
          <FieldLabel className="w-full sm:max-w-xs" label="Search">
            <Input placeholder="Name, owner, contact, company" value={search} onChange={(event) => setSearch(event.target.value)} />
          </FieldLabel>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {filteredVendors.length === 0 && <p className="text-sm font-medium text-muted-foreground">No vendors saved yet.</p>}
            {filteredVendors.map((vendor) => (
              <article key={vendor.id} className="rounded-3xl border border-border/70 bg-secondary/55 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <strong className="text-base font-bold text-foreground">{vendor.name}</strong>
                  <div className="flex flex-col items-start gap-1 text-sm sm:items-end">
                    <span className="font-medium text-muted-foreground">{vendor.ownerName}</span>
                    <span className="font-semibold text-foreground">
                      Outstanding {money(vendorOutstandingByName.get(vendor.name.toLowerCase()) ?? 0)}
                    </span>
                  </div>
                </div>
                <div className="mt-3 grid gap-1.5 text-sm text-muted-foreground">
                  <span>{vendor.contact}</span>
                  <span>{vendor.address}</span>
                  <span>{vendor.companiesProvided}</span>
                  {vendor.notes && <span>{vendor.notes}</span>}
                </div>
              </article>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
