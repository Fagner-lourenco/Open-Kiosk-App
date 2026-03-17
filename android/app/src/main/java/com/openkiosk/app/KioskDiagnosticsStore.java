package com.openkiosk.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.util.Log;
import android.webkit.WebView;

final class KioskDiagnosticsStore {
    private static final String TAG = "KioskDiagnostics";
    private static final String PREFS_NAME = "kiosk_diagnostics";
    private static final String KEY_PROCESS_ACTIVE = "process_active";
    private static final String KEY_LAST_START_AT = "last_start_at";
    private static final String KEY_LAST_CLEAN_EXIT_REASON = "last_clean_exit_reason";
    private static final String KEY_LAST_SYSTEM_EVENT_ACTION = "last_system_event_action";
    private static final String KEY_LAST_SYSTEM_EVENT_AT = "last_system_event_at";
    private static final String KEY_LAST_UNEXPECTED_EXIT_DETECTED = "last_unexpected_exit_detected";
    private static final String KEY_LAST_UNEXPECTED_EXIT_REASON = "last_unexpected_exit_reason";
    private static final String KEY_WEBVIEW_PACKAGE = "webview_package";
    private static final String KEY_WEBVIEW_VERSION = "webview_version";

    private KioskDiagnosticsStore() {
    }

    static void beginProcessSession(Context context) {
        SharedPreferences preferences = preferences(context);
        boolean wasProcessActive = preferences.getBoolean(KEY_PROCESS_ACTIVE, false);
        String lastSystemEventAction = emptyToNull(preferences.getString(KEY_LAST_SYSTEM_EVENT_ACTION, null));
        boolean unexpectedExitDetected = wasProcessActive && lastSystemEventAction == null;

        SharedPreferences.Editor editor = preferences.edit();
        editor.putBoolean(KEY_LAST_UNEXPECTED_EXIT_DETECTED, unexpectedExitDetected);
        if (unexpectedExitDetected) {
            editor.putString(KEY_LAST_UNEXPECTED_EXIT_REASON, "process_was_active_on_next_start");
        } else if (lastSystemEventAction != null) {
            editor.putString(KEY_LAST_UNEXPECTED_EXIT_REASON, "suppressed_by_" + lastSystemEventAction);
        } else {
            editor.remove(KEY_LAST_UNEXPECTED_EXIT_REASON);
        }

        editor.putBoolean(KEY_PROCESS_ACTIVE, true);
        editor.putLong(KEY_LAST_START_AT, System.currentTimeMillis());
        editor.remove(KEY_LAST_SYSTEM_EVENT_ACTION);
        editor.remove(KEY_LAST_SYSTEM_EVENT_AT);
        editor.apply();
    }

    static void markProcessEnded(Context context, String reason) {
        SharedPreferences.Editor editor = preferences(context).edit();
        editor.putBoolean(KEY_PROCESS_ACTIVE, false);
        if (emptyToNull(reason) != null) {
            editor.putString(KEY_LAST_CLEAN_EXIT_REASON, reason);
        } else {
            editor.remove(KEY_LAST_CLEAN_EXIT_REASON);
        }
        editor.apply();
    }

    static void recordSystemEvent(Context context, String action) {
        SharedPreferences.Editor editor = preferences(context).edit();
        editor.putBoolean(KEY_PROCESS_ACTIVE, false);
        editor.putString(KEY_LAST_SYSTEM_EVENT_ACTION, emptyToNull(action));
        editor.putLong(KEY_LAST_SYSTEM_EVENT_AT, System.currentTimeMillis());
        editor.apply();
    }

    static void recordCurrentWebViewPackage(Context context) {
        SharedPreferences.Editor editor = preferences(context).edit();

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            editor.remove(KEY_WEBVIEW_PACKAGE);
            editor.remove(KEY_WEBVIEW_VERSION);
            editor.apply();
            return;
        }

        try {
            PackageInfo packageInfo = WebView.getCurrentWebViewPackage();
            if (packageInfo == null) {
                editor.remove(KEY_WEBVIEW_PACKAGE);
                editor.remove(KEY_WEBVIEW_VERSION);
            } else {
                editor.putString(KEY_WEBVIEW_PACKAGE, emptyToNull(packageInfo.packageName));
                editor.putString(KEY_WEBVIEW_VERSION, emptyToNull(packageInfo.versionName));
            }
            editor.apply();
        } catch (Exception e) {
            Log.w(TAG, "Unable to inspect WebView provider", e);
            editor.remove(KEY_WEBVIEW_PACKAGE);
            editor.remove(KEY_WEBVIEW_VERSION);
            editor.apply();
        }
    }

    static boolean wasLastUnexpectedExitDetected(Context context) {
        return preferences(context).getBoolean(KEY_LAST_UNEXPECTED_EXIT_DETECTED, false);
    }

    static String getLastUnexpectedExitReason(Context context) {
        return emptyToNull(preferences(context).getString(KEY_LAST_UNEXPECTED_EXIT_REASON, null));
    }

    static String getLastSystemEventAction(Context context) {
        return emptyToNull(preferences(context).getString(KEY_LAST_SYSTEM_EVENT_ACTION, null));
    }

    static String getWebViewPackageName(Context context) {
        return emptyToNull(preferences(context).getString(KEY_WEBVIEW_PACKAGE, null));
    }

    static String getWebViewVersion(Context context) {
        return emptyToNull(preferences(context).getString(KEY_WEBVIEW_VERSION, null));
    }

    private static SharedPreferences preferences(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private static String emptyToNull(String value) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
