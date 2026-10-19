// Test-only Windows discovery launcher: avoid the broken local CMD shim.
// Reuses the installed firebase-functions CLI and selected Node runtime.
require('./server-guard.cjs')
if (process.platform === 'win32') {
 const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module'),cp=require('node:child_process')
 const firebasePackage=path.join(process.env.APPDATA,'npm/node_modules/firebase-tools/package.json')
 const load=createRequire(firebasePackage),id=load.resolve('cross-spawn'),original=load(id)
 function spawn(command,args,options) {
  if (typeof command==='string' && /[\\/]node_modules[\\/]\.bin[\\/]firebase-functions(?:\.cmd)?$/i.test(command)) {
   const entry=path.resolve(path.dirname(command),'../firebase-functions/lib/bin/firebase-functions.js')
   if(!fs.existsSync(entry))throw Error('Installed Functions discovery entry missing')
   return cp.spawn(process.execPath,[entry,...args],{...options,shell:false,windowsHide:true})
  }
  return original(command,args,options)
 }
 Object.assign(spawn,original)
 require.cache[id].exports=spawn
}
