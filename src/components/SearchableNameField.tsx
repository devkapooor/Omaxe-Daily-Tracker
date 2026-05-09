import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { normalizeName } from '@/app/uiHelpers'

type SearchableNameFieldProps = {
  name: string
  options: string[]
  placeholder: string
  value: string
  onCreate: (name: string) => boolean
  onValueChange: (value: string) => void
}

export function SearchableNameField({
  name,
  options,
  placeholder,
  value,
  onCreate,
  onValueChange,
}: SearchableNameFieldProps) {
  const listId = `${name}-suggestions`
  const normalized = normalizeName(value)
  const exists = options.some((item) => item.toLowerCase() === normalized.toLowerCase())
  const canCreate = normalized.length > 0 && !exists

  return (
    <div className="grid gap-2">
      <Input
        name={name}
        list={listId}
        placeholder={placeholder}
        required
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      {canCreate && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start rounded-xl"
          onClick={() => {
            onCreate(normalized)
            onValueChange(normalized)
          }}
        >
          Add "{normalized}"
        </Button>
      )}
    </div>
  )
}
