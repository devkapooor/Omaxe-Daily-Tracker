// Test-only, loopback-only read evidence. Never exposes emulator tokens.
const fs=require('node:fs'),path=require('node:path')
require('./server-guard.cjs')
async function main(){
 if(process.env.GCLOUD_PROJECT!=='demo-alphahub-drill'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Exact demo emulator environment required')
 await require('./safe-admin.cjs').health()
 const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=drill-emulator-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@drill.invalid',password:require('./safe-admin.cjs').PASSWORD,returnSecureToken:true})}),account=await response.json()
 if(!response.ok||!account.idToken)throw Error('Synthetic local authentication unavailable')
 const token=JSON.parse(Buffer.from(account.idToken.split('.')[1],'base64url').toString());if(token.aud!=='demo-alphahub-drill')throw Error('Wrong token project')
 const stamp=new Date().toISOString(), started=Date.now()
 const time=await fetch('http://127.0.0.1:5001/demo-alphahub-drill/asia-south1/getServerTime',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+account.idToken},body:JSON.stringify({data:{}})}),data=await time.json(),serverMs=data.result?.serverTimeMs
 if(!time.ok||!Number.isFinite(serverMs))throw Error('Local trusted clock unavailable')
 const result={at:stamp,project:token.aud,node:process.version,localDateMs:Date.parse(stamp),localNowMs:started,serverTimeMs:serverMs,serverIso:new Date(serverMs).toISOString(),differenceMs:serverMs-started,roundTripMs:Date.now()-started,authIssuedAtIso:new Date(token.iat*1000).toISOString(),pass:Math.abs(serverMs-started)<=5000}
 fs.writeFileSync(path.resolve('output/playwright',process.env.DRILL_RUN_ID,process.argv[2]||'clock-proof.json'),JSON.stringify(result,null,2));console.log(result);if(!result.pass)process.exitCode=1
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
