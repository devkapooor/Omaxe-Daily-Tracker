import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

export type SelectOption = {
  disabled?: boolean
  keywords?: string[]
  label: string
  value: string
}

type SelectFieldProps = {
  className?: string
  disabled?: boolean
  emptyMessage?: string
  name?: string
  onValueChange?: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  required?: boolean
  searchable?: boolean
  value?: string
  defaultValue?: string
}

function findFirstEnabledIndex(options: SelectOption[]) {
  const firstEnabledIndex = options.findIndex((option) => !option.disabled)
  return Math.max(firstEnabledIndex, 0)
}

function filterOptions(options: SelectOption[], query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return options
  return options.filter((option) => {
    const haystack = [option.label, option.value, ...(option.keywords ?? [])].join(' ').toLowerCase()
    return haystack.includes(normalizedQuery)
  })
}

export function SelectField({
  className,
  disabled = false,
  emptyMessage = 'No matching options.',
  name,
  onValueChange,
  options,
  placeholder = 'Select an option',
  required = false,
  searchable = true,
  value,
  defaultValue,
}: SelectFieldProps) {
  const generatedId = useId()
  const triggerRef = useRef<HTMLButtonElement | HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [panelStyle, setPanelStyle] = useState<{ left: number; top: number; width: number }>({ left: 0, top: 0, width: 0 })
  const isControlled = value !== undefined
  const [uncontrolledValue, setUncontrolledValue] = useState(() => {
    if (defaultValue !== undefined) return defaultValue
    return options.find((option) => !option.disabled)?.value ?? ''
  })
  const selectedValue = isControlled ? value ?? '' : uncontrolledValue

  const filteredOptions = useMemo(() => filterOptions(options, query), [options, query])

  const selectedOption = useMemo(
    () => options.find((option) => option.value === selectedValue),
    [options, selectedValue],
  )

  useEffect(() => {
    if (!isOpen) return

    function updatePanelPosition() {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      setPanelStyle({
        left: rect.left,
        top: rect.bottom + 8,
        width: rect.width,
      })
    }

    updatePanelPosition()

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return
      }
      setIsOpen(false)
      setQuery('')
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      setQuery('')
      triggerRef.current?.focus()
    }

    window.addEventListener('resize', updatePanelPosition)
    window.addEventListener('scroll', updatePanelPosition, true)
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('resize', updatePanelPosition)
      window.removeEventListener('scroll', updatePanelPosition, true)
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    if (searchable) {
      searchRef.current?.focus()
      return
    }
    optionRefs.current[highlightedIndex]?.focus()
  }, [highlightedIndex, isOpen, searchable])

  useEffect(() => {
    if (!isOpen) return
    optionRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex, isOpen])

  function commitValue(nextValue: string) {
    if (!isControlled) {
      setUncontrolledValue(nextValue)
    }
    onValueChange?.(nextValue)
    setIsOpen(false)
    setQuery('')
    triggerRef.current?.focus()
  }

  function openDropdown(nextQuery = '') {
    if (disabled) return
    const nextFilteredOptions = filterOptions(options, nextQuery)
    const selectedIndex = nextFilteredOptions.findIndex((option) => option.value === selectedValue && !option.disabled)
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : findFirstEnabledIndex(nextFilteredOptions))
    setQuery(nextQuery)
    setIsOpen(true)
  }

  function moveHighlight(direction: 1 | -1) {
    if (filteredOptions.length === 0) return
    let nextIndex = highlightedIndex

    for (let attempt = 0; attempt < filteredOptions.length; attempt += 1) {
      nextIndex = (nextIndex + direction + filteredOptions.length) % filteredOptions.length
      if (!filteredOptions[nextIndex]?.disabled) {
        setHighlightedIndex(nextIndex)
        return
      }
    }
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLInputElement | HTMLButtonElement>) {
    if (disabled) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openDropdown()
      return
    }
    if (searchable && event.key === 'Escape') {
      event.preventDefault()
      setIsOpen(false)
      setQuery('')
    }
  }

  function handleListKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveHighlight(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveHighlight(-1)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const option = filteredOptions[highlightedIndex]
      if (option && !option.disabled) {
        commitValue(option.value)
      }
    }
  }

  const panel = isOpen
    ? createPortal(
        <div
          className="fixed z-[90] rounded-md border border-border bg-popover p-1.5 shadow-lg"
          ref={panelRef}
          style={{
            left: panelStyle.left,
            top: panelStyle.top,
            width: panelStyle.width,
          }}
        >
          <div
            aria-activedescendant={`${generatedId}-option-${highlightedIndex}`}
            className="max-h-64 overflow-y-auto"
            role="listbox"
            tabIndex={searchable ? -1 : 0}
            onKeyDown={handleListKeyDown}
          >
            {filteredOptions.length === 0 ? (
              <div className="px-2.5 py-2 text-[13px] font-medium text-muted-foreground">{emptyMessage}</div>
            ) : (
              filteredOptions.map((option, index) => {
                const isSelected = option.value === selectedValue
                const isHighlighted = index === highlightedIndex

                return (
                  <button
                    aria-selected={isSelected}
                    className={cn(
                      'mb-0.5 flex w-full items-center justify-between rounded-sm px-2.5 py-2 text-left text-[13px] font-medium text-foreground transition-colors last:mb-0',
                      option.disabled && 'cursor-not-allowed opacity-45',
                      !option.disabled && !isHighlighted && 'hover:bg-secondary/70',
                      isHighlighted && 'bg-secondary/80',
                      isSelected && 'border border-blue-200 bg-blue-50 text-blue-800 dark:border-info/30 dark:bg-info/10 dark:text-info',
                    )}
                    disabled={option.disabled}
                    id={`${generatedId}-option-${index}`}
                    key={option.value || `${option.label}-${index}`}
                    ref={(element) => {
                      optionRefs.current[index] = element
                    }}
                    role="option"
                    type="button"
                    onClick={() => commitValue(option.value)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <span>{option.label}</span>
                    {isSelected ? <Check className="h-4 w-4 text-cyan-700 dark:text-info" /> : null}
                  </button>
                )
              })
            )}
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <>
      {name ? <input name={name} type="hidden" value={selectedValue} /> : null}
      {searchable ? (
        <div className="relative">
          <input
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            className={cn(
              'flex h-9 w-full rounded-md border border-input bg-card px-3 py-2 pr-9 text-[13px] text-foreground shadow-sm transition-[border-color,box-shadow,background] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-muted/70 disabled:opacity-70',
              isOpen && 'border-ring ring-2 ring-ring/20',
              className,
            )}
            disabled={disabled}
            placeholder={placeholder}
            ref={triggerRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={isOpen ? query : selectedOption?.label ?? ''}
            onChange={(event) => {
              const nextQuery = event.target.value
              if (!isOpen) {
                openDropdown(nextQuery)
                return
              }
              const nextFilteredOptions = filterOptions(options, nextQuery)
              setQuery(nextQuery)
              setHighlightedIndex(findFirstEnabledIndex(nextFilteredOptions))
            }}
            onClick={() => {
              if (!isOpen) {
                openDropdown()
              }
            }}
            onFocus={() => {
              if (!isOpen) {
                openDropdown()
              }
            }}
            onKeyDown={handleTriggerKeyDown}
          />
          <button
            aria-label={isOpen ? 'Close options' : 'Open options'}
            className="absolute right-1.25 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-primary"
            disabled={disabled}
            type="button"
            onClick={() => {
              if (isOpen) {
                setIsOpen(false)
                setQuery('')
                triggerRef.current?.focus()
                return
              }
              openDropdown()
              triggerRef.current?.focus()
            }}
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180 text-primary')} />
          </button>
        </div>
      ) : (
        <button
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className={cn(
            'flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-left text-[13px] text-foreground shadow-sm outline-none transition-[border-color,box-shadow,background] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-muted/70 disabled:opacity-70',
            isOpen && 'border-ring ring-2 ring-ring/20',
            className,
          )}
          disabled={disabled}
          ref={triggerRef as React.RefObject<HTMLButtonElement>}
          type="button"
          onClick={() => {
            if (isOpen) {
              setIsOpen(false)
              setQuery('')
              return
            }
            openDropdown()
          }}
          onKeyDown={handleTriggerKeyDown}
        >
          <span className={cn('truncate', !selectedOption && 'text-muted-foreground/85')}>{selectedOption?.label ?? placeholder}</span>
          <ChevronDown className={cn('ml-3 h-4 w-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180 text-primary')} />
        </button>
      )}
      {required && name ? <input aria-hidden="true" className="sr-only" required tabIndex={-1} value={selectedValue} onChange={() => undefined} /> : null}
      {panel}
    </>
  )
}
