import {test as base} from '@playwright/test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
export const test=base.extend({page:async({page},use)=>{
  // Test external dependencies deterministically; never contact real accounts.
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',route=>route.fulfill({path:require.resolve('pdfjs-dist/build/pdf.min.js'),contentType:'application/javascript'}));
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',route=>route.fulfill({path:require.resolve('pdfjs-dist/build/pdf.worker.min.js'),contentType:'application/javascript'}));
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',route=>route.fulfill({path:require.resolve('pdf-lib/dist/pdf-lib.min.js'),contentType:'application/javascript'}));
  await page.route('https://esm.sh/**',route=>route.fulfill({contentType:'application/javascript',body:'export const createClient=()=>({auth:{getSession:async()=>({data:{session:null}})}});'}));
  await page.route('https://*.supabase.co/**',route=>route.abort());
  await page.route('https://raw.githubusercontent.com/**',route=>route.abort());
  await use(page);
}});
export {expect} from '@playwright/test';
export async function openTestPdf(page,bytes) {
  await page.goto(process.env.MUKOROB_BASE_URL||'http://127.0.0.1:4173');
  await page.waitForFunction(()=>window.MukorobTestHooks&&window.MukorobPdfEngine);
  await page.waitForTimeout(500);
  await page.evaluate(async data=>{
    pdfjsLib.GlobalWorkerOptions.workerSrc=location.origin+'/node_modules/pdfjs-dist/build/pdf.worker.min.js';
    const A=window.MukorobApp;A.state.auth.user={id:'test-bte',fullName:'Bradz test',role:'superadmin',permissions:{}};
    window.dispatchEvent(new CustomEvent('mukorob:auth-changed'));
    document.querySelector('#authModal').hidden=true;document.querySelector('#accessGate').hidden=true;
    await A.openFile(new File([new Uint8Array(data)],'Fixture.pdf',{type:'application/pdf'}));
    A.saveBytesAs=async(bytes,name)=>{window.__saved={bytes:Array.from(new Uint8Array(bytes)),name};return true;};
  },Array.from(bytes));
}
