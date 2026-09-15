import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const app = fs.readFileSync(path.join(root,'js/app.js'),'utf8');
const core = fs.readFileSync(path.join(root,'js/app-core.js'),'utf8');
const db = fs.readFileSync(path.join(root,'db.js'),'utf8');
const migration = fs.readFileSync(path.join(root,'js/modules/data-migration.js'),'utf8');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
const version = fs.readFileSync(path.join(root,'VERSION.txt'),'utf8').trim();

for (const file of ['js/app.js','js/app-core.js','js/db.js','js/modules/print.js','js/modules/annotations.js','js/modules/organizer.js','js/modules/autosave.js','js/modules/data-migration.js','js/modules/testing.js']) {
  execFileSync('node',['--check',path.join(root,file)]);
}
assert.match(app,/modules\/data-migration\.js/);
assert.match(app,/modules\/print\.js/);
assert.match(app,/modules\/annotations\.js/);
assert.match(app,/modules\/organizer\.js/);
assert.match(app,/modules\/autosave\.js/);
assert.match(core,/window\.MukorobApp\s*=\s*\{/);
assert.match(db,/DB_VERSION\s*=\s*2/);
assert.match(db,/async function stores\(\)/);
assert.match(db,/createObjectStore\('users'/);
assert.match(migration,/PBKDF2-SHA256/);
assert.match(migration,/AES-GCM/);
assert.match(migration,/mkFirstRunRestore/);
assert.match(migration,/active browser session token is never exported/);
assert.match(html,/type="module" src="js\/app\.js"/);
for (const id of ['btnPrint','btnPrintMobile','btnCloseDocument','toolPageOrganizer','mukorobPrintSurface','autosaveStatus','bootstrapView']) assert.match(html,new RegExp(`id=["']${id}["']`));
assert.match(fs.readFileSync(path.join(root,'js/modules/print.js'),'utf8'),/window\.print\(\)/);
assert.doesNotMatch(fs.readFileSync(path.join(root,'js/modules/print.js'),'utf8'),/window\.open\s*\(/);
assert.match(fs.readFileSync(path.join(root,'js/modules/annotations.js'),'utf8'),/v07-resize-handle/);
assert.match(fs.readFileSync(path.join(root,'js/modules/annotations.js'),'utf8'),/pointermove/);
assert.match(fs.readFileSync(path.join(root,'js/modules/organizer.js'),'utf8'),/draggable=true/);
assert.match(fs.readFileSync(path.join(root,'js/modules/autosave.js'),'utf8'),/saveDraft/);
assert.equal(version,'0.7.1');
console.log('Mukorob PDF v0.7.1 structural smoke tests: PASS');
