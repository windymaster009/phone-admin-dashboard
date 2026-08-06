package com.phoneflow.mobile;

import android.app.AlertDialog;
import android.app.Dialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONObject;
import org.json.JSONTokener;

import java.lang.ref.WeakReference;
import java.text.NumberFormat;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {
    private AppPreferences preferences;
    private View setupPanel;
    private View browserPanel;
    private EditText serverUrlInput;
    private TextView setupError;
    private TextView connectionLabel;
    private TextView pageTitle;
    private ProgressBar pageProgress;
    private WebView webView;
    private ValueCallback<Uri[]> fileUploadCallback;
    private ActivityResultLauncher<Intent> filePickerLauncher;
    private ActivityResultLauncher<Intent> scannerLauncher;
    private String serverUrl = "";
    private String apiBaseUrl = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        preferences = new AppPreferences(this);
        bindViews();
        registerActivityLaunchers();
        configureWebView(webView, true);
        bindActions();

        String savedServer = preferences.getServerUrl();
        if (savedServer == null || savedServer.isBlank()) showSetup("");
        else connect(savedServer);
    }

    private void bindViews() {
        setupPanel = findViewById(R.id.setupPanel);
        browserPanel = findViewById(R.id.browserPanel);
        serverUrlInput = findViewById(R.id.serverUrlInput);
        setupError = findViewById(R.id.setupError);
        connectionLabel = findViewById(R.id.connectionLabel);
        pageTitle = findViewById(R.id.pageTitle);
        pageProgress = findViewById(R.id.pageProgress);
        webView = findViewById(R.id.phoneFlowWebView);
    }

    private void registerActivityLaunchers() {
        filePickerLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (fileUploadCallback == null) return;
                Uri[] selection = WebChromeClient.FileChooserParams.parseResult(
                    result.getResultCode(),
                    result.getData()
                );
                fileUploadCallback.onReceiveValue(selection);
                fileUploadCallback = null;
            }
        );

        scannerLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (result.getResultCode() != RESULT_OK || result.getData() == null) return;
                String code = result.getData().getStringExtra(ScannerActivity.RESULT_CODE);
                if (code != null && !code.isBlank()) resolveScannedCode(code);
            }
        );
    }

    private void bindActions() {
        findViewById(R.id.connectButton).setOnClickListener(view -> connect(serverUrlInput.getText().toString()));
        findViewById(R.id.dashboardButton).setOnClickListener(view -> loadDashboard());
        findViewById(R.id.scanButton).setOnClickListener(view -> scannerLauncher.launch(new Intent(this, ScannerActivity.class)));
        findViewById(R.id.backButton).setOnClickListener(view -> navigateBack());
        findViewById(R.id.browserButton).setOnClickListener(view -> openExternal(Uri.parse(currentPageUrl())));
        findViewById(R.id.settingsButton).setOnClickListener(view -> showSettings());
    }

    private void connect(String rawUrl) {
        try {
            String normalized = normalizeServerUrl(rawUrl);
            serverUrl = normalized;
            apiBaseUrl = deriveApiBaseUrl(normalized);
            preferences.setServerUrl(normalized);
            setupError.setVisibility(View.GONE);
            setupPanel.setVisibility(View.GONE);
            browserPanel.setVisibility(View.VISIBLE);
            connectionLabel.setText(normalized);

            String current = webView.getUrl();
            if (current == null || !isInternal(Uri.parse(current))) loadDashboard();
        } catch (IllegalArgumentException error) {
            showSetup(error.getMessage() == null ? "Enter a valid server URL" : error.getMessage());
        }
    }

    private void showSetup(String error) {
        webView.stopLoading();
        browserPanel.setVisibility(View.GONE);
        setupPanel.setVisibility(View.VISIBLE);
        serverUrlInput.setText(preferences.getServerUrl());
        setupError.setText(error);
        setupError.setVisibility(error == null || error.isBlank() ? View.GONE : View.VISIBLE);
    }

    private String normalizeServerUrl(String rawUrl) {
        String candidate = rawUrl == null ? "" : rawUrl.trim();
        if (candidate.isEmpty()) throw new IllegalArgumentException("Enter the PhoneFlow app URL");
        if (!candidate.contains("://")) candidate = "http://" + candidate;
        candidate = candidate.replaceAll("/+$", "");

        Uri uri = Uri.parse(candidate);
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (host == null || host.isBlank() || (!("http".equalsIgnoreCase(scheme)) && !("https".equalsIgnoreCase(scheme)))) {
            throw new IllegalArgumentException("Use an HTTP or HTTPS PhoneFlow address");
        }
        if ("http".equalsIgnoreCase(scheme) && !isPrivateDevelopmentHost(host)) {
            throw new IllegalArgumentException("Public PhoneFlow servers must use HTTPS");
        }
        return candidate;
    }

    private boolean isPrivateDevelopmentHost(String host) {
        String value = host.toLowerCase(Locale.US);
        if (value.equals("localhost") || value.equals("10.0.2.2") || value.startsWith("127.")) return true;
        if (value.startsWith("10.") || value.startsWith("192.168.")) return true;
        if (!value.startsWith("172.")) return false;
        String[] parts = value.split("\\.");
        if (parts.length < 2) return false;
        try {
            int second = Integer.parseInt(parts[1]);
            return second >= 16 && second <= 31;
        } catch (NumberFormatException ignored) {
            return false;
        }
    }

    private String deriveApiBaseUrl(String appUrl) {
        Uri uri = Uri.parse(appUrl);
        if (uri.getPort() != 5173) return appUrl;
        String host = uri.getHost();
        String authority = host + ":5000";
        return uri.buildUpon().encodedAuthority(authority).path("").query(null).fragment(null).build().toString().replaceAll("/+$", "");
    }

    private void configureWebView(WebView target, boolean primary) {
        WebSettings settings = target.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(target, false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        target.addJavascriptInterface(new AndroidPrintBridge(target), "PhoneFlowAndroid");
        target.setWebViewClient(new InternalWebViewClient(primary));
        target.setWebChromeClient(new PhoneFlowChromeClient(primary));
        target.setDownloadListener(new PhoneFlowDownloadListener());
    }

    private void loadDashboard() {
        if (serverUrl.isBlank()) return;
        webView.loadUrl(serverUrl + "/dashboard");
    }

    private void navigateBack() {
        if (webView.canGoBack()) webView.goBack();
        else loadDashboard();
    }

    private String currentPageUrl() {
        String current = webView.getUrl();
        return current == null || current.isBlank() ? serverUrl : current;
    }

    private void showSettings() {
        String[] actions = {"Refresh", "Open in browser", "Clear signed-in session", "Change server"};
        new AlertDialog.Builder(this)
            .setTitle("PhoneFlow Android")
            .setItems(actions, (dialog, which) -> {
                if (which == 0) webView.reload();
                if (which == 1) openExternal(Uri.parse(currentPageUrl()));
                if (which == 2) clearWebSession();
                if (which == 3) {
                    preferences.clearServerUrl();
                    showSetup("");
                }
            })
            .setNegativeButton("Close", null)
            .show();
    }

    private void clearWebSession() {
        webView.evaluateJavascript(
            "try{localStorage.clear();sessionStorage.clear();}catch(e){}",
            ignored -> {
                CookieManager.getInstance().removeAllCookies(null);
                CookieManager.getInstance().flush();
                WebStorage.getInstance().deleteAllData();
                webView.clearCache(true);
                loadDashboard();
                toast("PhoneFlow session cleared");
            }
        );
    }

    private void resolveScannedCode(String code) {
        if (serverUrl.isBlank()) {
            showSetup("Connect to PhoneFlow before scanning");
            return;
        }

        toast("Looking up " + code + "…");
        webView.evaluateJavascript(
            "(function(){try{return localStorage.getItem('phoneflow_token')||'';}catch(e){return '';}})()",
            rawToken -> {
                String token = decodeJavascriptString(rawToken);
                if (token.isBlank()) {
                    toast("Sign in to PhoneFlow before scanning");
                    return;
                }
                PhoneFlowApi.lookupInventory(apiBaseUrl, token, code, new PhoneFlowApi.Callback() {
                    @Override
                    public void onSuccess(JSONObject item) {
                        showProductDialog(item);
                    }

                    @Override
                    public void onError(String message) {
                        toast(message);
                    }
                });
            }
        );
    }

    private String decodeJavascriptString(String rawValue) {
        if (rawValue == null || rawValue.equals("null")) return "";
        try {
            Object value = new JSONTokener(rawValue).nextValue();
            return value instanceof String ? (String) value : "";
        } catch (Exception ignored) {
            return "";
        }
    }

    private void showProductDialog(JSONObject item) {
        ScrollView scroll = new ScrollView(this);
        LinearLayout details = new LinearLayout(this);
        details.setOrientation(LinearLayout.VERTICAL);
        int padding = dp(18);
        details.setPadding(padding, padding, padding, dp(8));
        scroll.addView(details);

        addProductHeading(details, item.optString("name", "Unnamed product"));
        addDetail(details, "SKU / barcode", join(item.optString("sku"), item.optString("barcode")));
        addDetail(details, "Status", humanize(item.optString("status", "UNKNOWN")));
        addDetail(details, "Stock", String.valueOf(item.optInt("quantity", 0)));
        addDetail(details, "Sell price", formatMoney(item.optDouble("sellPrice", 0)));
        addDetail(details, "Brand / model", join(item.optString("brand"), item.optString("model")));
        addDetail(details, "Storage / color", join(item.optString("storage"), item.optString("color")));
        addDetail(details, "IMEI / serial", join(item.optString("imei1"), item.optString("serialNumber")));
        addDetail(details, "Notes", emptyFallback(item.optString("notes")));

        new AlertDialog.Builder(this)
            .setTitle("Product found")
            .setView(scroll)
            .setPositiveButton("Open stock", (dialog, which) -> webView.loadUrl(serverUrl + "/inventory"))
            .setNeutralButton("Scan again", (dialog, which) -> scannerLauncher.launch(new Intent(this, ScannerActivity.class)))
            .setNegativeButton("Close", null)
            .show();
    }

    private void addProductHeading(LinearLayout parent, String value) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(20);
        view.setTextColor(getColor(R.color.phoneflow_text));
        view.setTypeface(view.getTypeface(), android.graphics.Typeface.BOLD);
        view.setPadding(0, 0, 0, dp(10));
        parent.addView(view);
    }

    private void addDetail(LinearLayout parent, String label, String value) {
        TextView view = new TextView(this);
        view.setText(label + "\n" + emptyFallback(value));
        view.setTextSize(13);
        view.setTextColor(getColor(R.color.phoneflow_text));
        view.setPadding(0, dp(7), 0, dp(7));
        parent.addView(view);
    }

    private String join(String first, String second) {
        String left = first == null ? "" : first.trim();
        String right = second == null ? "" : second.trim();
        if (left.isEmpty()) return emptyFallback(right);
        if (right.isEmpty()) return left;
        return left + " · " + right;
    }

    private String emptyFallback(String value) {
        return value == null || value.trim().isEmpty() ? "Not recorded" : value.trim();
    }

    private String humanize(String value) {
        String normalized = value == null ? "" : value.replace('_', ' ').trim().toLowerCase(Locale.US);
        if (normalized.isEmpty()) return "Unknown";
        return Character.toUpperCase(normalized.charAt(0)) + normalized.substring(1);
    }

    private String formatMoney(double value) {
        return NumberFormat.getCurrencyInstance(Locale.US).format(value);
    }

    private boolean isInternal(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        if ("blob".equalsIgnoreCase(scheme) || "data".equalsIgnoreCase(scheme) || "about".equalsIgnoreCase(scheme)) return true;
        if (serverUrl.isBlank()) return false;
        Uri base = Uri.parse(serverUrl);
        return equalsIgnoreCase(base.getScheme(), uri.getScheme())
            && equalsIgnoreCase(base.getHost(), uri.getHost())
            && effectivePort(base) == effectivePort(uri);
    }

    private int effectivePort(Uri uri) {
        if (uri.getPort() >= 0) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private boolean equalsIgnoreCase(String left, String right) {
        return left != null && right != null && left.equalsIgnoreCase(right);
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            toast("No app can open this link");
        }
    }

    private void printWebView(WebView printable) {
        PrintManager manager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
        String jobName = "PhoneFlow-" + System.currentTimeMillis();
        PrintDocumentAdapter adapter = printable.createPrintDocumentAdapter(jobName);
        manager.print(jobName, adapter, new PrintAttributes.Builder().build());
    }

    private void openPopupWindow(Message resultMsg) {
        Dialog dialog = new Dialog(this, android.R.style.Theme_DeviceDefault_NoActionBar_Fullscreen);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(getColor(R.color.phoneflow_background));

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setPadding(dp(10), dp(6), dp(8), dp(6));

        TextView title = new TextView(this);
        title.setText("PhoneFlow document");
        title.setTextColor(getColor(R.color.phoneflow_text));
        title.setTextSize(15);
        title.setMaxLines(1);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, dp(48), 1));

        Button print = new Button(this);
        print.setText("Print");
        print.setAllCaps(false);
        toolbar.addView(print, new LinearLayout.LayoutParams(dp(86), dp(48)));

        Button close = new Button(this);
        close.setText("Close");
        close.setAllCaps(false);
        toolbar.addView(close, new LinearLayout.LayoutParams(dp(86), dp(48)));

        WebView child = new WebView(this);
        configureWebView(child, false);
        child.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onReceivedTitle(WebView view, String value) {
                title.setText(value == null || value.isBlank() ? "PhoneFlow document" : value);
            }

            @Override
            public void onCloseWindow(WebView window) {
                dialog.dismiss();
            }
        });

        root.addView(toolbar);
        root.addView(child, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        dialog.setContentView(root);
        dialog.setOnDismissListener(ignored -> child.destroy());
        close.setOnClickListener(view -> dialog.dismiss());
        print.setOnClickListener(view -> printWebView(child));
        dialog.show();

        WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
        transport.setWebView(child);
        resultMsg.sendToTarget();
    }

    private void injectAndroidBridge(WebView target) {
        target.evaluateJavascript(
            "(function(){window.PhoneFlowMobile=true;if(window.PhoneFlowAndroid){window.print=function(){PhoneFlowAndroid.print();};}})();",
            null
        );
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void toast(String message) {
        Toast.makeText(this, message == null || message.isBlank() ? "Something went wrong" : message, Toast.LENGTH_LONG).show();
    }

    @Override
    public void onBackPressed() {
        if (browserPanel.getVisibility() == View.VISIBLE && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (fileUploadCallback != null) {
            fileUploadCallback.onReceiveValue(null);
            fileUploadCallback = null;
        }
        webView.removeJavascriptInterface("PhoneFlowAndroid");
        webView.stopLoading();
        webView.destroy();
        super.onDestroy();
    }

    private final class InternalWebViewClient extends WebViewClient {
        private final boolean primary;

        private InternalWebViewClient(boolean primary) {
            this.primary = primary;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleNavigation(request.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleNavigation(Uri.parse(url));
        }

        private boolean handleNavigation(Uri uri) {
            String scheme = uri.getScheme();
            if (isInternal(uri)) return false;
            if ("tel".equalsIgnoreCase(scheme) || "mailto".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) {
                openExternal(uri);
                return true;
            }
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            if (primary) {
                pageProgress.setVisibility(View.VISIBLE);
                pageTitle.setText("Loading PhoneFlow…");
            }
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            injectAndroidBridge(view);
            if (primary) {
                pageProgress.setVisibility(View.GONE);
                String title = view.getTitle();
                pageTitle.setText(title == null || title.isBlank() ? "PhoneFlow" : title);
            }
        }

        @Override
        public void onReceivedError(
            WebView view,
            @NonNull WebResourceRequest request,
            @NonNull WebResourceError error
        ) {
            if (primary && request.isForMainFrame()) {
                pageProgress.setVisibility(View.GONE);
                toast("Unable to load PhoneFlow. Check the server and Wi-Fi connection.");
            }
        }
    }

    private final class PhoneFlowChromeClient extends WebChromeClient {
        private final boolean primary;

        private PhoneFlowChromeClient(boolean primary) {
            this.primary = primary;
        }

        @Override
        public void onProgressChanged(WebView view, int progress) {
            if (!primary) return;
            pageProgress.setProgress(progress);
            pageProgress.setVisibility(progress >= 100 ? View.GONE : View.VISIBLE);
        }

        @Override
        public void onReceivedTitle(WebView view, String title) {
            if (primary && title != null && !title.isBlank()) pageTitle.setText(title);
        }

        @Override
        public boolean onShowFileChooser(
            WebView view,
            ValueCallback<Uri[]> callback,
            FileChooserParams params
        ) {
            if (fileUploadCallback != null) fileUploadCallback.onReceiveValue(null);
            fileUploadCallback = callback;

            Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            picker.addCategory(Intent.CATEGORY_OPENABLE);
            picker.setType("*/*");
            picker.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                "image/jpeg",
                "image/png",
                "image/webp",
                "application/pdf"
            });
            picker.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            filePickerLauncher.launch(picker);
            return true;
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
            openPopupWindow(resultMsg);
            return true;
        }
    }

    private final class PhoneFlowDownloadListener implements DownloadListener {
        @Override
        public void onDownloadStart(
            String url,
            String userAgent,
            String contentDisposition,
            String mimeType,
            long contentLength
        ) {
            if (url == null || url.startsWith("blob:") || url.startsWith("data:")) {
                toast("Open this document in the PhoneFlow preview, then use Print or Share");
                return;
            }
            try {
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setMimeType(mimeType);
                request.addRequestHeader("User-Agent", userAgent);
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) request.addRequestHeader("Cookie", cookies);
                request.setTitle(URLUtil.guessFileName(url, contentDisposition, mimeType));
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setAllowedOverMetered(true);
                request.setAllowedOverRoaming(false);

                String filename = URLUtil.guessFileName(url, contentDisposition, mimeType);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
                } else {
                    request.setDestinationInExternalFilesDir(MainActivity.this, Environment.DIRECTORY_DOWNLOADS, filename);
                }

                DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                manager.enqueue(request);
                toast("Download started");
            } catch (Exception error) {
                toast("Unable to download this file");
            }
        }
    }

    private final class AndroidPrintBridge {
        private final WeakReference<WebView> printable;

        private AndroidPrintBridge(WebView printable) {
            this.printable = new WeakReference<>(printable);
        }

        @JavascriptInterface
        public void print() {
            runOnUiThread(() -> {
                WebView target = printable.get();
                if (target != null) printWebView(target);
            });
        }
    }
}
