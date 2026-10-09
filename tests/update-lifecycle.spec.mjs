import {test,expect} from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
function oldFile(file){
 const source=file==='sw.js'?'tests/fixtures/update-v080-sw.js':file==='js/modules/update-manager.js'?'tests/fixtures/update-v080-manager.js':file;
 try{return fs.readFileSync(path.join(root,source));}catch{return null;}
}
async function fixture(useNewUpdater=false){
 let deployed=false,latest='0.9.1',marker='0.9.1';
 const server=http.createServer((req,res)=>{
  const file=decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\//,'')||'index.html';
  let body;
  if(file==='latest.txt') body=latest;
  else if(file==='index.html')body=`<!doctype html><head>${deployed?'<meta name="mukorob-version" content="0.9.1">':''}</head><body><h1>${deployed?marker:'0.8.0'}</h1><script src="js/db.js"></script><script src="js/modules/update-manager.js"></script></body>`;
  else if(file==='VERSION.txt')body=deployed?'0.9.1':'0.8.0';
  else {try{body=deployed?fs.readFileSync(path.join(root,file)):oldFile(file);}catch{}}
  if(body==null){res.writeHead(404);res.end();return;}
  if(file==='sw.js'&&!deployed)body=body.toString().replace(/,'https:[^']+'/g,'');
  if(file==='js/modules/update-manager.js'){if(useNewUpdater)body=fs.readFileSync(path.join(root,file));body=body.toString().replace('https://raw.githubusercontent.com/BTENamibia/Mukorob-Pdf-Project/main/VERSION.txt','/latest.txt');}
  res.setHeader('Content-Type',file.endsWith('.js')||file.endsWith('.mjs')?'application/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');
  res.setHeader('Cache-Control','no-store');res.end(body);
 });
 await new Promise(resolve=>server.listen(0,'0.0.0.0',resolve));
 return {url:`http://127.0.0.2:${server.address().port}/`,deploy(){deployed=true;},marker(v){marker=v;},latest(v){latest=v;},close(){server.closeAllConnections();return new Promise(resolve=>server.close(resolve));}};
}
async function seed(page){
 await page.evaluate(async()=>{
  await MukorobDB.put('users',{id:'retained-user',name:'Bradz staff'});
  await MukorobDB.put('recent',{hash:'retained-pdf',name:'Existing.pdf',bytes:new Uint8Array([37,80,68,70])});
  await MukorobDB.put('drafts',{id:'retained-draft',rotations:[[1,90]],annotations:[{type:'note',text:'Retain me'}]});
  await MukorobDB.put('settings',{key:'retained-setting',value:'sepia'});
  localStorage.setItem('retained-session','existing-session');
  await(await caches.open('unrelated-app-cache')).put('/unrelated',new Response('keep'));
 });
}
async function preserved(page){
 expect(await page.evaluate(async()=>({
  user:(await MukorobDB.get('users','retained-user')).name,
  pdf:Array.from((await MukorobDB.get('recent','retained-pdf')).bytes),
  draft:(await MukorobDB.get('drafts','retained-draft')).annotations[0].text,
  setting:(await MukorobDB.get('settings','retained-setting')).value,
  session:localStorage.getItem('retained-session'),other:await caches.has('unrelated-app-cache')
 }))).toEqual({user:'Bradz staff',pdf:[37,80,68,70],draft:'Retain me',setting:'sepia',session:'existing-session',other:true});
}
test('existing v0.8 Update now reaches the new release, preserves data and reopens offline',async({page,context})=>{
 const host=await fixture();
 try{
  await page.goto(host.url);await page.waitForFunction(()=>navigator.serviceWorker.controller);
  await expect(page.locator('#mkUpdatePanel')).toContainText('v0.8.0');await seed(page);
  host.deploy();await page.locator('#mkUpdateNow').click();
  await expect(page.locator('h1')).toHaveText('0.9.1',{timeout:30000});
  await expect(page.locator('#mkUpdatePanel')).toHaveCount(0);await preserved(page);
  // Root launch must also refresh; installed PWAs can launch either URL.
  host.marker('Fresh online launch');
  await page.goto(host.url);await expect(page.locator('h1')).toHaveText('Fresh online launch');
  host.marker('0.9.1');await page.reload();
  await context.setOffline(true);await page.reload();await expect(page.locator('h1')).toHaveText('0.9.1');await preserved(page);
 }finally{await context.setOffline(false);await host.close();}
});
test('new updater reports a host that has not deployed, without entering a reload loop',async({page})=>{
 const host=await fixture();host.deploy();host.latest('0.9.2');
 try{
  await page.goto(host.url);await expect(page.locator('#mkUpdatePanel')).toContainText('v0.9.2');
  const initial=page.url();await page.locator('#mkUpdateNow').click();
  await expect(page.locator('#mkUpdatePanel [role=status]')).toContainText('still serving an older release');
  await expect(page.locator('#mkUpdateNow')).toBeEnabled();expect(page.url()).toBe(initial);
 }finally{await host.close();}
});

test('current updater activates a replacement worker and checkpoints edits before reloading',async({page})=>{
 const host=await fixture(true);
 try{
  await page.goto(host.url);await page.waitForFunction(()=>navigator.serviceWorker.controller);
  await expect(page.locator('#mkUpdatePanel')).toContainText('v0.8.0');await seed(page);
  await page.evaluate(()=>{window.MukorobAutosave={flush:async()=>{await MukorobDB.put('drafts',{id:'update-checkpoint',text:'Saved before reload'});}};});
  host.deploy();await page.locator('#mkUpdateNow').click();
  await expect(page.locator('h1')).toHaveText('0.9.1',{timeout:35000});
  await expect(page.locator('#mkUpdatePanel')).toHaveCount(0);await preserved(page);
  expect(await page.evaluate(async()=>(await MukorobDB.get('drafts','update-checkpoint')).text)).toBe('Saved before reload');
 }finally{await host.close();}
});
