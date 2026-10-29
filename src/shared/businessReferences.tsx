/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '@/shared/lib/firebase'
export const businessPrefixes = ['GRN','AUDIT','PRODUCT','VENDOR','PARTY','HANDOVER','PURCHASE','PAYMENT','RETURN','REFUND','EXPENSE','CASHOUT','TRANSFER','LOAN','REPAYMENT','REQUEST','PAYCORR','CASHCORR','OPENCORR','MOVEMENT','REVERSAL','PRICE'] as const
export type BusinessPrefix = typeof businessPrefixes[number]
type Request = {prefix:BusinessPrefix;id:string}
const values=new Map<string,string>(),listeners=new Map<string,Set<()=>void>>(),pending=new Map<string,Request>()
let scheduled=false
const identity=(uid:string,prefix:BusinessPrefix,id:string)=>JSON.stringify([uid,prefix,prefix==='PARTY'?id.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-IN'):id])
function publish(key:string,value:string){values.set(key,value);listeners.get(key)?.forEach(fn=>fn())}
async function flush(){scheduled=false;const uid=auth.currentUser?.uid;if(!uid)return;const entries=[...pending.entries()].filter(([key])=>JSON.parse(key)[0]===uid).slice(0,50);entries.forEach(([key])=>pending.delete(key));if(!entries.length)return
  try{const result=(await httpsCallable<{requests:Request[]},(Request&{reference:string})[]>(functions,'resolveBusinessReferences')({requests:entries.map(([,r])=>r)})).data;if(auth.currentUser?.uid!==uid)return;for(const [key,r] of entries){const match=result.find(v=>v.prefix===r.prefix&&v.id===(r.prefix==='PARTY'?r.id.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-IN'):r.id));publish(key,match?.reference??'missing')}}
  catch{entries.forEach(([key])=>publish(key,'error'))}
  if(pending.size&&!scheduled){scheduled=true;queueMicrotask(()=>void flush())}
}
function enqueue(key:string,request:Request){if(values.has(key))return;values.set(key,'loading');pending.set(key,request);if(!scheduled){scheduled=true;queueMicrotask(()=>void flush())}}
export function useBusinessReference(prefix:BusinessPrefix,id:string){const uid=auth.currentUser?.uid??'',key=identity(uid,prefix,id);const subscribe=useCallback((listener:()=>void)=>{const set=listeners.get(key)??new Set();set.add(listener);listeners.set(key,set);return()=>{set.delete(listener);if(!set.size)listeners.delete(key)}},[key]);const value=useSyncExternalStore(subscribe,()=>values.get(key)??'loading',()=> 'loading')
  useEffect(()=>{if(uid&&id)enqueue(key,{prefix,id})},[uid,key,prefix,id])
  const retry=()=>{values.delete(key);enqueue(key,{prefix,id});publish(key,'loading')}
  return {reference:!['loading','error','missing'].includes(value)?value:null,state:value,retry}
}
export function BusinessReference({prefix,id}:{prefix:BusinessPrefix;id?:string|null}){const value=useBusinessReference(prefix,id??'');if(!id)return <span>Not recorded</span>;return <span className="inline-flex items-center gap-1 font-mono text-xs" title="Business reference">{value.reference??(value.state==='loading'?'…':'Reference unavailable')}{value.state==='error'?<button type="button" className="underline" onClick={event=>{event.stopPropagation();value.retry()}}>Retry</button>:null}</span>}
