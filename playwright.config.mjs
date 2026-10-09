import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'./tests',testMatch:'*.spec.mjs',timeout:60000,workers:1,
  use:{trace:'retain-on-failure',launchOptions:process.env.MUKOROB_CHROMIUM_PATH?{executablePath:process.env.MUKOROB_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']}:{}},
  projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 7']}}],
  webServer:process.env.MUKOROB_BASE_URL?undefined:{command:'python3 -m http.server 4173 --bind 127.0.0.1 > /tmp/mukorob-http.log 2>&1',url:'http://127.0.0.1:4173',reuseExistingServer:true},
});
