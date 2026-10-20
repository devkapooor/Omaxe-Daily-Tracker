import { describe, expect, it } from 'vitest'
import { code39Svg } from './internalBarcode'

describe('internal stock barcode labels', () => {
  it('renders a valid Code 39 symbol for an allocated internal code', () => {
    const svg = code39Svg('AH0123456789ABCDEF')
    expect(svg).toContain('aria-label="Barcode AH0123456789ABCDEF"')
    expect((svg.match(/<rect x=/g) ?? []).length).toBe(20 * 5)
  })

  it('rejects values outside the server-issued internal barcode format', () => {
    expect(() => code39Svg('8901234567890')).toThrow('Invalid internal barcode')
  })
})
