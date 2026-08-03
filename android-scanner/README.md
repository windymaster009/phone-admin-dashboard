# PhoneFlow Scanner Android App

Small native Android companion app for PhoneFlow shop staff.

## What It Does

- Signs in with the same PhoneFlow account API.
- Uses the Android camera to scan barcode labels printed from PhoneFlow.
- Calls `GET /api/inventory/scan/:code`.
- Shows product details in a popup: photo, SKU, category, status, stock, price, brand/model, IMEI/serial, and notes.

## API URL

Use the API server address from the Android device:

- Android emulator: `http://10.0.2.2:5000`
- Real phone on same Wi-Fi: `http://YOUR_COMPUTER_LAN_IP:5000`

Find the computer IP with:

```bash
hostname -I
```

The backend must be reachable from the phone. Start it from the repo root:

```bash
npm run dev
```

## Build

Open `android-scanner/` in Android Studio and run the `app` configuration.

This app uses CameraX and ML Kit barcode scanning:

- `androidx.camera:camera-camera2`
- `androidx.camera:camera-lifecycle`
- `androidx.camera:camera-view`
- `com.google.mlkit:barcode-scanning`

## Shop Flow

1. Add product in PhoneFlow web admin.
2. Upload product photo.
3. Print barcode label.
4. Stick label on product or box.
5. Scan with this Android app.
6. Product popup opens immediately.
