// Additive synthetic review records only; never resets the live local review dataset.
const fs = require('node:fs'), path = require('node:path'), { randomUUID } = require('node:crypto')
const admin = require('./safe-admin.cjs')

async function add(out) {
  const proof = await admin.health()
  const lock = JSON.parse(fs.readFileSync(path.resolve('output/playwright/.drill-browser-run.lock')))
  if (lock.batch !== 'finance-preview' || lock.runId !== process.env.DRILL_RUN_ID) throw Error('The guarded finance review must own these fixtures.')
  process.kill(lock.pid, 0)
  const uid = 'drill-ui-owner'
  const profile = await admin.get('users/' + uid)
  if (profile?.role !== 'owner' || profile.email !== 'ui-owner@drill.invalid' || profile.disabled) throw Error('Synthetic owner fixture missing; no fallback account.')
  const file = path.join(out, 'cheque-review-fixtures.json')
  let journal = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : null
  if (!journal) {
    const book = await admin.get('chequeBooksV2/book-1120-1199')
    if (!book?.active) throw Error('The local review cheque book is not active.')
    const used = new Set((await admin.records('chequesV2')).map(c => Number(c.chequeNumber)))
    const leaves = []
    for (let number = book.startNumber; number <= book.endNumber && leaves.length < 3; number += 1) if (!used.has(number)) leaves.push(String(number))
    if (leaves.length !== 3) throw Error('Three unused synthetic cheque leaves are required.')
    const nextDate = new Date(Date.parse(admin.date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10)
    const vendorId = 'ui-review-cheque-vendor-' + randomUUID()
    const issue = (number, amountPaise, date) => ({ kind: 'cheque-issue', intent: { operationId: randomUUID(), purpose: 'vendor-payment', vendorId, chequeNumber: number, chequeBookId: book.id, amountPaise, date, notes: 'Synthetic local cheque UI review only' } })
    journal = {
      project: admin.PROJECT, businessDate: admin.date, synthetic: true, reset: false,
      before: { bank: await admin.get('bankBalanceControl/main'), counter: await admin.get(admin.base + '/handover/main') },
      vendorId,
      createVendor: { kind: 'vendor-create', intent: { operationId: randomUUID(), id: vendorId, canonicalName: 'UI Review Cheque Vendor', ownerName: 'Synthetic Contact', contact: '9990000000', address: 'Local emulator only', suppliedBrands: ['Synthetic'], openingBalancePaise: 100000, openingDate: admin.date, openingReason: 'Synthetic fixture payable for local cheque UI review', notes: 'Not a real vendor or payment' } },
      cheques: [
        { label: 'Future Issued', number: leaves[0], amountPaise: 10000, issue: issue(leaves[0], 10000, nextDate) },
        { label: 'Due Presented', number: leaves[1], amountPaise: 15000, issue: issue(leaves[1], 15000, admin.date) },
        { label: 'Cancelled example', number: leaves[2], amountPaise: 5000, issue: issue(leaves[2], 5000, admin.date) }
      ],
      cancelOperationId: randomUUID(), results: []
    }
    fs.writeFileSync(file, JSON.stringify(journal, null, 2))
  }
  if (journal.project !== admin.PROJECT || !journal.synthetic || journal.businessDate !== admin.date) throw Error('Fixture journal belongs to another environment/date.')
  if (journal.completedAt) {
    console.log(JSON.stringify({ status: 'Already prepared; no cheque state was replayed', cheques: await Promise.all(journal.cheques.map(c => admin.get('chequesV2/' + c.number))) }))
    return
  }
  const loginResponse = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-local-only', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: profile.email, password: admin.PASSWORD, returnSecureToken: true }) })
  const login = await loginResponse.json()
  if (!loginResponse.ok || login.localId !== uid || !login.idToken) throw Error('Synthetic emulator authentication failed.')
  async function call(name, data) {
    const response = await fetch('http://127.0.0.1:5001/demo-alphahub-drill/asia-south1/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.idToken }, body: JSON.stringify({ data }), signal: AbortSignal.timeout(45000) })
    const body = await response.json()
    if (!response.ok || body.error) throw Error('Local callable ' + name + ': ' + (body.error?.message || response.status))
    return body.result ?? body.data
  }
  const save = () => fs.writeFileSync(file, JSON.stringify(journal, null, 2))
  const created = await call('postFinanceOperation', journal.createVendor)
  journal.results.push({ action: 'vendor-create', result: created }); save()
  for (const cheque of journal.cheques) {
    const result = await call('postFinanceOperation', cheque.issue)
    journal.results.push({ action: 'cheque-issue', number: cheque.number, result }); save()
  }
  const cancelled = journal.cheques[2]
  if (!journal.cancelExpectedRevision) {
    journal.cancelExpectedRevision = (await admin.get('chequesV2/' + cancelled.number)).revision
    save()
  }
  const result = await call('postFinanceOperation', { kind: 'cheque-decision', intent: { operationId: journal.cancelOperationId, chequeNumber: cancelled.number, expectedRevision: journal.cancelExpectedRevision, toStatus: 'cancelled', reason: 'Synthetic cancelled example for local UI review' } })
  journal.results.push({ action: 'cancel', result }); save()
  await call('presentDueCheque', { chequeNumber: journal.cheques[1].number })
  journal.after = { bank: await admin.get('bankBalanceControl/main'), counter: await admin.get(admin.base + '/handover/main'), vendor: await admin.get('vendorAccountStatesV2/' + journal.vendorId), cheques: await Promise.all(journal.cheques.map(c => admin.get('chequesV2/' + c.number))) }
  const expectedStatuses = ['issued', 'presented', 'cancelled']
  for (let index = 0; index < 3; index += 1) if (journal.after.cheques[index]?.status !== expectedStatuses[index]) throw Error('Synthetic cheque status did not reconcile.')
  if (journal.after.bank.balancePaise !== journal.before.bank.balancePaise) throw Error('Unexpected bank balance change while preparing pending/cancelled examples.')
  if (journal.after.counter.cashNetPaise !== journal.before.counter.cashNetPaise || journal.after.counter.checkpoint.cashActualPaise !== journal.before.counter.checkpoint.cashActualPaise) throw Error('Drawer changed during fixture preparation; inspect concurrent review actions.')
  if (journal.after.vendor.outstandingPaise !== 100000) throw Error('Synthetic vendor payable does not reconcile.')
  journal.proof = { project: proof.project, firestoreHost: proof.firestoreHost, authHost: proof.authHost }
  journal.completedAt = new Date().toISOString(); save()
  console.log(JSON.stringify({ status: 'Prepared', project: admin.PROJECT, reset: false, bankUnchanged: true, drawerUnchanged: true, vendorPayablePaise: 100000, cheques: journal.after.cheques.map(c => ({ number: c.chequeNumber, date: c.date, amountPaise: c.amountPaise, status: c.status })) }))
}
module.exports = { add }
