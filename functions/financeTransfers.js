const p = require('./financeOperations');
const {
  activeUser,
  pendingCashForUser
} = require('./cashBalance');
function createTransferHandler(ops) {
  return async request => {
    const d = p.object(request.data, ['operationId', 'fromUserId', 'toType', 'toUserId', 'bankDepositMethod', 'date', 'amount', 'reason']);
    p.id(d.fromUserId);
    p.date(d.date);
    p.text(d.reason, 'Movement notes');
    const amountPaise = p.rupees(d.amount, 'Transfer amount', 1);
    if (!['person', 'bank'].includes(d.toType)) p.fail('Invalid destination.');
    if (d.toType === 'person' && (!d.toUserId || d.toUserId === d.fromUserId)) p.fail('Choose a different recipient.');
    if (d.toType === 'bank' && !['bank', 'cdm'].includes(d.bankDepositMethod)) p.fail('Select bank or CDM deposit.');
    return ops.run(request, 'cash-transfer', d, p.STAFF, async ctx => {
      if (ctx.actor.role === 'billing' && d.fromUserId !== ctx.actor.uid) p.fail('Billing staff can move only their own held cash.', 'permission-denied');
      const control = await ctx.tx.get(ops.ref('cashMovementControl', 'main')),
        records = await ops.holderRecords(ctx.tx),
        sender = records.users.find(u => u.id === d.fromUserId),
        recipient = d.toType === 'person' ? records.users.find(u => u.id === d.toUserId) : null;
      if (!sender || !activeUser(sender.data) || d.toType === 'person' && (!recipient || !activeUser(recipient.data))) p.fail('Select active staff accounts.');
      const available = p.rupees(pendingCashForUser(d.fromUserId, records.users, records.cashouts, records.transfers), 'Available held cash', -Number.MAX_SAFE_INTEGER);
      if (available < amountPaise) p.fail("Movement exceeds the sender's available held cash.");
      if ((await ctx.tx.get(ops.ref('cashTransfers', ctx.operationId))).exists) p.fail('Legacy transfer reference already exists; recover its original source.', 'already-exists');
      const result = {
        id: ctx.operationId,
        date: d.date,
        fromUserId: d.fromUserId,
        toType: d.toType,
        ...(d.toType === 'person' ? {
          toUserId: d.toUserId
        } : {
          bankDepositMethod: d.bankDepositMethod
        }),
        amount: amountPaise / 100,
        reason: d.reason,
        createdBy: ctx.actor.name,
        createdByUid: ctx.actor.uid,
        recordType: d.toType === 'bank' ? 'bank-transfer' : 'cash-movement',
        createdAt: ctx.timestamp,
        financePostingVersion: 1
      };
      ctx.writes.push(() => ctx.tx.create(ops.ref('cashTransfers', ctx.operationId), result));
      ctx.writes.push(() => ctx.tx.set(ops.ref('cashMovementControl', 'main'), {
        revision: (control.get('revision') || 0) + 1,
        lastOperation: 'cash-transfer',
        lastOperationId: ctx.operationId,
        updatedAt: ctx.timestamp
      }));
      return result;
    });
  };
}
module.exports = {
  createTransferHandler
};
