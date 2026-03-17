package com.openkiosk.app;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;
import androidx.appcompat.app.AlertDialog;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    private Handler relaunchHandler = new Handler(Looper.getMainLooper());
    private static final int RELAUNCH_DELAY_MS = 500;
    // Evita bring-to-front durante diálogos do sistema (ex.: permissão USB),
    // mantendo relaunch agressivo apenas quando usuário tenta sair do app.
    private volatile boolean userInitiatedLeave = false;
    
    // Throttle para evitar ANR - controla tempo mínimo entre chamadas de bringAppToFront
    private long lastBringToFrontTime = 0;
    private static final long BRING_TO_FRONT_THROTTLE_MS = 2000; // 2 segundos entre chamadas
    private long suppressLeaveHandlingUntilMs = 0;
    private boolean restoreLockTaskOnResume = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Registrar plugin KioskMode antes do super.onCreate
        registerPlugin(KioskModePlugin.class);
        // Registrar plugin PlugPagTerminal (PlugPag SDK 4.11.0)
        registerPlugin(PlugPagTerminalPlugin.class);
        KioskDiagnosticsStore.beginProcessSession(this);
        
        try {
            super.onCreate(savedInstanceState);
        } catch (RuntimeException e) {
            // Captura falha crítica ao inicializar WebView (ex: "Package not found: com.google.android.webview").
            // Em dispositivos sem um WebView provider instalado o app crasha durante a criação do WebView.
            String msg = e.getMessage() != null ? e.getMessage() : (e.getCause() != null ? e.getCause().getMessage() : "");
            if (msg.contains("Package not found") || msg.toLowerCase().contains("webview")) {
                // Mostrar diálogo amigável e encerrar a activity.
                new AlertDialog.Builder(this)
                    .setTitle("Componente WebView ausente")
                    .setMessage("O componente WebView do sistema não foi encontrado. Instale o 'Android System WebView' (ou Google WebView) e reinicie o aplicativo.")
                    .setCancelable(false)
                    .setPositiveButton("OK", (d, w) -> finish())
                    .show();
                return;
            }
            throw e;
        }
        KioskDiagnosticsStore.recordCurrentWebViewPackage(this);
        logStartupDiagnostics();
        enableImmersiveMode();
        enableKioskProtections();
    }

    @Override
    public void onResume() {
        super.onResume();
        userInitiatedLeave = false;
        suppressLeaveHandlingUntilMs = 0;
        KioskDiagnosticsStore.recordCurrentWebViewPackage(this);
        enableImmersiveMode();
        restoreLockTaskIfNeeded("onResume");
    }

    @Override
    public void onDestroy() {
        if (isFinishing() && !isChangingConfigurations()) {
            KioskDiagnosticsStore.markProcessEnded(this, "activity_destroyed");
        }
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enableImmersiveMode();
        } else if (userInitiatedLeave && !shouldSuppressUserLeaveHandling()) {
            // Se perder foco, tentar retomar imediatamente
            relaunchHandler.postDelayed(this::bringAppToFront, RELAUNCH_DELAY_MS);
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Re-lançar app se o usuário tentar sair para background
        if (userInitiatedLeave && !shouldSuppressUserLeaveHandling()) {
            relaunchHandler.postDelayed(this::bringAppToFront, RELAUNCH_DELAY_MS);
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        // Último recurso quando saída foi iniciada pelo usuário
        if (userInitiatedLeave && !shouldSuppressUserLeaveHandling()) {
            relaunchHandler.postDelayed(this::bringAppToFront, RELAUNCH_DELAY_MS);
        }
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (shouldSuppressUserLeaveHandling()) {
            Log.i(TAG, "Ignoring onUserLeaveHint during expected system dialog");
            return;
        }
        userInitiatedLeave = true;
        relaunchHandler.postDelayed(this::bringAppToFront, RELAUNCH_DELAY_MS);
    }

    @Override
    public void onBackPressed() {
        // Bloquear botão voltar completamente - não chamar super
    }

    public void suppressUserLeaveHandling(long durationMs) {
        long deadline = System.currentTimeMillis() + Math.max(durationMs, 0);
        suppressLeaveHandlingUntilMs = Math.max(suppressLeaveHandlingUntilMs, deadline);
        Log.i(TAG, "Suppressing kiosk relaunch while a system dialog is expected");
    }

    public synchronized boolean suspendLockTaskForExternalFlow(long durationMs) {
        suppressUserLeaveHandling(durationMs);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            restoreLockTaskOnResume = false;
            return false;
        }

        if (!isInLockTaskModeInternal()) {
            restoreLockTaskOnResume = false;
            return false;
        }

        try {
            stopLockTask();
            restoreLockTaskOnResume = true;
            Log.i(TAG, "Lock task suspended for external authentication flow");
            return true;
        } catch (Exception e) {
            Log.w(TAG, "Unable to suspend lock task for external flow", e);
            restoreLockTaskOnResume = false;
            return false;
        }
    }

    public synchronized void restoreLockTaskIfNeeded(String reason) {
        if (!restoreLockTaskOnResume || Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            return;
        }

        if (isInLockTaskModeInternal()) {
            restoreLockTaskOnResume = false;
            return;
        }

        try {
            startLockTask();
            restoreLockTaskOnResume = false;
            Log.i(TAG, "Lock task restored after external flow: " + reason);
        } catch (Exception e) {
            Log.w(TAG, "Unable to restore lock task yet: " + reason, e);
        }
    }

    private boolean shouldSuppressUserLeaveHandling() {
        return System.currentTimeMillis() < suppressLeaveHandlingUntilMs;
    }

    private boolean isInLockTaskModeInternal() {
        ActivityManager activityManager = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        if (activityManager == null) {
            return false;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return activityManager.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            return activityManager.isInLockTaskMode();
        }

        return false;
    }

    public boolean isDefaultHomeApp() {
        Intent homeIntent = new Intent(Intent.ACTION_MAIN);
        homeIntent.addCategory(Intent.CATEGORY_HOME);

        PackageManager packageManager = getPackageManager();
        ResolveInfo resolveInfo;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            resolveInfo = packageManager.resolveActivity(
                homeIntent,
                PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_DEFAULT_ONLY)
            );
        } else {
            resolveInfo = packageManager.resolveActivity(homeIntent, PackageManager.MATCH_DEFAULT_ONLY);
        }

        if (resolveInfo == null || resolveInfo.activityInfo == null) {
            return false;
        }

        return getPackageName().equals(resolveInfo.activityInfo.packageName);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // Bloquear teclas de sistema
        switch (keyCode) {
            case KeyEvent.KEYCODE_HOME:
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_MENU:
            case KeyEvent.KEYCODE_APP_SWITCH:
                return true; // Consumir evento, não propagar
            default:
                return super.onKeyDown(keyCode, event);
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // Bloquear teclas de sistema no dispatch também
        int keyCode = event.getKeyCode();
        if (keyCode == KeyEvent.KEYCODE_HOME ||
            keyCode == KeyEvent.KEYCODE_APP_SWITCH ||
            keyCode == KeyEvent.KEYCODE_MENU) {
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    private void enableKioskProtections() {
        Window window = getWindow();

        // Manter tela sempre ligada
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Mostrar sobre tela de bloqueio
        window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
        window.addFlags(WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }

        // NOTA: startLockTask() não é chamado aqui.
        // O modo kiosk é controlado via plugin Capacitor a partir do JS
        // (kioskModeService). Use enterKioskMode() quando apropriado
        // (ex.: após setup concluído ou via Admin Settings).
    }

    private void bringAppToFront() {
        // Throttle para evitar ANR - não executar se chamado muito recentemente
        long currentTime = System.currentTimeMillis();
        if (currentTime - lastBringToFrontTime < BRING_TO_FRONT_THROTTLE_MS) {
            return; // Ignorar chamada muito frequente
        }
        lastBringToFrontTime = currentTime;
        
        try {
            ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            if (am != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                // Mover nossa task para frente
                am.moveTaskToFront(getTaskId(), ActivityManager.MOVE_TASK_WITH_HOME);
            }

            // Fallback: relançar activity
            Intent intent = new Intent(this, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK |
                           Intent.FLAG_ACTIVITY_REORDER_TO_FRONT |
                           Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(intent);
        } catch (Exception e) {
            // Ignorar erros de permissão
        }
    }

    private void enableImmersiveMode() {
        Window window = getWindow();
        View decorView = window.getDecorView();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController insetsController = window.getInsetsController();
            if (insetsController != null) {
                insetsController.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                insetsController.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
            WindowCompat.setDecorFitsSystemWindows(window, false);
        } else {
            int flags = View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN;
            decorView.setSystemUiVisibility(flags);
        }

        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
    }

    private void logStartupDiagnostics() {
        Log.i(
            TAG,
            "Startup diagnostics: isDefaultHome=" + isDefaultHomeApp()
                + ", lockTaskEnabled=" + isInLockTaskModeInternal()
                + ", webViewPackage=" + safeString(KioskDiagnosticsStore.getWebViewPackageName(this))
                + ", webViewVersion=" + safeString(KioskDiagnosticsStore.getWebViewVersion(this))
                + ", lastUnexpectedExitDetected=" + KioskDiagnosticsStore.wasLastUnexpectedExitDetected(this)
                + ", lastUnexpectedExitReason=" + safeString(KioskDiagnosticsStore.getLastUnexpectedExitReason(this))
        );
    }

    private String safeString(String value) {
        return value != null ? value : "null";
    }
}
