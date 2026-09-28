package com.phoneflow.mobile;

import java.net.MalformedURLException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.util.Locale;

final class ServerUrlPolicy {
    private ServerUrlPolicy() {
    }

    static String normalizeBaseUrl(String rawUrl, boolean allowPrivateLanHttp) {
        String candidate = rawUrl == null ? "" : rawUrl.trim();
        if (candidate.isEmpty()) throw new IllegalArgumentException("Enter the PhoneFlow app URL");
        if (!candidate.contains("://")) candidate = inferredScheme(candidate, allowPrivateLanHttp) + candidate;
        candidate = candidate.replaceAll("/+$", "");

        validate(candidate, allowPrivateLanHttp);
        return candidate;
    }

    static URL requireAllowedUrl(String rawUrl, boolean allowPrivateLanHttp) throws MalformedURLException {
        String candidate = rawUrl == null ? "" : rawUrl.trim();
        try {
            validate(candidate, allowPrivateLanHttp);
            return new URI(candidate).toURL();
        } catch (IllegalArgumentException | URISyntaxException error) {
            MalformedURLException wrapped = new MalformedURLException(error.getMessage());
            wrapped.initCause(error);
            throw wrapped;
        }
    }

    private static String inferredScheme(String candidate, boolean allowPrivateLanHttp) {
        if (!allowPrivateLanHttp) return "https://";
        try {
            String host = new URI("http://" + candidate).getHost();
            return host != null && isAllowedCleartextHost(host) ? "http://" : "https://";
        } catch (URISyntaxException error) {
            return "https://";
        }
    }

    private static void validate(String candidate, boolean allowPrivateLanHttp) {
        final URI uri;
        try {
            uri = new URI(candidate);
        } catch (URISyntaxException error) {
            throw new IllegalArgumentException("Enter a valid PhoneFlow URL", error);
        }

        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || host == null || host.isBlank()) {
            throw new IllegalArgumentException("Enter a valid PhoneFlow URL");
        }

        if ("https".equalsIgnoreCase(scheme)) return;
        if ("http".equalsIgnoreCase(scheme) && allowPrivateLanHttp && isAllowedCleartextHost(host)) return;
        if ("http".equalsIgnoreCase(scheme)) {
            throw new IllegalArgumentException("Use HTTPS, or a private Wi-Fi address in the PhoneFlow Shop app.");
        }
        throw new IllegalArgumentException("Use an HTTPS PhoneFlow address");
    }

    private static boolean isAllowedCleartextHost(String host) {
        String value = host.toLowerCase(Locale.US);
        return value.equals("localhost")
            || value.equals("127.0.0.1")
            || value.equals("10.0.2.2")
            || isPrivateIpv4(value);
    }

    private static boolean isPrivateIpv4(String host) {
        String[] parts = host.split("\\.");
        if (parts.length != 4) return false;
        int[] octets = new int[4];
        try {
            for (int index = 0; index < 4; index++) {
                octets[index] = Integer.parseInt(parts[index]);
                if (octets[index] < 0 || octets[index] > 255) return false;
            }
        } catch (NumberFormatException error) { return false; }
        return octets[0] == 10
            || (octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31)
            || (octets[0] == 192 && octets[1] == 168);
    }
}
