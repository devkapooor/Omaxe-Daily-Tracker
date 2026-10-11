import { describe, expect, it } from 'vitest'
import { createPosDraft } from './usePosDraftState'
describe('in-memory billing draft', () => {
  it('preserves state through remounts and notifies a new subscriber after an older operation completes', () => {
    const draft = createPosDraft('billing'); draft.initialize('cart', ['item'])
    const observed: unknown[] = []; const stop = draft.subscribe(() => observed.push(draft.get('cart')))
    stop()
    draft.initialize('cart', [])
    expect(draft.get('cart')).toEqual(['item'])
    const stopNew = draft.subscribe(() => observed.push(draft.get('cart')))
    draft.set<string[]>('cart', [])
    expect(observed).toEqual([[]]); stopNew()
  })
  it('keeps separate authenticated sessions isolated', () => {
    const first = createPosDraft('first'); const second = createPosDraft('second')
    first.initialize('customer', 'Private customer'); second.initialize('customer', '')
    expect(second.get('customer')).toBe('')
  })
})
