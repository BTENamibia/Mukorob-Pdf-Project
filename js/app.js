/* Mukorob PDF v0.7 — application entry point.
   The stable v0.6 core lives in app-core.js. Feature modules are loaded here
   so the PDF viewer can evolve without returning to one monolithic script. */
import './modules/print.js';
import './modules/annotations.js';
import './modules/organizer.js';
import './modules/autosave.js';
import './modules/data-migration.js';
import './modules/testing.js';
