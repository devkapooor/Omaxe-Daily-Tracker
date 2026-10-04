import { describe, expect, it } from 'vitest'
import { isCashoutWindowOpen } from './cashoutWindow'

const ist = (iso: string) => Date.parse(iso)

describe('cashout access window (Asia/Kolkata)', () => {
  it.each([
    ['2026-10-04T18:24:59.999Z', false], // 23:54 IST
    ['2026-10-04T18:25:00.000Z', true], // 23:55 IST
    ['2026-10-04T18:50:59.999Z', true], // 00:20 IST
    ['2026-10-04T18:51:00.000Z', false], // 00:21 IST
    ['2026-10-04T06:00:00.000Z', false], // 11:30 IST
  ])('%s -> %s', (time, expected) => {
    expect(isCashoutWindowOpen(ist(time))).toBe(expected)
  })
})
