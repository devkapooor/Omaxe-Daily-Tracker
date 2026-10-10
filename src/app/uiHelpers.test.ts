import { describe, expect, it } from 'vitest'
import { defaultSignInPage, resolveActivePage } from './uiHelpers'
import { buildMenu } from '@/features/navigation/config/menuConfig'

describe('owner-only route resolution', () => {
  it('opens POS by default for staff and managers on sign-in while preserving the owner preference', () => {
    expect(defaultSignInPage('manager', 'vendor-preview')).toBe('pos-test')
    expect(defaultSignInPage('billing', 'movement')).toBe('pos-test')
    expect(defaultSignInPage('owner', 'actions')).toBe('actions')
  })

  it('allows the owner to open the Action Centre', () => {
    expect(resolveActivePage('owner', 'actions')).toBe('actions')
    expect(resolveActivePage('owner', 'vendor-preview')).toBe('vendor-preview')
  })

  it('redirects non-owners away from owner pages while allowing the Vendor Workspace', () => {
    expect(resolveActivePage('manager', 'actions')).toBe('expense')
    expect(resolveActivePage('manager', 'vendor-preview')).toBe('vendor-preview')
    expect(resolveActivePage('billing', 'actions')).toBe('expense')
    expect(resolveActivePage('billing', 'vendor-preview')).toBe('vendor-preview')
  })

  it('adds the Action Centre navigation item only for the owner', () => {
    const pagesFor = (role: 'owner' | 'manager' | 'billing') => buildMenu({ id: role, name: role, role }).map((item) => item.page)
    expect(pagesFor('owner')).toContain('actions')
    expect(pagesFor('manager')).not.toContain('actions')
    expect(pagesFor('billing')).not.toContain('actions')
    expect(pagesFor('manager')).toContain('vendor-preview')
    expect(pagesFor('billing')).toContain('vendor-preview')
    expect(pagesFor('owner')).not.toContain('payroll')
    expect(pagesFor('manager')).not.toContain('payroll')
    expect(pagesFor('billing')).not.toContain('payroll')
    expect(pagesFor('owner')).not.toContain('planner')
    expect(pagesFor('manager')).not.toContain('planner')
    expect(pagesFor('billing')).not.toContain('planner')
    expect(pagesFor('owner')).toContain('pos-test')
    expect(pagesFor('manager')).toContain('pos-test')
    expect(pagesFor('billing')).toContain('pos-test')
  })
})
