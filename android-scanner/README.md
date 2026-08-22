# PhoneFlow Scanner Android

Native Android scanner companion for the PhoneFlow admin dashboard.

The Android app is intentionally small:

- Staff signs in with a PhoneFlow account.
- Staff scans the printed barcode label on a phone/accessory.
- App calls the backend endpoint `GET /api/inventory/scan/:code`.
- Product detail popup opens on Android with photo, SKU, category, status, stock, price, brand/model, IMEI/serial, and notes.

## 1. Before Building

Make sure PhoneFlow backend is running from the main repo:

```bash
npm run dev
```

The backend should be reachable on port `5000`.

For a real Android phone, expose the backend through HTTPS and enter its HTTPS URL:

```text
https://YOUR_PHONEFLOW_SERVER
```

For a debug build on the Android Emulator only:

```text
http://10.0.2.2:5000
```

## 2. Connect Android Phone With ADB

On the phone:

1. Enable Developer options.
2. Enable USB debugging.
3. Plug USB cable into the computer.
4. Accept the RSA debugging prompt on the phone.

Check device:

```bash
adb devices -l
```

Expected:

```text
List of devices attached
XXXXXXXX device product:...
```

If it says `unauthorized`, unlock the phone and accept the USB debugging prompt.

If it shows no device in WSL, run ADB from Windows or build/install through Android Studio. USB devices often attach to Windows, not WSL.

## 3. Build With Android Studio

This is the easiest path.

1. Open Android Studio.
2. Open this folder:

```text
android-scanner/
```

From Windows, this repo path is:

```text
\\wsl.localhost\Ubuntu\home\kevin\code\phone-admin-dashboard\android-scanner
```

3. Let Gradle sync download dependencies.
4. Select a connected phone.
5. Press Run.

The app uses:

- CameraX
- ML Kit Barcode Scanning
- Existing PhoneFlow REST API

## 4. Build From Command Line

From this folder:

```bash
cd android-scanner
./gradlew :app:assembleDebug
```

The debug APK will be created here:

```text
android-scanner/app/build/outputs/apk/debug/app-debug.apk
```

Then install:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

This repo includes a lightweight `gradlew` script that uses the cached Gradle `8.9` install on this machine.

## Current Machine Notes

On this machine right now:

- Command-line APK build works:

```bash
cd android-scanner
./gradlew :app:assembleDebug
```

- Built APK path:

```text
android-scanner/app/build/outputs/apk/debug/app-debug.apk
```

- WSL/Linux `adb devices -l` still shows no attached phone.
- Windows Android SDK exists at `C:\Android SDK`.
- A local SDK shim was created at `android-scanner/.android-sdk` so Gradle can build from WSL.
- The installed Linux system Gradle is old Debian Gradle `4.4.1`; use `./gradlew`, not `gradle`.

Recommended install path for this machine:

1. Make the phone visible to ADB.
2. Confirm:

```bash
adb devices -l
```

3. Install:

```bash
cd android-scanner
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## 5. Login And Scan

Open the app and enter:

- API URL: your HTTPS PhoneFlow server, or `http://10.0.2.2:5000` in an emulator debug build
- Email: your PhoneFlow login email
- Password: your PhoneFlow password

Then:

1. Tap `Start scanner`.
2. Point camera at the printed PhoneFlow barcode.
3. Product popup appears.
4. Tap `Scan next` to continue.

## 6. Troubleshooting

`No product found`

- Barcode does not match `barcode`, `sku`, `imei1`, `imei2`, or `serialNumber`.
- Reprint label from Stock Information.

`Network error` or timeout

- Release and direct LAN connections must use HTTPS.
- Debug HTTP is limited to localhost and the emulator endpoint `10.0.2.2`.
- Make sure backend is running on port `5000`.
- Windows firewall may need to allow port `5000`.

Photo not showing

- Product must have a photo uploaded in PhoneFlow.
- Backend must serve `/uploads`.
- API URL must point to the same backend that stores the uploads.

ADB no device

- Enable USB debugging.
- Accept the RSA prompt.
- Try another USB cable/port.
- If using WSL, check from Windows Android Studio because WSL may not see USB devices.
