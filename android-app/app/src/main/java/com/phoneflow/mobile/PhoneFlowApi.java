package com.phoneflow.mobile;

import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class PhoneFlowApi {
    interface Callback {
        void onSuccess(JSONObject item);
        void onError(String message);
    }

    private static final ExecutorService IO = Executors.newFixedThreadPool(2);
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private PhoneFlowApi() {
    }

    static void lookupInventory(String baseUrl, String sessionCookie, String code, Callback callback) {
        IO.execute(() -> {
            HttpURLConnection connection = null;
            try {
                String encoded = URLEncoder.encode(code, StandardCharsets.UTF_8.name()).replace("+", "%20");
                URL url = new URL(baseUrl + "/api/inventory/scan/" + encoded);
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(12_000);
                connection.setReadTimeout(12_000);
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("Cookie", sessionCookie);

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
                MAIN.post(() -> callback.onSuccess(item));
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
