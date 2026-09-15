/* v0.7.1 browser-test hooks. These are inert in normal use and make key flows
   deterministic for Playwright/Cypress without exposing credentials. */
window.MukorobTestHooks={
  version:'0.7.1',
  getState:()=>({authenticated:!!window.MukorobApp?.state?.auth?.user,documentOpen:!!window.MukorobApp?.state?.pdfDoc,page:window.MukorobApp?.state?.currentPage||0}),
  getAnnotationCount:()=>window.MukorobApp?.state?.annotations?.length||0,
  hasMigrationUI:()=>Boolean(document.querySelector('#mkMigrationPanel')),
  hasFirstRunRestore:()=>Boolean(document.querySelector('#mkFirstRunRestore'))
};
