const fs = require('node:fs')
const net = require('node:net')
const childProcess = require('node:child_process')
// Firebase CLI workers otherwise create a visible console per cold runtime on
// Windows. This preload affects local QA helpers only, never application code.
for (const method of ['spawn', 'spawnSync']) {
  const original = childProcess[method]
  childProcess[method] = function (command, args, options) {
    if (!Array.isArray(args)) return original.call(this, command, { ...(options ?? args), windowsHide: true })
    return original.call(this, command, args, { ...options, windowsHide: true })
  }
}
const connect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0]
  const host = typeof first === 'object' ? first?.host : typeof args[1] === 'string' ? args[1] : 'localhost'
  if (host && !['localhost','127.0.0.1','::1','[::1]'].includes(host)) {
    if (process.env.DRILL_GUARD_LOG) fs.appendFileSync(process.env.DRILL_GUARD_LOG, JSON.stringify({at:new Date().toISOString(),pid:process.pid,blockedHost:host})+'\n')
    throw new Error('DRILL_ISOLATION: nonlocal server connection blocked: '+host)
  }
  return connect.apply(this, args)
}
