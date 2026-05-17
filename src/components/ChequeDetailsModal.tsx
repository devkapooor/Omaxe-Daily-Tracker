import { Button } from '@/components/ui/button'
import { FieldLabel } from '@/components/ui/field-label'
import { Input } from '@/components/ui/input'

type ChequeDetailsModalProps = {
  chequeNumber: string
  chequePayDate: string
  error?: string
  onChequeNumberChange: (value: string) => void
  onChequePayDateChange: (value: string) => void
  onClose: () => void
  onConfirm: () => void
}

export function ChequeDetailsModal({
  chequeNumber,
  chequePayDate,
  error,
  onChequeNumberChange,
  onChequePayDateChange,
  onClose,
  onConfirm,
}: ChequeDetailsModalProps) {
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/45 px-4 py-8">
      <div className="w-full max-w-md rounded-[24px] border border-border/80 bg-white p-5 shadow-[0_20px_60px_rgba(24,32,27,0.18)]">
        <div className="space-y-1">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">Cheque Details</p>
          <h3 className="text-xl font-black tracking-tight text-foreground">Enter cheque information</h3>
        </div>

        <div className="mt-5 grid gap-4">
          <FieldLabel label="Cheque Number">
            <Input
              placeholder="Enter cheque number"
              value={chequeNumber}
              onChange={(event) => onChequeNumberChange(event.target.value)}
            />
          </FieldLabel>

          <FieldLabel label="Pay Date">
            <Input
              type="date"
              value={chequePayDate}
              onChange={(event) => onChequePayDateChange(event.target.value)}
            />
          </FieldLabel>

          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
        </div>

        <div className="mt-5 flex gap-2">
          <Button type="button" className="flex-1" onClick={onConfirm}>
            Save Cheque Details
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
