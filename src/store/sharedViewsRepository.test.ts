import { describe, expect, it } from 'vitest'
import { staffViewsAreCurrent } from './sharedViewsRepository'

describe('staff shared-view publication readiness', () => {
  const settings = { sharedSettingsRevision: 4 }
  const metrics = { updatedAt: '2026-10-19T10:00:00.000Z' }
  const staffSettings = { schemaVersion: 1, sourceRevision: 4 }
  const staffMetrics = { schemaVersion: 1, updatedAt: metrics.updatedAt }

  it('accepts both current, matching projections', () => {
    expect(staffViewsAreCurrent(settings, metrics, staffSettings, staffMetrics)).toBe(true)
  })

  it('requires repair when either projection is missing or has a stale schema/revision', () => {
    expect(staffViewsAreCurrent(settings, metrics, undefined, staffMetrics)).toBe(false)
    expect(staffViewsAreCurrent(settings, metrics, staffSettings, undefined)).toBe(false)
    expect(staffViewsAreCurrent(settings, metrics, { ...staffSettings, schemaVersion: 0 }, staffMetrics)).toBe(false)
    expect(staffViewsAreCurrent(settings, metrics, { ...staffSettings, sourceRevision: 3 }, staffMetrics)).toBe(false)
    expect(staffViewsAreCurrent(settings, metrics, staffSettings, { ...staffMetrics, updatedAt: 'stale' })).toBe(false)
  })

  it('treats a missing settings revision as the initial revision only', () => {
    expect(staffViewsAreCurrent({}, metrics, { schemaVersion: 1, sourceRevision: 0 }, staffMetrics)).toBe(true)
    expect(staffViewsAreCurrent({}, metrics, staffSettings, staffMetrics)).toBe(false)
  })
})
