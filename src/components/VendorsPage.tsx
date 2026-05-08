import { useMemo, useState } from 'react'
import type { VendorRecord } from '../domain/appTypes'
import { normalizeName, wordCount } from '../app/uiHelpers'

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
    <section className="vendors-layout">
      <form className="cashout-card vendor-form" onSubmit={handleSubmit}>
        <div className="card-title">
          <p className="eyebrow">Vendor Database</p>
          <h2>Add Vendor</h2>
        </div>

        <label>
          Vendor Name
          <input
            name="name"
            placeholder="Vendor name"
            required
            value={vendorName}
            onChange={(event) => {
              setVendorName(event.target.value)
              setError('')
            }}
          />
        </label>

        <label>
          Owner Name
          <input name="ownerName" placeholder="Owner name" required onChange={() => setError('')} />
        </label>

        <label>
          Contact
          <input name="contact" placeholder="Phone number or contact info" required onChange={() => setError('')} />
        </label>

        <label>
          Address
          <input name="address" placeholder="Vendor address" required onChange={() => setError('')} />
        </label>

        <label className="full-width">
          Companies Provided
          <input name="companiesProvided" placeholder="Example: ITC, HUL, Britannia" required onChange={() => setError('')} />
        </label>

        <label className="full-width">
          Notes / Comments
          <textarea
            name="notes"
            rows={3}
            placeholder="Short notes about payment terms, service quality, or stock rhythm"
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value)
              setError('')
            }}
          />
        </label>
        <div className={`word-limit ${wordCount(notes) > 40 ? 'over' : ''}`}>{wordCount(notes)}/40 words</div>
        {error && <p className="form-error light full-width">{error}</p>}
        <button className="primary full-width" disabled={isBusy}>
          {isBusy ? 'Saving...' : 'Save Vendor'}
        </button>
      </form>

      <section className="cashout-card vendor-directory">
        <div className="card-title list-title">
          <div>
            <p className="eyebrow">Directory</p>
            <h2>Saved Vendors</h2>
          </div>
          <label>
            Search
            <input placeholder="Name, owner, contact, company" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
        </div>

        <div className="vendor-list">
          {filteredVendors.length === 0 && <p className="empty-state">No vendors saved yet.</p>}
          {filteredVendors.map((vendor) => (
            <article className="vendor-item" key={vendor.id}>
              <div className="vendor-item-head">
                <strong>{vendor.name}</strong>
                <span>{vendor.ownerName}</span>
              </div>
              <div className="vendor-item-meta">
                <span>{vendor.contact}</span>
                <span>{vendor.address}</span>
                <span>{vendor.companiesProvided}</span>
                {vendor.notes && <span>{vendor.notes}</span>}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}
