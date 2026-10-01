import { describe, expect, it } from 'vitest'
import { resolveActivePage } from './uiHelpers'
import { buildMenu } from '@/features/navigation/config/menuConfig'

describe('owner-only route resolution', () => {
  it('allows the owner to open the Action Centre', () => {
    expect(resolveActivePage('owner', 'actions')).toBe('actions')
  })

  it('redirects manager and billing users away from the Action Centre', () => {
    expect(resolveActivePage('manager', 'actions')).toBe('expense')
    expect(resolveActivePage('billing', 'actions')).toBe('expense')
  })

  it('adds the Action Centre navigation item only for the owner', () => {
    const pagesFor = (role: 'owner' | 'manager' | 'billing') => buildMenu({ id: role, name: role, role }).map((item) => item.page)
    expect(pagesFor('owner')).toContain('actions')
    expect(pagesFor('manager')).not.toContain('actions')
    expect(pagesFor('billing')).not.toContain('actions')
  })
})
