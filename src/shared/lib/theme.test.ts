import { describe, expect, it } from 'vitest'
import { resolveTheme } from '@/shared/lib/theme'

describe('resolveTheme', () => {
  it('uses a saved device preference before the system preference', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('follows the system preference when no valid choice is saved', () => {
    expect(resolveTheme(null, true)).toBe('dark')
    expect(resolveTheme(null, false)).toBe('light')
    expect(resolveTheme('unsupported', true)).toBe('dark')
  })
})
