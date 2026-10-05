package com.phoneflow.mobile;

import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class PhoneFlowApi {
    interface Callback {
        void onSuccess(JSONObject item, boolean desktopShared);
        void onError(String message);
    }

    interface RelayCallback {
        void onSuccess();
        void onError(String message);
    }

    private static final ExecutorService IO = Executors.newFixedThreadPool(2);
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private PhoneFlowApi() {
    }

    static void activateScanner(String baseUrl, String sessionCookie, String mode, RelayCallback callback) {
        IO.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = ServerUrlPolicy.requireAllowedUrl(
                    baseUrl + "/api/scanner/activate",
                    BuildConfig.ALLOW_PRIVATE_LAN_HTTP
                );
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(12_000);
                connection.setReadTimeout(15_000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                connection.setRequestProperty("Cookie", sessionCookie);
                connection.setRequestProperty("X-PhoneFlow-Request", "1");

                byte[] payload = new JSONObject()
                    .put("mode", "gun".equals(mode) ? "input" : "lookup")
                    .toString()
                    .getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(payload.length);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(payload);
                }

                int status = connection.getResponseCode();
                InputStream stream = status >= 200 && status < 300
                    ? connection.getInputStream()
                    : connection.getErrorStream();
                String body = readAll(stream);
                JSONObject response = body.isEmpty() ? new JSONObject() : new JSONObject(body);
                if (status == 401) throw new IllegalStateException("Your session expired. Sign in again before scanning.");
                if (status < 200 || status >= 300) {
                    throw new IllegalStateException(response.optString("message", "Unable to start scanner (" + status + ")"));
                }
                if (!response.optBoolean("ready", false)) {
                    throw new IllegalStateException("The desktop scanner is not ready. Keep PhoneFlow open on the computer.");
                }
                MAIN.post(callback::onSuccess);
            } catch (Exception error) {
                String message = error.getMessage();
                MAIN.post(() -> callback.onError(message == null || message.isBlank()
                    ? "Unable to reach the PhoneFlow server"
                    : message));
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    static void lookupInventory(String baseUrl, String sessionCookie, String code, Callback callback) {
        IO.execute(() -> {
            HttpURLConnection connection = null;
            try {
                String encoded = URLEncoder.encode(code, StandardCharsets.UTF_8.name()).replace("+", "%20");
                URL url = ServerUrlPolicy.requireAllowedUrl(
                    baseUrl + "/api/inventory/scan/" + encoded,
                    BuildConfig.ALLOW_PRIVATE_LAN_HTTP
                );
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(12_000);
                connection.setReadTimeout(12_000);
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("Cookie", sessionCookie);
                connection.setRequestProperty("X-PhoneFlow-Request", "1");

                int status = connection.getResponseCode();
                InputStream stream = status >= 200 && status < 300
                    ? connection.getInputStream()
                    : connection.getErrorStream();
                String body = readAll(stream);
                JSONObject payload = body.isEmpty() ? new JSONObject() : new JSONObject(body);

                if (status == 401) throw new IllegalStateException("Your session expired. Sign in again before scanning.");
                if (status < 200 || status >= 300) {
                    throw new IllegalStateException(payload.optString("message", "Inventory lookup failed (" + status + ")"));
                }

                JSONObject item = payload.optJSONObject("item");
                if (item == null) throw new IllegalStateException("The server returned no product details");
                boolean desktopShared = payload.optBoolean("desktopShared", false);
                MAIN.post(() -> callback.onSuccess(item, desktopShared));
            } catch (Exception error) {
                String message = error.getMessage();
                MAIN.post(() -> callback.onError(message == null || message.isBlank()
                    ? "Unable to reach the PhoneFlow server"
                    : message));
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    static void relayInput(String baseUrl, String sessionCookie, String code, RelayCallback callback) {
        IO.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = ServerUrlPolicy.requireAllowedUrl(
                    baseUrl + "/api/scanner/events",
                    BuildConfig.ALLOW_PRIVATE_LAN_HTTP
                );
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(12_000);
                connection.setReadTimeout(12_000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                connection.setRequestProperty("Cookie", sessionCookie);
                connection.setRequestProperty("X-PhoneFlow-Request", "1");

                byte[] payload = new JSONObject()
                    .put("code", ScanCodePolicy.normalizeGunCode(code))
                    .toString()
                    .getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(payload.length);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(payload);
                }

                int status = connection.getResponseCode();
                InputStream stream = status >= 200 && status < 300
                    ? connection.getInputStream()
                    : connection.getErrorStream();
                String body = readAll(stream);
                boolean jsonResponse = connection.getContentType() != null
                    && connection.getContentType().toLowerCase().contains("application/json");
                JSONObject response = jsonResponse && !body.isEmpty() ? new JSONObject(body) : new JSONObject();
                if (status == 401) throw new IllegalStateException("Your session expired. Sign in again before scanning.");
                if (!jsonResponse) {
                    throw new IllegalStateException("PhoneFlow on the computer is out of date. Restart or update it, then scan again.");
                }
                if (status < 200 || status >= 300) {
                    throw new IllegalStateException(response.optString("message", "Unable to send scan (" + status + ")"));
                }
                MAIN.post(callback::onSuccess);
            } catch (Exception error) {
                String message = error.getMessage();
                MAIN.post(() -> callback.onError(message == null || message.isBlank()
                    ? "Unable to reach the PhoneFlow server"
                    : message));
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private static String readAll(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) builder.append(line);
        }
        return builder.toString();
    }
}
