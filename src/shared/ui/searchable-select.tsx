import { useMemo } from 'react'
import { SelectField } from '@/shared/ui/select-field'

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
  const normalizedOptions = useMemo(
    () => options.map((option) => ({ label: option, value: option, keywords: [option] })),
    [options],
  )

  return (
    <SelectField
      emptyMessage={emptyMessage}
      options={normalizedOptions}
      placeholder={placeholder}
      searchable
      value={value}
      onValueChange={onValueChange}
    />
  )
}

