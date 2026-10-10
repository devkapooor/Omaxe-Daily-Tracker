const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { pendingCashForUser } = require('./cashBalance')

describe('pending cash by staff member', () => {
  it('subtracts outgoing movements and adds incoming person transfers', () => {
    const users = [
      { id: 'pawan', data: { name: 'Pawan' } },
      { id: 'farhan', data: { name: 'Farhan' } },
    ]
    const cashouts = [{ id: 'close-pawan', data: { recordedByUserId: 'pawan', drawerTotal: 50000 } }]
    const transfers = [
      { id: 'out-1', data: { fromUserId: 'pawan', toType: 'person', toUserId: 'farhan', amount: 21500 } },
      { id: 'out-2', data: { fromUserId: 'pawan', toType: 'person', toUserId: 'farhan', amount: 21500 } },
      { id: 'back', data: { fromUserId: 'farhan', toType: 'person', toUserId: 'pawan', amount: 21500 } },
    ]

    assert.equal(pendingCashForUser('pawan', users, cashouts, transfers), 28500)
    assert.equal(pendingCashForUser('farhan', users, cashouts, transfers), 21500)
  })

  it('maps an unlinked historical cashout only when the active name is unique', () => {
    const users = [
      { id: 'farhan', data: { name: 'Farhan' } },
      { id: 'farhan-2', data: { name: 'Farhan' } },
    ]
    const cashouts = [{ id: 'legacy', data: { recordedBy: '  Farhan ', remainingBalance: 1200 } }]
    assert.equal(pendingCashForUser('farhan', users, cashouts, []), 0)
    assert.equal(pendingCashForUser('farhan-2', users, cashouts, []), 0)
  })
})
