package com.phoneflow.mobile;

import java.net.MalformedURLException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.util.Locale;

final class ServerUrlPolicy {
    private ServerUrlPolicy() {
    }

    static String normalizeBaseUrl(String rawUrl, boolean debugBuild) {
        String candidate = rawUrl == null ? "" : rawUrl.trim();
        if (candidate.isEmpty()) throw new IllegalArgumentException("Enter the PhoneFlow app URL");
        if (!candidate.contains("://")) candidate = "https://" + candidate;
        candidate = candidate.replaceAll("/+$", "");

        validate(candidate, debugBuild);
        return candidate;
    }

    static URL requireAllowedUrl(String rawUrl, boolean debugBuild) throws MalformedURLException {
        String candidate = rawUrl == null ? "" : rawUrl.trim();
        try {
            validate(candidate, debugBuild);
            return new URI(candidate).toURL();
        } catch (IllegalArgumentException | URISyntaxException error) {
            MalformedURLException wrapped = new MalformedURLException(error.getMessage());
            wrapped.initCause(error);
            throw wrapped;
        }
    }

    private static void validate(String candidate, boolean debugBuild) {
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
        if ("http".equalsIgnoreCase(scheme) && debugBuild && isDebugCleartextHost(host)) return;
        if ("http".equalsIgnoreCase(scheme)) {
            throw new IllegalArgumentException("Use HTTPS. Debug HTTP is limited to localhost and the Android emulator.");
        }
        throw new IllegalArgumentException("Use an HTTPS PhoneFlow address");
    }

    private static boolean isDebugCleartextHost(String host) {
        String value = host.toLowerCase(Locale.US);
        return value.equals("localhost")
            || value.equals("127.0.0.1")
            || value.equals("10.0.2.2");
    }
}
