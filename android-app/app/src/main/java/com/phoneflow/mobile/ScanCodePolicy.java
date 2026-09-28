package com.phoneflow.mobile;

final class ScanCodePolicy {
    private ScanCodePolicy() {}

    static String normalizeGunCode(String rawValue) {
        if (rawValue == null) return "";
        return rawValue
            .replace("\r", "")
            .replace("\n", "")
            .replace("\t", "")
            .trim();
    }
}
