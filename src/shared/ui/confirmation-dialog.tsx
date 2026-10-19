import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'

type ConfirmationOptions = {
  confirmLabel?: string
  confirmationText?: 'CONFIRM'
  details?: string[]
  requireReason?: boolean
  title: string
  warning?: string
}

type ConfirmationResult = false | true | string

export function useConfirmationDialog() {
  const [options, setOptions] = useState<ConfirmationOptions | null>(null)
  const [reason, setReason] = useState('')
  const [confirmationText,setConfirmationText]=useState('')
  const dialogRef=useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const resolver = useRef<((result: ConfirmationResult) => void) | null>(null)

  function confirm(nextOptions: ConfirmationOptions) {
    resolver.current?.(false)
    setReason('')
    setConfirmationText('')
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

  useEffect(()=>{if(!options)return;const previous=document.activeElement as HTMLElement|null;const handle=(event:KeyboardEvent)=>{if(event.key==='Escape'){resolver.current?.(false);resolver.current=null;setOptions(null)}if(event.key==='Tab'){const nodes=dialogRef.current?.querySelectorAll<HTMLElement>('input,textarea,button:not([disabled])');if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}};document.addEventListener('keydown',handle);dialogRef.current?.querySelector<HTMLElement>('input,textarea,button')?.focus();return()=>{document.removeEventListener('keydown',handle);previous?.focus()}},[options])

  const dialog = options && typeof document !== 'undefined'
    ? createPortal(
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/40 px-3 py-5">
          <Card ref={dialogRef} aria-label={options.title} aria-modal="true" className="w-full max-w-lg" role="dialog">
            <CardHeader>
              <h2 className="text-lg font-black text-foreground">{options.title}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              {options.details?.length ? (
                  <div className="space-y-1 rounded-md border border-border bg-muted p-3 text-sm">
                  {options.details.map((detail) => <p key={detail}>{detail}</p>)}
                </div>
              ) : null}
              {options.warning ? <p className="text-sm font-semibold text-amber-800">{options.warning}</p> : null}
              {options.requireReason ? (
                <FieldLabel label="Reason">
                  <Textarea value={reason} onChange={(event) => { setReason(event.target.value); setError('') }} />
                </FieldLabel>
              ) : null}
              {options.confirmationText?<FieldLabel label="Type CONFIRM to proceed"><Input autoFocus value={confirmationText} onChange={event=>{setConfirmationText(event.target.value);setError('')}} autoComplete="off" /></FieldLabel>:null}
              {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => finish(false)}>Cancel</Button>
                <Button type="button" disabled={!!options.confirmationText&&confirmationText!==options.confirmationText} variant="destructive" onClick={() => {
                  if(options.confirmationText&&confirmationText!==options.confirmationText)return
                  const normalizedReason = reason.trim()
                  if (options.requireReason && normalizedReason.length < 5) {
                    setError('Please enter a reason of at least 5 characters.')
                    return
                  }
                  finish(options.requireReason ? normalizedReason : true)
                }}>
                  {options.confirmLabel ?? (options.confirmationText?'OK':'Confirm')}
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
