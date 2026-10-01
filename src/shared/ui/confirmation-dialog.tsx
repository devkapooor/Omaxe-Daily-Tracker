import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Textarea } from '@/shared/ui/textarea'

type ConfirmationOptions = {
  confirmLabel?: string
  details?: string[]
  requireReason?: boolean
  title: string
  warning?: string
}

type ConfirmationResult = false | true | string

export function useConfirmationDialog() {
  const [options, setOptions] = useState<ConfirmationOptions | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const resolver = useRef<((result: ConfirmationResult) => void) | null>(null)

  function confirm(nextOptions: ConfirmationOptions) {
    resolver.current?.(false)
    setReason('')
    setError('')
    setOptions(nextOptions)
    return new Promise<ConfirmationResult>((resolve) => {
      resolver.current = resolve
    })
  }

  function finish(result: ConfirmationResult) {
    resolver.current?.(result)
    resolver.current = null
    setOptions(null)
  }

  const dialog = options && typeof document !== 'undefined'
    ? createPortal(
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/65 px-3 py-5 backdrop-blur-sm">
          <Card aria-modal="true" className="w-full max-w-lg" role="dialog">
            <CardHeader>
              <h2 className="text-lg font-black text-foreground">{options.title}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              {options.details?.length ? (
                <div className="space-y-1 rounded-xl border border-border/70 bg-secondary/35 p-3 text-sm">
                  {options.details.map((detail) => <p key={detail}>{detail}</p>)}
                </div>
              ) : null}
              {options.warning ? <p className="text-sm font-semibold text-amber-800">{options.warning}</p> : null}
              {options.requireReason ? (
                <FieldLabel label="Reason">
                  <Textarea value={reason} onChange={(event) => { setReason(event.target.value); setError('') }} />
                </FieldLabel>
              ) : null}
              {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => finish(false)}>Cancel</Button>
                <Button type="button" variant="destructive" onClick={() => {
                  const normalizedReason = reason.trim()
                  if (options.requireReason && normalizedReason.length < 5) {
                    setError('Please enter a reason of at least 5 characters.')
                    return
                  }
                  finish(options.requireReason ? normalizedReason : true)
                }}>
                  {options.confirmLabel ?? 'Confirm'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>,
        document.body,
      )
    : null

  return { confirm, dialog }
}
