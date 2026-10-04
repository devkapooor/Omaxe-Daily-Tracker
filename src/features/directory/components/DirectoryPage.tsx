import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { money, normalizeName } from '@/app/uiHelpers'
import type { LoanEntry } from '@/domain/appTypes'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { PageCardStack } from '@/shared/ui/page-card-stack'
import { PageHeader, PageHeaderTab, PageHeaderTabsList } from '@/shared/ui/page-header'
import { PageLayout } from '@/shared/ui/page-layout'
import { SectionHeading } from '@/shared/ui/section-heading'
import { Tabs, TabsContent } from '@/shared/ui/tabs'

type DirectoryPageProps = {
  isBusy: boolean
  partyOptions: string[]
  savedPartyNames: string[]
  loans: LoanEntry[]
  onAddParty: (name: string) => Promise<void>
  onRenameParty: (previousName: string, nextName: string) => Promise<void>
}

export function DirectoryPage({
  isBusy,
  partyOptions,
  savedPartyNames,
  loans,
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
  const loanTotalsByParty = useMemo(() => {
    const totals = new Map<string, { name: string; loanCount: number; principal: number; repaid: number; outstanding: number }>()
    for (const loan of loans) {
      const key = loan.personName.trim().toLowerCase()
      const current = totals.get(key) ?? { name: loan.personName.trim(), loanCount: 0, principal: 0, repaid: 0, outstanding: 0 }
      current.loanCount += 1
      current.principal += loan.amount
      current.repaid += loan.paidAmount
      current.outstanding += loan.remainingAmount
      totals.set(key, current)
    }
    return [...totals.values()].sort((left, right) => right.outstanding - left.outstanding || left.name.localeCompare(right.name))
  }, [loans])
  const allLoanTotals = useMemo(
    () => loanTotalsByParty.reduce((total, party) => ({
      principal: total.principal + party.principal,
      repaid: total.repaid + party.repaid,
      outstanding: total.outstanding + party.outstanding,
    }), { principal: 0, repaid: 0, outstanding: 0 }),
    [loanTotalsByParty],
  )

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
    <Tabs defaultValue="parties" className="min-h-0 flex-1">
      <PageLayout
        header={(
          <PageHeader
            title="Party Directory"
            tools={(
              <PageHeaderTabsList aria-label="Party directory sections" className="grid w-full grid-cols-3 sm:w-auto">
                <PageHeaderTab value="add">Add Party</PageHeaderTab>
                <PageHeaderTab value="parties">View Parties</PageHeaderTab>
                <PageHeaderTab value="loans">Loans</PageHeaderTab>
              </PageHeaderTabsList>
            )}
          />
        )}
      >
      {directoryError ? (
        <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-700">
          {directoryError}
        </div>
      ) : null}

      <TabsContent value="add" className="m-0">
        <Card className="max-w-2xl">
          <CardHeader className="pb-3">
            <SectionHeading eyebrow="Party directory" title="Add Party" />
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
      </TabsContent>

      <TabsContent value="parties" className="m-0">
        <PageCardStack>
          <Card>
            <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
              <SectionHeading eyebrow="Directory" title="Saved Parties" />
              <FieldLabel className="w-full sm:max-w-xs" label="Search">
                <Input placeholder="Search party" value={partySearch} onChange={(event) => setPartySearch(event.target.value)} />
              </FieldLabel>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
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
        </PageCardStack>
      </TabsContent>

      <TabsContent value="loans" className="m-0">
        <PageCardStack>
          <Card>
            <CardHeader>
              <SectionHeading eyebrow="Read-only" title="Existing Loan Totals" description="Totals are grouped from existing loan records. This view does not change loan data." />
            </CardHeader>
            <CardContent className="grid gap-card-gap">
              <div className="grid gap-card-gap sm:grid-cols-3">
                <LoanTotal label="Principal issued" value={allLoanTotals.principal} />
                <LoanTotal label="Repaid" value={allLoanTotals.repaid} />
                <LoanTotal label="Outstanding" value={allLoanTotals.outstanding} />
              </div>
              {loanTotalsByParty.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">No loan records are available.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="border-b border-border text-xs text-muted-foreground">
                      <tr><th className="px-2 py-2 font-semibold">Party</th><th className="px-2 py-2 text-right font-semibold">Loans</th><th className="px-2 py-2 text-right font-semibold">Principal</th><th className="px-2 py-2 text-right font-semibold">Repaid</th><th className="px-2 py-2 text-right font-semibold">Outstanding</th></tr>
                    </thead>
                    <tbody>
                      {loanTotalsByParty.map((party) => (
                        <tr key={party.name.toLowerCase()} className="border-b border-border/70 last:border-0">
                          <th className="px-2 py-2.5 font-medium text-foreground">{party.name}</th>
                          <td className="px-2 py-2.5 text-right tabular-nums">{party.loanCount}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{money(party.principal)}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{money(party.repaid)}</td>
                          <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{money(party.outstanding)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </PageCardStack>
      </TabsContent>

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
      </PageLayout>
    </Tabs>
  )
}

function LoanTotal({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-muted/50 px-3 py-2.5">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-base font-semibold tabular-nums text-foreground">{money(value)}</strong>
    </div>
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
