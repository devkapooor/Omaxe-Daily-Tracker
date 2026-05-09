import { useMemo, useState } from 'react'
import type { VendorRecord } from '@/domain/appTypes'
import { normalizeName, wordCount } from '@/app/uiHelpers'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FieldLabel } from '@/components/ui/field-label'
import { Input } from '@/components/ui/input'
import { SectionHeading } from '@/components/ui/section-heading'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type VendorsPageProps = {
  vendors: VendorRecord[]
  isBusy: boolean
  onSaveVendor: (vendor: Omit<VendorRecord, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
}

export function VendorsPage({ vendors, isBusy, onSaveVendor }: VendorsPageProps) {
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [vendorName, setVendorName] = useState('')
  const [notes, setNotes] = useState('')
  const filteredVendors = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return vendors
    return vendors.filter(
      (vendor) =>
        vendor.name.toLowerCase().includes(query) ||
        vendor.ownerName.toLowerCase().includes(query) ||
        vendor.contact.toLowerCase().includes(query) ||
        vendor.companiesProvided.toLowerCase().includes(query),
    )
  }, [search, vendors])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = normalizeName(String(form.get('name') || ''))
    const ownerName = normalizeName(String(form.get('ownerName') || ''))
    const contact = String(form.get('contact') || '').trim()
    const address = String(form.get('address') || '').trim()
    const companiesProvided = String(form.get('companiesProvided') || '').trim()
    const trimmedNotes = notes.trim()

    if (!name) {
      setError('Vendor name is required.')
      return
    }
    if (!ownerName) {
      setError('Owner name is required.')
      return
    }
    if (!contact) {
      setError('Contact number is required.')
      return
    }
    if (!address) {
      setError('Address is required.')
      return
    }
    if (!companiesProvided) {
      setError('Companies provided is required.')
      return
    }
    if (wordCount(trimmedNotes) > 40) {
      setError('Notes cannot be more than 40 words.')
      return
    }

    await onSaveVendor({
      name,
      ownerName,
      contact,
      address,
      companiesProvided,
      notes: trimmedNotes,
    })
    setError('')
    setVendorName('')
    setNotes('')
    event.currentTarget.reset()
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
              <Input name="ownerName" placeholder="Owner name" required onChange={() => setError('')} />
            </FieldLabel>

            <FieldLabel label="Contact">
              <Input name="contact" placeholder="Phone number or contact info" required onChange={() => setError('')} />
            </FieldLabel>

            <FieldLabel label="Address">
              <Input name="address" placeholder="Vendor address" required onChange={() => setError('')} />
            </FieldLabel>

            <FieldLabel className="md:col-span-2" label="Companies Provided">
              <Input
                name="companiesProvided"
                placeholder="Example: ITC, HUL, Britannia"
                required
                onChange={() => setError('')}
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
                  <span className="text-sm font-medium text-muted-foreground">{vendor.ownerName}</span>
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
