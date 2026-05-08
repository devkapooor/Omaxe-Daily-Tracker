import { normalizeName } from '../app/uiHelpers'

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
    <div className="searchable-name-field">
      <input name={name} list={listId} placeholder={placeholder} required value={value} onChange={(event) => onValueChange(event.target.value)} />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      {canCreate && (
        <button
          type="button"
          className="ghost-light create-name-button"
          onClick={() => {
            onCreate(normalized)
            onValueChange(normalized)
          }}
        >
          Add "{normalized}"
        </button>
      )}
    </div>
  )
}
