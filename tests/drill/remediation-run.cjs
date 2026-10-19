const path=require('node:path'),fs=require('node:fs')
if(!process.versions.node.startsWith('20.'))throw Error('Configured Functions acceptance runtime Node20 is required')
process.env.DRILL_BROWSER_EXECUTABLE='C:/Users/devka/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
process.env.DRILL_RUN_ID='2026-10-16-financial-remediation'
process.env.JAVA_HOME='C:/Program Files/Microsoft/jdk-21.0.12.101-hotspot'
process.env.PATH=path.dirname(process.execPath)+path.delimiter+process.env.JAVA_HOME+'/bin'+path.delimiter+process.env.PATH
process.env.GCLOUD_PROJECT='demo-alphahub-drill'
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
process.env.FIREBASE_EMULATOR_HUB='127.0.0.1:4400'
process.env.METADATA_SERVER_DETECTION='none'
process.env.NODE_OPTIONS=(process.env.NODE_OPTIONS||'')+' --require="'+path.resolve('tests/drill/server-guard.cjs').replaceAll('\\','/')+'"'
fs.mkdirSync(path.resolve('output/playwright',process.env.DRILL_RUN_ID),{recursive:true})
require('./run.cjs')
