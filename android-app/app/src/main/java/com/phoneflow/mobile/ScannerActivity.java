package com.phoneflow.mobile;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.view.MotionEvent;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.OptIn;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ExperimentalGetImage;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public class ScannerActivity extends AppCompatActivity {
    static final String RESULT_CODE = "phoneflow_scan_code";
    static final String RESULT_MODE = "phoneflow_scan_result_mode";
    static final String EXTRA_MODE = "phoneflow_scan_mode";
    static final String MODE_GUN = "gun";
    static final String MODE_LOOKUP = "lookup";
    private static final int CAMERA_PERMISSION_REQUEST = 2301;

    private final ExecutorService cameraExecutor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean resolving = new AtomicBoolean(false);
    private final BarcodeScanner barcodeScanner = BarcodeScanning.getClient(
        new BarcodeScannerOptions.Builder()
            .setBarcodeFormats(
                Barcode.FORMAT_CODE_128,
                Barcode.FORMAT_CODE_39,
                Barcode.FORMAT_EAN_13,
                Barcode.FORMAT_EAN_8,
                Barcode.FORMAT_QR_CODE
            )
            .build()
    );

    private PreviewView previewView;
    private TextView statusText;
    private Button torchButton;
    private ProcessCameraProvider cameraProvider;
    private Camera camera;
    private boolean torchEnabled;
    private boolean gunMode;
    private volatile boolean gunTriggerHeld;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        gunMode = MODE_GUN.equals(getIntent().getStringExtra(EXTRA_MODE));
        if (gunMode) {
            configureGunScanner();
            return;
        }

        setContentView(R.layout.activity_scanner);

        previewView = findViewById(R.id.cameraPreview);
        statusText = findViewById(R.id.scannerStatus);
        torchButton = findViewById(R.id.torchButton);

        findViewById(R.id.cancelScanButton).setOnClickListener(view -> finish());
        torchButton.setOnClickListener(view -> toggleTorch());
        torchButton.setEnabled(false);

        requestCamera();
    }

    private void configureGunScanner() {
        setContentView(R.layout.activity_gun_scanner);
        previewView = findViewById(R.id.gunCameraPreview);
        statusText = findViewById(R.id.gunScannerStatus);
        torchButton = findViewById(R.id.torchButton);
        Button trigger = findViewById(R.id.gunScanButton);

        findViewById(R.id.cancelGunScanButton).setOnClickListener(view -> finish());
        torchButton.setOnClickListener(view -> toggleTorch());
        torchButton.setEnabled(false);
        trigger.setOnClickListener(view -> { });
        trigger.setOnTouchListener((view, event) -> {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                gunTriggerHeld = true;
                statusText.setText(R.string.gun_scanner_scanning);
                trigger.setText(R.string.gun_scanner_release);
                return true;
            }
            if (event.getAction() == MotionEvent.ACTION_UP || event.getAction() == MotionEvent.ACTION_CANCEL) {
                gunTriggerHeld = false;
                statusText.setText(R.string.gun_scanner_ready);
                trigger.setText(R.string.gun_scanner_trigger);
                view.performClick();
                return true;
            }
            return false;
        });
        requestCamera();
    }

    private void requestCamera() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCamera();
        } else {
            ActivityCompat.requestPermissions(
                this,
                new String[]{Manifest.permission.CAMERA},
                CAMERA_PERMISSION_REQUEST
            );
        }
    }

    @OptIn(markerClass = ExperimentalGetImage.class)
    private void startCamera() {
        statusText.setText(gunMode ? R.string.gun_scanner_ready : R.string.scanner_hint);
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            try {
                cameraProvider = future.get();

                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());

                ImageAnalysis analysis = new ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build();
                analysis.setAnalyzer(cameraExecutor, this::analyzeImage);

                cameraProvider.unbindAll();
                camera = cameraProvider.bindToLifecycle(
                    this,
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    analysis
                );
                torchButton.setEnabled(camera.getCameraInfo().hasFlashUnit());
            } catch (Exception error) {
                statusText.setText("Camera unavailable");
                Toast.makeText(this, "Camera failed: " + safeMessage(error), Toast.LENGTH_LONG).show();
            }
        }, ContextCompat.getMainExecutor(this));
    }

    @OptIn(markerClass = ExperimentalGetImage.class)
    private void analyzeImage(@NonNull ImageProxy proxy) {
        if (resolving.get() || proxy.getImage() == null || (gunMode && !gunTriggerHeld)) {
            proxy.close();
            return;
        }

        InputImage input = InputImage.fromMediaImage(
            proxy.getImage(),
            proxy.getImageInfo().getRotationDegrees()
        );

        barcodeScanner.process(input)
            .addOnSuccessListener(barcodes -> {
                if (resolving.get() || (gunMode && !gunTriggerHeld)) return;
                for (Barcode barcode : barcodes) {
                    String value = barcode.getRawValue();
                    if (value == null || value.trim().isEmpty()) continue;
                    if (!resolving.compareAndSet(false, true)) return;

                    statusText.setText("Found " + value.trim());
                    Intent result = new Intent()
                        .putExtra(RESULT_CODE, value.trim())
                        .putExtra(RESULT_MODE, gunMode ? MODE_GUN : MODE_LOOKUP);
                    setResult(RESULT_OK, result);
                    finish();
                    return;
                }
            })
            .addOnFailureListener(error -> statusText.setText("Keep the label steady and try again"))
            .addOnCompleteListener(task -> proxy.close());
    }

    private void toggleTorch() {
        if (camera == null || !camera.getCameraInfo().hasFlashUnit()) return;
        torchEnabled = !torchEnabled;
        camera.getCameraControl().enableTorch(torchEnabled);
        torchButton.setText(torchEnabled ? "Torch off" : getString(R.string.torch));
    }

    private String safeMessage(Exception error) {
        return error.getMessage() == null ? "Unknown camera error" : error.getMessage();
    }

    @Override
    protected void onDestroy() {
        if (cameraProvider != null) cameraProvider.unbindAll();
        barcodeScanner.close();
        cameraExecutor.shutdownNow();
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(
        int requestCode,
        @NonNull String[] permissions,
        @NonNull int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != CAMERA_PERMISSION_REQUEST) return;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startCamera();
        } else {
            Toast.makeText(this, "Camera permission is required for scanning", Toast.LENGTH_LONG).show();
            finish();
        }
    }
}
