package com.openkiosk.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class KioskLifecycleReceiver extends BroadcastReceiver {
    private static final String TAG = "KioskLifecycleReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        Log.i(TAG, "System event received: " + action);
        KioskDiagnosticsStore.recordSystemEvent(context, action);
        KioskDiagnosticsStore.recordCurrentWebViewPackage(context);
    }
}
