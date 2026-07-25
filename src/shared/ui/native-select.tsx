import * as React from 'react'
import { SelectField, type SelectOption } from '@/shared/ui/select-field'

type NativeSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>

function parseOptions(children: React.ReactNode): SelectOption[] {
  return React.Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement(child)) return []
    const optionElement = child as React.ReactElement<{ children?: React.ReactNode; disabled?: boolean; value?: string }>
    const value = String(optionElement.props.value ?? optionElement.props.children ?? '')
    const label = typeof optionElement.props.children === 'string' ? optionElement.props.children : value
    return [
      {
        disabled: Boolean(optionElement.props.disabled),
        label,
        value,
      },
    ]
  })
}

function NativeSelect({ children, className, defaultValue, disabled, name, onChange, required, value }: NativeSelectProps) {
  const options = React.useMemo(() => parseOptions(children), [children])

  return (
    <SelectField
      className={className}
      defaultValue={typeof defaultValue === 'string' ? defaultValue : undefined}
      disabled={disabled}
      name={name}
      options={options}
      required={required}
      searchable
      value={typeof value === 'string' ? value : undefined}
      onValueChange={(nextValue) => {
        onChange?.({ target: { value: nextValue } } as React.ChangeEvent<HTMLSelectElement>)
      }}
    />
  )
}

export { NativeSelect }

