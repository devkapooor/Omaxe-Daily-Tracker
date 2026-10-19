// Release configuration publication only. No financial balances/history are written.
import { readFile } from 'node:fs/promises'
const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1]
if(args.includes('--help')){console.log('Pipe an owner Firebase ID token to stdin. Required: --project ID and exactly one of --emulator/--production, and --dry-run or --apply --review FILE. Production additionally requires --release-authorized. Save dry-run stdout as the reviewed JSON. No token is logged.');process.exit(0)}
const known=new Set(['--project','--emulator','--production','--dry-run','--apply','--review','--release-authorized'])
for(let i=0;i<args.length;i++){if(!known.has(args[i]))throw Error('Unknown option');if(['--project','--review'].includes(args[i]))i++}
const project=value('--project'),emulator=args.includes('--emulator'),production=args.includes('--production'),dryRun=args.includes('--dry-run'),apply=args.includes('--apply')
if(!args.includes('--project')||!project||emulator===production||dryRun===apply)throw Error('Specify project, environment and one publication mode explicitly')
if(emulator&&project!=='demo-alphahub-drill')throw Error('Only the exact local drill project is supported')
if(production){const config=JSON.parse(await readFile(new URL('../.firebaserc',import.meta.url),'utf8'));if(project!==config.projects?.default||project.startsWith('demo-')||!args.includes('--release-authorized'))throw Error('Production release authorization and exact configured project required')}
const endpoint=emulator?'http://127.0.0.1:5001/'+project+'/asia-south1/publishStaffViews':'https://asia-south1-'+project+'.cloudfunctions.net/publishStaffViews'
let data={dryRun:true}
if(apply){if(!args.includes('--review'))throw Error('Reviewed dry-run JSON required');const review=JSON.parse(await readFile(value('--review'),'utf8'));if(review.project!==project||review.endpoint!==endpoint||review.result?.dryRun!==true||review.result?.schemaVersion!==1)throw Error('Dry-run review does not match this exact target');data={dryRun:false,expectedSettingsRevision:review.result.settingsRevision,expectedMetricsUpdatedAt:review.result.metricsUpdatedAt}}
let token='';for await(const chunk of process.stdin){token+=chunk;if(token.length>16384)throw Error('Invalid token input')}
token=token.trim();if(!/^eyJ[A-Za-z0-9_.-]+$/.test(token))throw Error('Owner Firebase ID token must be supplied through stdin')
const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({data}),signal:AbortSignal.timeout(60000)})
const body=await response.json();if(!response.ok||body.error)throw Error(body.error?.message||'Publication failed')
console.log(JSON.stringify({project,endpoint,result:body.result},null,2))
