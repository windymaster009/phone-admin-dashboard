package com.phoneflow.scanner;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import org.junit.Test;

import java.net.MalformedURLException;

public class ServerUrlPolicyTest {
    @Test
    public void releaseRequiresHttps() {
        assertEquals(
            "https://phoneflow.example.com",
            ServerUrlPolicy.normalizeBaseUrl("phoneflow.example.com/", false)
        );
        assertThrows(
            IllegalArgumentException.class,
            () -> ServerUrlPolicy.normalizeBaseUrl("http://192.168.1.25:5000", false)
        );
        assertThrows(
            IllegalArgumentException.class,
            () -> ServerUrlPolicy.normalizeBaseUrl("http://10.0.2.2:5000", false)
        );
    }

    @Test
    public void debugAllowsOnlyExactLoopbackAndEmulatorHosts() {
        assertEquals(
            "http://10.0.2.2:5000",
            ServerUrlPolicy.normalizeBaseUrl("http://10.0.2.2:5000/", true)
        );
        assertEquals(
            "http://127.0.0.1:5000",
            ServerUrlPolicy.normalizeBaseUrl("http://127.0.0.1:5000", true)
        );
        assertThrows(
            IllegalArgumentException.class,
            () -> ServerUrlPolicy.normalizeBaseUrl("http://192.168.1.25:5000", true)
        );
        assertThrows(
            IllegalArgumentException.class,
            () -> ServerUrlPolicy.normalizeBaseUrl("http://10.evil.example:5000", true)
        );
    }

    @Test
    public void networkSinkRechecksTheFullUrl() {
        assertThrows(
            MalformedURLException.class,
            () -> ServerUrlPolicy.requireAllowedUrl("http://10.evil.example/api/inventory/scan/123", true)
        );
    }
}
