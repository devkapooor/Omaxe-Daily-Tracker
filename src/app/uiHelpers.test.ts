import { describe, expect, it } from 'vitest'
import { resolveActivePage } from './uiHelpers'
import { buildMenu } from '@/features/navigation/config/menuConfig'

describe('owner-only route resolution', () => {
  it('allows the owner to open the Action Centre', () => {
    expect(resolveActivePage('owner', 'actions')).toBe('actions')
    expect(resolveActivePage('owner', 'vendor-preview')).toBe('vendor-preview')
  })

  it('redirects non-owners away from owner pages while allowing the Vendor Workspace', () => {
    expect(resolveActivePage('manager', 'actions')).toBe('expense')
    expect(resolveActivePage('manager', 'vendor-preview')).toBe('vendor-preview')
    expect(resolveActivePage('billing', 'actions')).toBe('expense')
    expect(resolveActivePage('billing', 'vendor-preview')).toBe('vendor-preview')
    expect(resolveActivePage('manager', 'payroll')).toBe('payroll')
    expect(resolveActivePage('billing', 'payroll')).toBe('payroll')
  })

  it('adds the Action Centre navigation item only for the owner', () => {
    const pagesFor = (role: 'owner' | 'manager' | 'billing') => buildMenu({ id: role, name: role, role }).map((item) => item.page)
    expect(pagesFor('owner')).toContain('actions')
    expect(pagesFor('manager')).not.toContain('actions')
    expect(pagesFor('billing')).not.toContain('actions')
    expect(pagesFor('manager')).toContain('vendor-preview')
    expect(pagesFor('billing')).toContain('vendor-preview')
    expect(pagesFor('owner')).toContain('payroll')
    expect(pagesFor('manager')).toContain('payroll')
    expect(pagesFor('billing')).toContain('payroll')
    expect(pagesFor('owner')).not.toContain('planner')
    expect(pagesFor('manager')).not.toContain('planner')
    expect(pagesFor('billing')).not.toContain('planner')
    expect(pagesFor('owner')).toContain('pos-test')
    expect(pagesFor('manager')).toContain('pos-test')
    expect(pagesFor('billing')).toContain('pos-test')
  })
})
