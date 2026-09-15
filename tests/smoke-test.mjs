import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const app = fs.readFileSync(path.join(root,'js/app.js'),'utf8');
const core = fs.readFileSync(path.join(root,'js/app-core.js'),'utf8');
const db = fs.readFileSync(path.join(root,'js/db.js'),'utf8');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));

for (const file of ['js/app.js','js/app-core.js','js/db.js','js/modules/print.js','js/modules/annotations.js','js/modules/organizer.js','js/modules/autosave.js','js/modules/testing.js']) {
  execFileSync('node',['--check',path.join(root,file)]);
}
assert.match(app,/modules\/print\.js/);
assert.match(app,/modules\/annotations\.js/);
assert.match(app,/modules\/organizer\.js/);
assert.match(app,/modules\/autosave\.js/);
assert.match(core,/window\.MukorobApp\s*=\s*\{/);
assert.match(core,/mukorob:document-opened/);
assert.match(db,/DB_VERSION\s*=\s*4/);
assert.match(db,/createObjectStore\('drafts'/);
assert.match(html,/type="module" src="js\/app\.js"/);
for (const id of ['btnPrint','btnPrintMobile','btnESignature','btnCompanyStamp','btnCloseDocument','toolPageOrganizer','mukorobPrintSurface','autosaveStatus']) assert.match(html,new RegExp(`id=["']${id}["']`));
assert.match(fs.readFileSync(path.join(root,'js/modules/print.js'),'utf8'),/window\.print\(\)/);
assert.doesNotMatch(fs.readFileSync(path.join(root,'js/modules/print.js'),'utf8'),/window\.open\s*\(/);
assert.match(fs.readFileSync(path.join(root,'js/modules/annotations.js'),'utf8'),/v07-resize-handle/);
assert.match(fs.readFileSync(path.join(root,'js/modules/annotations.js'),'utf8'),/pointermove/);
assert.match(fs.readFileSync(path.join(root,'js/modules/organizer.js'),'utf8'),/draggable=true/);
assert.match(fs.readFileSync(path.join(root,'js/modules/autosave.js'),'utf8'),/saveDraft/);
assert.equal(manifest.version,'0.7.0');
console.log('Mukorob PDF v0.7 structural smoke tests: PASS');
