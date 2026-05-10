import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type SearchableSelectProps = {
  emptyMessage?: string
  options: string[]
  placeholder: string
  value: string
  onValueChange: (value: string) => void
}

export function SearchableSelect({
  emptyMessage = 'No matching options.',
  options,
  placeholder,
  value,
  onValueChange,
}: SearchableSelectProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState(value)

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
        setQuery(value)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [value])

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return options
    return options.filter((option) => option.toLowerCase().includes(normalizedQuery))
  }, [options, query])

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Input
          placeholder={placeholder}
          value={isOpen ? query : value}
          onChange={(event) => {
            setQuery(event.target.value)
            setIsOpen(true)
          }}
          onFocus={() => {
            setQuery(value)
            setIsOpen(true)
          }}
        />
        <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>

      {isOpen && (
        <div className="absolute z-40 mt-2 max-h-60 w-full overflow-y-auto rounded-2xl border border-border/80 bg-white/96 p-1.5 shadow-[0_20px_45px_rgba(15,23,42,0.14)] backdrop-blur-xl">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-sm font-medium text-muted-foreground">{emptyMessage}</div>
          ) : (
            filteredOptions.map((option) => {
              const isSelected = option === value
              return (
                <button
                  key={option}
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-secondary/70',
                    isSelected && 'bg-secondary text-foreground',
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    onValueChange(option)
                    setQuery(option)
                    setIsOpen(false)
                  }}
                >
                  <span>{option}</span>
                  {isSelected ? <Check className="h-4 w-4 text-emerald-600" /> : null}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
