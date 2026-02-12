package com.openkiosk.app;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin Capacitor para controlar o modo Kiosk (Lock Task) do Android
 * Permite que o JavaScript inicie/pare o Lock Task Mode
 *
 * AND-01: exitLockTask agora exige PIN de manutenção para evitar saída não-autorizada.
 */
@CapacitorPlugin(name = "KioskMode")
public class KioskModePlugin extends Plugin {

    // AND-01 + AND-03: PIN via BuildConfig — override via gradle.properties ou CI
    private static final String MAINTENANCE_PIN = BuildConfig.MAINTENANCE_PIN;

    /**
     * Sair do Lock Task Mode (modo kiosk)
     * AND-01: Exige PIN de manutenção para autorizar saída
     */
    @PluginMethod
    public void exitLockTask(PluginCall call) {
        String pin = call.getString("pin", "");
        if (!MAINTENANCE_PIN.equals(pin)) {
            call.reject("PIN de manutenção inválido");
            return;
        }

        Activity activity = getActivity();
        
        if (activity == null) {
            call.reject("Activity não disponível");
            return;
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                activity.stopLockTask();
                call.resolve();
            } else {
                call.reject("Lock Task não suportado nesta versão do Android");
            }
        } catch (Exception e) {
            call.reject("Erro ao sair do Lock Task: " + e.getMessage());
        }
    }

    /**
     * Iniciar Lock Task Mode (modo kiosk)
     * Chamado para bloquear o dispositivo no app
     */
    @PluginMethod
    public void startLockTask(PluginCall call) {
        Activity activity = getActivity();
        
        if (activity == null) {
            call.reject("Activity não disponível");
            return;
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                activity.startLockTask();
                call.resolve();
            } else {
                call.reject("Lock Task não suportado nesta versão do Android");
            }
        } catch (Exception e) {
            call.reject("Erro ao iniciar Lock Task: " + e.getMessage());
        }
    }

    /**
     * Verificar se está em Lock Task Mode
     */
    @PluginMethod
    public void isInLockTaskMode(PluginCall call) {
        Activity activity = getActivity();
        
        if (activity == null) {
            call.reject("Activity não disponível");
            return;
        }

        try {
            boolean isLocked = false;
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                ActivityManager activityManager = (ActivityManager) activity.getSystemService(Context.ACTIVITY_SERVICE);
                if (activityManager != null) {
                    int lockTaskMode = activityManager.getLockTaskModeState();
                    isLocked = lockTaskMode != ActivityManager.LOCK_TASK_MODE_NONE;
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                ActivityManager activityManager = (ActivityManager) activity.getSystemService(Context.ACTIVITY_SERVICE);
                if (activityManager != null) {
                    isLocked = activityManager.isInLockTaskMode();
                }
            }
            
            JSObject ret = new JSObject();
            ret.put("locked", isLocked);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Erro ao verificar Lock Task: " + e.getMessage());
        }
    }
}
