# Mukorob PDF — Android setup

Mukorob PDF v0.7.1 is a Progressive Web App (PWA). For the Bradz internal pilot, the recommended Android deployment is an HTTPS-installed PWA rather than an unofficial APK wrapper.

## Install on Android

1. Publish the application at a Bradz-controlled **HTTPS** address.
2. Open the address in Google Chrome on the Android phone.
3. Sign in using the staff User ID and password created by Super Admin.
4. Open Chrome's menu and choose **Install app** or **Add to Home screen**.
5. Launch Mukorob PDF from the new home-screen icon.

The account session remains active until the user explicitly logs out.

## Mobile functions

- Open/read PDFs
- Recent document reopening from locally stored bytes
- Search and selectable text
- Zoom and page navigation
- Print where Android/browser printing is available
- PDF editing according to permission
- Annotations
- E-signature
- Company stamp
- Recent-file removal according to permission
- Dark, Light, Sepia and High Contrast reading themes

## Opening PDFs from Android file manager

PWA file-handler support is included in the manifest where the browser/Android version supports it. Browser support varies. If the Android file manager does not offer Mukorob PDF as an open-with option, use **Open PDF** inside Mukorob PDF.

## Updates and existing mobile data

- Mukorob checks the published release version and shows an **Update available** prompt when a newer version is detected online.
- Updating the PWA refreshes the application files; it does not intentionally clear the Android Chrome profile's Mukorob IndexedDB/localStorage data.
- If the same Android Chrome installation was originally created on that phone, its login data should remain across normal PWA updates. If the account was created in Avast or another browser/device, that data will not automatically appear in Android Chrome.
- Use **Backup & Migration** on the source browser as the supported way to move users, settings and compatible local data to Android Chrome.

## Security

The v0.6 staff account system is local to the device. It is appropriate for a controlled internal pilot but is not equivalent to central enterprise authentication. For deployment across multiple staff devices, use the future Mukorob authentication/API service so your Super Admin account, users, permissions and audit records are centrally enforced.

## Recommended future native package

Once the web/PWA version is stable, a native Android package can be produced using a maintained Android WebView/TWA or Capacitor-based shell. It should be signed with the Bradz/Mukorob release key and distributed through a controlled channel.
