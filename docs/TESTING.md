# Mukorob PDF v0.7 Testing

## Local structural test

Run:

```bash
node tests/smoke-test.mjs
```

## Browser test

Install development dependencies:

```bash
npm install
npx playwright install chromium
```

Serve the application on `http://127.0.0.1:4173`, then run:

```bash
npm run test:browser
```

For another URL:

```bash
MUKOROB_BASE_URL=https://your-host.example npm run test:browser
```

## Release checklist

- Login/bootstrap works.
- Super Admin can register staff and edit permissions.
- Staff cannot reach Admin controls.
- Recent files are isolated per user.
- Open/close/reopen Recent works.
- Print opens the native browser print dialog without a new tab/window.
- Signature can be placed, dragged and resized.
- Company stamp can be placed, dragged and resized.
- Page organiser reorder/delete preserves page-associated annotations.
- Autosave status changes after edits and a newer draft can be restored.
- PWA installs on supported browsers.
- PDF file handler is registered on supported desktop Chromium installations.
