import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { normalizeName } from '@/app/uiHelpers'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { SectionHeading } from '@/shared/ui/section-heading'

type DirectoryPageProps = {
  isBusy: boolean
  partyOptions: string[]
  savedPartyNames: string[]
  onAddParty: (name: string) => Promise<void>
  onRenameParty: (previousName: string, nextName: string) => Promise<void>
}

export function DirectoryPage({
  isBusy,
  partyOptions,
  savedPartyNames,
  onAddParty,
  onRenameParty,
}: DirectoryPageProps) {
  const [partySearch, setPartySearch] = useState('')
  const [partyName, setPartyName] = useState('')
  const [partyRename, setPartyRename] = useState('')
  const [directoryError, setDirectoryError] = useState('')
  const [selectedParty, setSelectedParty] = useState<string | null>(null)
  const savedPartyKeys = useMemo(
    () => new Set(savedPartyNames.map((party) => party.toLowerCase())),
    [savedPartyNames],
  )
  const filteredParties = useMemo(() => {
    const query = partySearch.trim().toLowerCase()
    if (!query) return partyOptions
    return partyOptions.filter((party) => party.toLowerCase().includes(query))
  }, [partyOptions, partySearch])
  const selectedPartyIsEditable = selectedParty ? savedPartyKeys.has(selectedParty.toLowerCase()) : false

  function openPartyDetails(party: string) {
    setSelectedParty(party)
    setPartyRename(party)
    setDirectoryError('')
  }

  function closePartyDetails() {
    setSelectedParty(null)
    setPartyRename('')
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

  async function handlePartyRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedParty || !selectedPartyIsEditable) return
    const normalized = normalizeName(partyRename)
    if (!normalized) {
      setDirectoryError('Party name is required.')
      return
    }
    try {
      await onRenameParty(selectedParty, normalized)
      setSelectedParty(normalized)
      setPartyRename(normalized)
      setDirectoryError('')
    } catch (cause) {
      setDirectoryError(cause instanceof Error ? cause.message : 'Unable to rename the party.')
    }
  }

  return (
    <section className="grid gap-2.5">
      {directoryError ? (
        <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-700">
          {directoryError}
        </div>
      ) : null}

      <div className="grid gap-2.5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Card className="xl:flex xl:min-h-0 xl:flex-col">
          <CardHeader className="pb-3">
            <SectionHeading eyebrow="Party directory" title="Add Expense / Loan Party" />
          </CardHeader>
          <CardContent>
            <form className="grid gap-3.5" onSubmit={handlePartySubmit}>
              <FieldLabel label="Party Name">
                <Input value={partyName} onChange={(event) => setPartyName(event.target.value)} placeholder="Enter party name" required />
              </FieldLabel>
              <Button disabled={isBusy}>{isBusy ? 'Saving...' : 'Save Party'}</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="xl:flex xl:min-h-0 xl:flex-col">
          <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeading eyebrow="Directory" title="Saved Parties" />
            <FieldLabel className="w-full sm:max-w-xs" label="Search">
              <Input placeholder="Search party" value={partySearch} onChange={(event) => setPartySearch(event.target.value)} />
            </FieldLabel>
          </CardHeader>
          <CardContent className="xl:min-h-0 xl:flex-1 xl:overflow-hidden">
            <div className="grid gap-2.5 sm:grid-cols-2 xl:min-h-0 xl:overflow-y-auto xl:pr-1 xl:grid-cols-3">
              {filteredParties.length === 0 ? <p className="text-sm font-medium text-muted-foreground">No parties found.</p> : null}
              {filteredParties.map((party) => (
                <button
                  key={party}
                  type="button"
                  className="rounded-[16px] border border-border/70 bg-secondary/55 px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/75"
                  onClick={() => openPartyDetails(party)}
                >
                  <strong className="block text-sm font-bold text-foreground">{party}</strong>
                  <span className="mt-1 block text-xs font-medium text-muted-foreground">
                    {savedPartyKeys.has(party.toLowerCase()) ? 'Saved party entry' : 'Reference from records or users'}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedParty ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/60 px-3 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="party-details-title">
          <Card className="max-h-[90vh] w-full max-w-[32rem] overflow-y-auto">
            <CardHeader className="gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-3" id="party-details-title">
                  <SectionHeading eyebrow="Party Directory" title={selectedParty} />
                  <p className="text-sm font-medium text-muted-foreground">
                    {selectedPartyIsEditable
                      ? 'This party was manually saved in the directory and can be renamed safely.'
                      : 'This name is shown for reference from existing records or users and is view-only here.'}
                  </p>
                </div>
                <button type="button" className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" onClick={closePartyDetails} aria-label="Close party details">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              <DetailBlock label="Party Name" value={selectedParty} />
              <DetailBlock label="Directory Status" value={selectedPartyIsEditable ? 'Saved party entry' : 'Read-only reference'} />
              {selectedPartyIsEditable ? (
                <form className="grid gap-3" onSubmit={handlePartyRename}>
                  <FieldLabel label="Rename Party">
                    <Input value={partyRename} onChange={(event) => { setPartyRename(event.target.value); setDirectoryError('') }} placeholder="Enter updated party name" required />
                  </FieldLabel>
                  <div className="flex justify-end gap-2">
                    <Button type="submit" disabled={isBusy}>{isBusy ? 'Saving...' : 'Save Party Name'}</Button>
                  </div>
                </form>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </section>
  )
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <span className="block text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  )
}
