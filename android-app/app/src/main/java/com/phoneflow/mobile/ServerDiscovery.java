package com.phoneflow.mobile;

import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletionService;
import java.util.concurrent.ExecutorCompletionService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

final class ServerDiscovery {
    interface Callback { void onFound(String serverUrl); void onNotFound(); }
    private ServerDiscovery() {}

    private static void post(Runnable action) {
        new Handler(Looper.getMainLooper()).post(action);
    }

    static void find(Callback callback) {
        new Thread(() -> discover(callback), "phoneflow-discovery").start();
    }

    private static void discover(Callback callback) {
        List<String> hosts = localSubnetHosts();
        if (hosts.isEmpty()) { post(callback::onNotFound); return; }
        ExecutorService workers = Executors.newFixedThreadPool(32);
        CompletionService<String> results = new ExecutorCompletionService<>(workers);
        for (String host : hosts) results.submit(() -> probe(host));
        try {
            for (int index = 0; index < hosts.size(); index++) {
                Future<String> completed = results.take();
                String server = completed.get();
                if (server != null) {
                    workers.shutdownNow();
                    post(() -> callback.onFound(server));
                    return;
                }
            }
        } catch (Exception ignored) {
            // An individual host failure must not crash the app.
        } finally {
            workers.shutdownNow();
        }
        post(callback::onNotFound);
    }

    static List<String> candidateHosts(List<String> localAddresses) {
        Set<String> hosts = new LinkedHashSet<>();
        for (String address : localAddresses) {
            String[] parts = address.split("\\.");
            if (parts.length != 4) continue;
            String prefix = parts[0] + "." + parts[1] + "." + parts[2] + ".";
            for (int suffix = 1; suffix <= 254; suffix++) {
                String candidate = prefix + suffix;
                if (!candidate.equals(address)) hosts.add(candidate);
            }
        }
        return new ArrayList<>(hosts);
    }

    private static List<String> localSubnetHosts() {
        List<String> addresses = new ArrayList<>();
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface network = interfaces.nextElement();
                if (!network.isUp() || network.isLoopback()) continue;
                Enumeration<InetAddress> values = network.getInetAddresses();
                while (values.hasMoreElements()) {
                    InetAddress address = values.nextElement();
                    if (address instanceof Inet4Address && address.isSiteLocalAddress()) addresses.add(address.getHostAddress());
                }
            }
        } catch (Exception ignored) { return List.of(); }
        return candidateHosts(addresses);
    }

    private static String probe(String host) {
        HttpURLConnection connection = null;
        try {
            String baseUrl = "http://" + host + ":5000";
            connection = (HttpURLConnection) new URL(baseUrl + "/api/health").openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(350);
            connection.setReadTimeout(700);
            connection.setRequestProperty("Accept", "application/json");
            if (connection.getResponseCode() != 200) return null;
            StringBuilder body = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) body.append(line);
            }
            JSONObject health = new JSONObject(body.toString());
            return health.optBoolean("ok") && "phoneflow-api".equals(health.optString("service")) ? baseUrl : null;
        } catch (Exception ignored) { return null; }
        finally { if (connection != null) connection.disconnect(); }
    }
}
