package com.phoneflow.mobile;

import android.content.Context;
import android.content.SharedPreferences;

final class AppPreferences {
    private static final String FILE_NAME = "phoneflow_mobile";
    private static final String SERVER_URL_KEY = "server_url";

    private final SharedPreferences preferences;

    AppPreferences(Context context) {
        preferences = context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE);
    }

    String getServerUrl() {
        return preferences.getString(SERVER_URL_KEY, BuildConfig.DEFAULT_SERVER_URL);
    }

    void setServerUrl(String serverUrl) {
        preferences.edit().putString(SERVER_URL_KEY, serverUrl).apply();
    }

    void clearServerUrl() {
        preferences.edit().remove(SERVER_URL_KEY).apply();
    }
}
