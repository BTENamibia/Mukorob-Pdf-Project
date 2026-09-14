# Mukorob PDF — Android setup

Mukorob PDF is packaged as a Progressive Web App (PWA), so Android users do not need a separate APK for the normal internal deployment.

## Recommended Bradz deployment
1. Publish the `mukorob-pdf-app` folder at a Bradz-controlled **HTTPS** address, for example `https://pdf.btenamibia.com/`.
2. Open the address in Chrome on the Android phone.
3. Sign in with the staff user ID and password created by Super Admin.
4. Use Chrome menu → **Add to Home screen** / **Install app**.
5. Open Mukorob PDF from the new home-screen icon. The session remains active until the user logs out.

## Mobile capabilities
- PDF open/read, search and selectable text
- zoom and page navigation
- print where Android/browser printing is available
- annotations, e-signature and company stamp according to permissions
- staff login and persistent session
- recent-file management

## Important
For real multi-device Bradz accounts and organisation-wide Super Admin security, deploy Mukorob PDF behind HTTPS with the future Mukorob authentication/API service. The current v0.5 local account layer is designed for controlled internal pilot use and stores account data locally on each installation/device.
