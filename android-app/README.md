# PhoneFlow Android

PhoneFlow Android is a native shell around the responsive PhoneFlow web application with a native CameraX + ML Kit inventory scanner.

This architecture keeps the Android client aligned with the web dashboard: new Pawn, Loan, Receipt, Backup, Customer, Supplier, and Secure Document features remain available without rebuilding the same business screens separately.

## Included in the first release

- PhoneFlow server connection setup
- Full signed-in dashboard in an app-owned WebView
- Dashboard, Pawn, Loans, Buy & Sell, Stock, Customers, Suppliers, Receipts, Backup, and Secure Documents
- Native barcode, QR, SKU, and IMEI scanner
- Authenticated inventory lookup using the active PhoneFlow web session
- JPEG, PNG, WebP, and PDF file picker support
- Receipt/document popup windows and Android printing
- DownloadManager support for normal HTTP/HTTPS files
- Open-current-page-in-browser action
- Clear-session and change-server controls
- Public HTTP rejection; HTTP is accepted only for localhost, emulator, and private LAN addresses

## Architecture

```text
android-app/
├── app/src/main/java/com/phoneflow/mobile/
│   ├── MainActivity.java       # WebView shell, uploads, printing, downloads
│   ├── ScannerActivity.java    # CameraX + ML Kit scanner
│   ├── PhoneFlowApi.java       # Authenticated inventory lookup
│   └── AppPreferences.java     # Server URL only
├── app/src/main/res/
└── app/build.gradle
```

The Android app does not save a second native copy of the JWT. The scanner reads the active `phoneflow_token` from the private PhoneFlow WebView only when a scan result needs an API lookup.

## Server setup

### Production-like local server

Build the web app and let Express serve both the frontend and API from port 5000:

```bash
npm install
npm run build
NODE_ENV=production npm start
```

Enter this in Android:

```text
http://YOUR_COMPUTER_LAN_IP:5000
```

For the Android emulator:

```text
http://10.0.2.2:5000
```

### Vite hot reload

Run the API and expose Vite to the LAN:

```bash
npm run dev:server
npm run dev:client -- --host 0.0.0.0
```

Enter the Vite URL in Android:

```text
http://YOUR_COMPUTER_LAN_IP:5173
```

When the app URL uses port 5173, the native scanner automatically sends API lookups to the same host on port 5000.

## Build With Android Studio

1. Install Android Studio with Android SDK Platform 36 and JDK 17.
2. Open the `android-app` folder.
3. Allow Gradle sync to finish.
4. Select an emulator or USB-debugging device.
5. Press Run.

## Command-Line Build

This repo is pinned to these Android build versions:

- Android Gradle Plugin 8.13.2
- Gradle 9.2 or newer
- Compile SDK 36
- Target SDK 35

```bash
gradle -p android-app :app:lintDebug :app:assembleDebug
```

APK output:

```text
android-app/app/build/outputs/apk/debug/app-debug.apk
```

Install it with:

```bash
adb install -r android-app/app/build/outputs/apk/debug/app-debug.apk
```

For the Pixel 7 connected over USB, forward both the dashboard and API ports:

```bash
adb reverse tcp:5173 tcp:5173
adb reverse tcp:5000 tcp:5000
```

Then enter this app URL in Android:

```text
http://127.0.0.1:5173
```

Keep `npm run dev` running on the computer while testing this way.

## Scanner behavior

The scanner recognizes:

- Code 128
- Code 39
- EAN-13
- EAN-8
- QR Code

After scanning, Android reads the signed-in PhoneFlow token from the app WebView and calls:

```text
GET /api/inventory/scan/:code
```

The product dialog displays stock, price, SKU/barcode, brand/model, storage/color, IMEI/serial, and notes.

## Security rules

- Use HTTPS for every public or production server.
- HTTP is accepted only for emulator, localhost, and RFC1918 private LAN hosts.
- Navigation to another host leaves the app and opens the system browser.
- File-scheme access and universal file URL access are disabled.
- Third-party cookies are disabled.
- App backups are disabled because the WebView contains an authenticated shop session.
- Clear the app session before giving the phone to another staff member.
- Secure customer document encryption remains server-side; the Android app only receives decrypted bytes after authenticated authorization.

## Known first-release limitations

- Native offline mode is not included; the PhoneFlow server must be reachable.
- Blob downloads should be opened in the document preview and printed/shared. Normal HTTP/HTTPS downloads use Android DownloadManager.
- Push notifications for overdue Pawn or Loan records are a later phase.
- The old `android` branch is retained only as the original scanner prototype. New Android work belongs in `feature/android-app` and `android-app/`.
