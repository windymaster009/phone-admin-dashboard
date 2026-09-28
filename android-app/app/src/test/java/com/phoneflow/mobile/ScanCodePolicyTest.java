package com.phoneflow.mobile;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class ScanCodePolicyTest {
    @Test
    public void normalizesCommonScannerSuffixes() {
        assertEquals("PF-20260929-ABC", ScanCodePolicy.normalizeGunCode("  PF-20260929-ABC\r\n\t"));
    }

    @Test
    public void handlesMissingInput() {
        assertEquals("", ScanCodePolicy.normalizeGunCode(null));
    }
}
