package com.phoneflow.scanner;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.OptIn;
import androidx.activity.ComponentActivity;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ExperimentalGetImage;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;

import com.google.android.gms.tasks.Task;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.NumberFormat;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@OptIn(markerClass = ExperimentalGetImage.class)
public class MainActivity extends ComponentActivity {
    private static final int CAMERA_PERMISSION_REQUEST = 2104;
    private static final String PREFS = "phoneflow_scanner";
    private static final String DEFAULT_BASE_URL = BuildConfig.DEBUG ? "http://10.0.2.2:5000" : "";

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final BarcodeScanner barcodeScanner = BarcodeScanning.getClient();
    private SharedPreferences preferences;
    private String token = "";
    private String baseUrl = DEFAULT_BASE_URL;
    private PreviewView previewView;
    private TextView statusText;
    private Button scanToggleButton;
    private boolean scanning = false;
    private boolean resolvingScan = false;
    private String lastCode = "";
    private long lastScanAt = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String savedBaseUrl = preferences.getString("baseUrl", DEFAULT_BASE_URL);
        String savedToken = preferences.getString("token", "");
        try {
            baseUrl = ServerUrlPolicy.normalizeBaseUrl(savedBaseUrl, BuildConfig.DEBUG);
            token = savedToken;
        } catch (IllegalArgumentException error) {
            baseUrl = DEFAULT_BASE_URL;
            token = "";
            preferences.edit().remove("baseUrl").remove("token").apply();
        }
        showRoot();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        io.shutdownNow();
        barcodeScanner.close();
    }

    private void showRoot() {
        LinearLayout root = vertical();
        root.setBackgroundColor(Color.rgb(11, 16, 32));
        root.setPadding(dp(18), dp(20), dp(18), dp(18));

        TextView title = text("PhoneFlow Scanner", 24, Color.WHITE, true);
        TextView subtitle = text("Scan shop barcodes and open live stock details.", 13, Color.rgb(143, 155, 180), false);
        root.addView(title);
        root.addView(subtitle);

        if (token.isEmpty()) {
            addLoginForm(root);
        } else {
            addScanner(root);
        }

        setContentView(root);
    }

    private void addLoginForm(LinearLayout root) {
        EditText url = input("API base URL", baseUrl);
        EditText email = input("Email", "");
        EditText password = input("Password", "");
        password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        Button login = button("Sign in");
        ProgressBar progress = new ProgressBar(this);
        progress.setVisibility(View.GONE);

        root.addView(spacer(18));
        root.addView(url);
        root.addView(email);
        root.addView(password);
        root.addView(login);
        root.addView(progress);

        login.setOnClickListener((view) -> {
            final String nextBaseUrl;
            try {
                nextBaseUrl = ServerUrlPolicy.normalizeBaseUrl(url.getText().toString(), BuildConfig.DEBUG);
            } catch (IllegalArgumentException error) {
                toast(error.getMessage());
                return;
            }
            String nextEmail = email.getText().toString().trim();
            String nextPassword = password.getText().toString();
            if (nextBaseUrl.isEmpty() || nextEmail.isEmpty() || nextPassword.isEmpty()) {
                toast("Enter API URL, email, and password");
                return;
            }
            login.setEnabled(false);
            progress.setVisibility(View.VISIBLE);
            io.execute(() -> {
                try {
                    JSONObject body = new JSONObject()
                        .put("email", nextEmail)
                        .put("password", nextPassword);
                    JSONObject response = requestJson(nextBaseUrl + "/api/auth/login", "POST", body.toString(), "");
                    token = response.getString("token");
                    baseUrl = nextBaseUrl;
                    preferences.edit().putString("token", token).putString("baseUrl", baseUrl).apply();
                    main.post(this::showRoot);
                } catch (Exception error) {
                    main.post(() -> {
                        login.setEnabled(true);
                        progress.setVisibility(View.GONE);
                        toast(error.getMessage());
                    });
                }
            });
        });
    }

    private void addScanner(LinearLayout root) {
        LinearLayout top = horizontal();
        top.setGravity(Gravity.CENTER_VERTICAL);
        TextView connection = text(baseUrl, 11, Color.rgb(143, 155, 180), false);
        Button logout = smallButton("Logout");
        top.addView(connection, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        top.addView(logout);
        root.addView(spacer(16));
        root.addView(top);

        previewView = new PreviewView(this);
        previewView.setBackgroundColor(Color.rgb(16, 23, 42));
        LinearLayout.LayoutParams previewParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1);
        previewParams.setMargins(0, dp(16), 0, dp(14));
        root.addView(previewView, previewParams);

        statusText = text("Ready to scan", 13, Color.rgb(196, 181, 253), true);
        scanToggleButton = button("Start scanner");
        root.addView(statusText);
        root.addView(scanToggleButton);

        logout.setOnClickListener((view) -> {
            token = "";
            preferences.edit().remove("token").apply();
            showRoot();
        });
        scanToggleButton.setOnClickListener((view) -> {
            if (scanning) stopScanning();
            else startScanning();
        });

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
        }
    }

    private void startScanning() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
            return;
        }
        scanning = true;
        scanToggleButton.setText("Stop scanner");
        statusText.setText("Point camera at a PhoneFlow barcode");

        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            try {
                ProcessCameraProvider provider = future.get();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());
                ImageAnalysis analysis = new ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build();
                analysis.setAnalyzer(ContextCompat.getMainExecutor(this), this::analyzeBarcode);
                provider.unbindAll();
                provider.bindToLifecycle((LifecycleOwner) this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis);
            } catch (Exception error) {
                toast("Camera failed: " + error.getMessage());
                stopScanning();
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void stopScanning() {
        scanning = false;
        resolvingScan = false;
        scanToggleButton.setText("Start scanner");
        statusText.setText("Scanner stopped");
        try {
            ProcessCameraProvider.getInstance(this).get().unbindAll();
        } catch (Exception ignored) {
        }
    }

    private void analyzeBarcode(@NonNull ImageProxy proxy) {
        if (!scanning || resolvingScan || proxy.getImage() == null) {
            proxy.close();
            return;
        }
        InputImage image = InputImage.fromMediaImage(proxy.getImage(), proxy.getImageInfo().getRotationDegrees());
        Task<java.util.List<Barcode>> task = barcodeScanner.process(image);
        task.addOnSuccessListener((barcodes) -> {
            for (Barcode barcode : barcodes) {
                String value = barcode.getRawValue();
                if (value != null && !value.trim().isEmpty()) {
                    handleScannedCode(value.trim());
                    break;
                }
            }
        }).addOnCompleteListener((result) -> proxy.close());
    }

    private void handleScannedCode(String code) {
        long now = System.currentTimeMillis();
        if (code.equals(lastCode) && now - lastScanAt < 2500) return;
        lastCode = code;
        lastScanAt = now;
        resolvingScan = true;
        statusText.setText("Looking up " + code + "...");

        io.execute(() -> {
            try {
                String encoded = URLEncoder.encode(code, StandardCharsets.UTF_8.name()).replace("+", "%20");
                JSONObject response = requestJson(baseUrl + "/api/inventory/scan/" + encoded, "GET", null, token);
                JSONObject item = response.getJSONObject("item");
                main.post(() -> showProductDialog(item));
            } catch (Exception error) {
                main.post(() -> {
                    resolvingScan = false;
                    statusText.setText("No product found. Scan again.");
                    toast(error.getMessage());
                });
            }
        });
    }

    private void showProductDialog(JSONObject item) {
        resolvingScan = false;
        statusText.setText("Product found. Scan another code when ready.");

        ScrollView scroll = new ScrollView(this);
        LinearLayout body = vertical();
        body.setPadding(dp(18), dp(16), dp(18), dp(8));
        scroll.addView(body);

        ImageView image = new ImageView(this);
        image.setBackgroundColor(Color.rgb(16, 23, 42));
        image.setScaleType(ImageView.ScaleType.CENTER_CROP);
        body.addView(image, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(190)));
        String imageUrl = item.optString("imageUrl", "");
        if (!imageUrl.isEmpty()) loadImage(resolveUrl(imageUrl), image);
        else image.setImageResource(android.R.drawable.ic_menu_gallery);

        body.addView(spacer(12));
        body.addView(text(item.optString("name", "Unnamed product"), 20, Color.rgb(15, 23, 42), true));
        body.addView(text(item.optString("sku", "No SKU") + " · " + title(item.optString("category", "OTHER")), 12, Color.rgb(100, 116, 139), false));
        body.addView(spacer(10));
        body.addView(detail("Status", title(item.optString("status", "UNKNOWN"))));
        body.addView(detail("Stock", String.valueOf(item.optInt("quantity", 0))));
        body.addView(detail("Sell price", money(item.optDouble("sellPrice", 0))));
        body.addView(detail("Brand / model", join(item.optString("brand", ""), item.optString("model", ""))));
        body.addView(detail("Storage / color", join(item.optString("storage", ""), item.optString("color", ""))));
        body.addView(detail("IMEI / serial", join(item.optString("imei1", ""), item.optString("serialNumber", ""))));
        body.addView(detail("Notes", item.optString("notes", "Not recorded")));

        new AlertDialog.Builder(this)
            .setTitle("Product detail")
            .setView(scroll)
            .setPositiveButton("Scan next", (dialog, which) -> statusText.setText("Ready to scan"))
            .setNegativeButton("Stop", (dialog, which) -> stopScanning())
            .show();
    }

    private JSONObject requestJson(String url, String method, String body, String authToken) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) ServerUrlPolicy
            .requireAllowedUrl(url, BuildConfig.DEBUG)
            .openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(12000);
        connection.setRequestProperty("Accept", "application/json");
        if (authToken != null && !authToken.isEmpty()) {
            connection.setRequestProperty("Authorization", "Bearer " + authToken);
        }
        if (body != null) {
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.getBytes(StandardCharsets.UTF_8));
            }
        }

        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
        String response = readAll(stream);
        JSONObject json = response.isEmpty() ? new JSONObject() : new JSONObject(response);
        if (status < 200 || status >= 300) {
            throw new Exception(json.optString("message", "Request failed: " + status));
        }
        return json;
    }

    private void loadImage(String url, ImageView image) {
        io.execute(() -> {
            try (InputStream stream = ServerUrlPolicy.requireAllowedUrl(url, BuildConfig.DEBUG).openStream()) {
                Bitmap bitmap = BitmapFactory.decodeStream(stream);
                main.post(() -> image.setImageBitmap(bitmap));
            } catch (Exception ignored) {
            }
        });
    }

    private String readAll(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) builder.append(line);
        }
        return builder.toString();
    }

    private String resolveUrl(String value) {
        if (value.startsWith("http://") || value.startsWith("https://")) return value;
        return baseUrl + (value.startsWith("/") ? value : "/" + value);
    }

    private TextView detail(String label, String value) {
        TextView view = text(label + ": " + (value == null || value.trim().isEmpty() ? "Not recorded" : value), 13, Color.rgb(51, 65, 85), false);
        view.setPadding(0, dp(5), 0, dp(5));
        return view;
    }

    private String join(String first, String second) {
        if (first == null || first.trim().isEmpty()) return second == null || second.trim().isEmpty() ? "Not recorded" : second;
        if (second == null || second.trim().isEmpty()) return first;
        return first + " · " + second;
    }

    private String title(String value) {
        return value == null ? "" : value.replace("_", " ").toLowerCase(Locale.US);
    }

    private String money(double value) {
        return NumberFormat.getCurrencyInstance(Locale.US).format(value);
    }

    private LinearLayout vertical() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        return layout;
    }

    private LinearLayout horizontal() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.HORIZONTAL);
        return layout;
    }

    private TextView text(String value, int sp, int color, boolean bold) {
        TextView text = new TextView(this);
        text.setText(value);
        text.setTextSize(sp);
        text.setTextColor(color);
        if (bold) text.setTypeface(text.getTypeface(), android.graphics.Typeface.BOLD);
        return text;
    }

    private EditText input(String hint, String value) {
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setText(value);
        input.setSingleLine(true);
        input.setTextColor(Color.WHITE);
        input.setHintTextColor(Color.rgb(100, 116, 139));
        input.setBackgroundColor(Color.rgb(16, 23, 42));
        input.setPadding(dp(12), 0, dp(12), 0);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48));
        params.setMargins(0, 0, 0, dp(12));
        input.setLayoutParams(params);
        return input;
    }

    private Button button(String value) {
        Button button = new Button(this);
        button.setText(value);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48));
        params.setMargins(0, dp(4), 0, dp(8));
        button.setLayoutParams(params);
        return button;
    }

    private Button smallButton(String value) {
        Button button = new Button(this);
        button.setText(value);
        return button;
    }

    private View spacer(int height) {
        View view = new View(this);
        view.setLayoutParams(new LinearLayout.LayoutParams(1, dp(height)));
        return view;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void toast(String message) {
        Toast.makeText(this, message == null ? "Something went wrong" : message, Toast.LENGTH_LONG).show();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_PERMISSION_REQUEST && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startScanning();
        } else if (requestCode == CAMERA_PERMISSION_REQUEST) {
            toast("Camera permission is required for scanning");
        }
    }
}
