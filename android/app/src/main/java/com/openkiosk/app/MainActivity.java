package com.openkiosk.app;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private Handler relaunchHandler = new Handler(Looper.getMainLooper());
    private static final int RELAUNCH_DELAY_MS = 500;
    
    // Throttle para evitar ANR - controla tempo mínimo entre chamadas de bringAppToFront
    private long lastBringToFrontTime = 0;
    private static final long BRING_TO_FRONT_THROTTLE_MS = 2000; // 2 segundos entre chamadas

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Registrar plugin KioskMode antes do super.onCreate
        registerPlugin(KioskModePlugin.class);
        
        super.onCreate(savedInstanceState);
        enableImmersiveMode();
        enableKioskProtections();
    }

    @Override
    public void onResume() {
        super.onResume();
        enableImmersiveMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enableImmersiveMode();
        } else {
            // Se perder foco, tentar retomar imediatamente
            relaunchHandler.postDelayed(this::bringAppToFront, RELAUNCH_DELAY_MS);
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Re-lançar app se for para background
        relaunchHandler.postDelayed(this::bringAppToFront, RELAUNCH_DELAY_MS);
    }

    @Override
    public void onStop() {
        super.onStop();
        // Último recurso: tentar voltar ao foreground
        relaunchHandler.postDelayed(this::bringAppToFront, RELAUNCH_DELAY_MS);
    }

    @Override
    public void onBackPressed() {
        // Bloquear botão voltar completamente - não chamar super
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
}
