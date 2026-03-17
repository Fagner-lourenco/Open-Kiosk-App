package com.openkiosk.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PermissionState;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import br.com.uol.pagseguro.plugpag.PlugPag;
import br.com.uol.pagseguro.plugpag.PlugPagAbortResult;
import br.com.uol.pagseguro.plugpag.PlugPagActivationData;
import br.com.uol.pagseguro.plugpag.PlugPagAppIdentification;
import br.com.uol.pagseguro.plugpag.PlugPagAuthenticationListener;
import br.com.uol.pagseguro.plugpag.PlugPagDevice;
import br.com.uol.pagseguro.plugpag.PlugPagEventData;
import br.com.uol.pagseguro.plugpag.PlugPagEventListener;
import br.com.uol.pagseguro.plugpag.PlugPagInitializationResult;
import br.com.uol.pagseguro.plugpag.PlugPagPaymentData;
import br.com.uol.pagseguro.plugpag.PlugPagTransactionResult;
import br.com.uol.pagseguro.plugpag.PlugPagVoidData;
import br.com.uol.pagseguro.plugpag.exception.input.PlugPagInvalidDeviceIdentificationException;

/**
 * PlugPagTerminalPlugin — Full integration with PagBank PlugPag SDK 4.12.x
 *
 * <p>Capacitor bridge for card-present payments via Bluetooth Classic terminal.
 *
 * <p>Security invariants:
 *   - PAN/CVV/track data NEVER cross the bridge.
 *   - Only allowlisted fields returned to JS (see {@link #buildSafeResult}).
 *   - holderName is PII — returned only if needed; callers must mask before persist.
 *   - No sensitive data in logs.
 *
 * <p>Thread model:
 *   - All PlugPag SDK calls run on a single-thread executor (blocking I/O).
 *   - Capacitor plugin methods are non-blocking on the WebView thread.
 *   - Events are dispatched to JS via notifyListeners().
 */
@CapacitorPlugin(
    name = "PlugPagTerminal",
    permissions = {
        @Permission(
            alias = "bluetooth",
            strings = {
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN
            }
        ),
        @Permission(
            alias = "phoneState",
            strings = {
                Manifest.permission.READ_PHONE_STATE
            }
        ),
        @Permission(
            alias = "mediaAudio",
            strings = {
                Manifest.permission.READ_MEDIA_AUDIO
            }
        ),
        @Permission(
            alias = "storageLegacy",
            strings = {
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            }
        )
    }
)
public class PlugPagTerminalPlugin extends Plugin {
    private static final String TAG = "PlugPagTerminal";
    private static final long INTERACTIVE_AUTH_TIMEOUT_MS = 180_000;

    // Single-thread executor — PlugPag SDK is NOT thread-safe
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private PlugPag plugPag;
    private boolean btConnected = false;
    private String connectedDeviceId;
    private String storedActivationCode;

    // =========================================================================
    // Lifecycle
    // =========================================================================

    /**
     * Initialize PlugPag SDK instance (does NOT connect yet).
     * Must be called once before any other method.
     *
     * Params: appName (string), appVersion (string)
     */
    @PluginMethod()
    public void initialize(PluginCall call) {
        String appName = call.getString("appName", "OpenKiosk");
        String appVersion = call.getString("appVersion", "1.0.0");

        Log.i(TAG, "initialize: app=" + appName + "/" + appVersion);

        try {
            // SDK 4.12.x: construtor aceita apenas Context
            // Demo oficial usa Application Context (singleton). NÃO usar Activity context.
            Context appContext = getContext().getApplicationContext();
            plugPag = new PlugPag(new PlugPagCompatContext(appContext));

            // Registrar identificação do app via setVersionName (doc: max 25 + 10 chars)
            plugPag.setVersionName(appName, appVersion);

            // Set event listener for SDK state changes
            plugPag.setEventListener(new PlugPagEventListener() {
                @Override
                public int onEvent(PlugPagEventData eventData) {
                    JSObject evt = new JSObject();
                    evt.put("eventCode", eventData.getEventCode());
                    evt.put("message", eventData.getCustomMessage());
                    notifyListeners("plugpagEvent", evt);
                    return PlugPag.RET_OK;
                }
            });

            JSObject ret = new JSObject();
            ret.put("initialized", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "initialize failed", e);
            call.reject("Falha ao inicializar PlugPag: " + e.getMessage(), "INIT_ERROR");
        }
    }

    // =========================================================================
    // Permissions
    // =========================================================================

    /**
     * Request Bluetooth permissions (Android 12+).
     * On older APIs, permissions are granted at install time.
     */
    @PluginMethod()
    public void requestPermissions(PluginCall call) {
        List<String> aliasesToRequest = new ArrayList<>();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && getPermissionState("bluetooth") != PermissionState.GRANTED) {
            aliasesToRequest.add("bluetooth");
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && getPermissionState("phoneState") != PermissionState.GRANTED) {
            aliasesToRequest.add("phoneState");
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("mediaAudio") != PermissionState.GRANTED) {
            aliasesToRequest.add("mediaAudio");
        } else if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU &&
            getPermissionState("storageLegacy") != PermissionState.GRANTED
        ) {
            aliasesToRequest.add("storageLegacy");
        }

        if (aliasesToRequest.isEmpty()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }

        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).suppressUserLeaveHandling(10000);
        }

        requestPermissionForAliases(aliasesToRequest.toArray(new String[0]), call, "plugPagPermissionCallback");
    }

    @PermissionCallback
    private void plugPagPermissionCallback(PluginCall call) {
        boolean granted = hasPlugPagRuntimePermissions();
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        if (!granted) {
            ret.put("message", "Permissão Bluetooth negada. Vá em Configurações para habilitar.");
        }
        call.resolve(ret);
    }

    /**
     * Open device Bluetooth settings (for pairing).
     */
    @PluginMethod()
    public void openBluetoothSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("opened", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Não foi possível abrir configurações BT", "BT_SETTINGS_ERROR");
        }
    }

    // =========================================================================
    // Connection
    // =========================================================================

    /**
     * Connect to the terminal via Bluetooth Classic.
     *
     * Params: deviceId (string) — PlugPag terminal identifier e.g. "PRO-1733203195" or legacy BT MAC
     */
    @PluginMethod()
    public void connect(PluginCall call) {
        if (!assertInitialized(call)) return;
        if (!assertRuntimePermissions(call)) return;

        String deviceId = call.getString("deviceId", "");
        if (deviceId == null || deviceId.isEmpty()) {
            call.reject("deviceId (identificador do terminal) é obrigatório", "INVALID_DEVICE");
            return;
        }

        String activationCode = call.getString("activationCode", null);
        if (activationCode != null && !activationCode.trim().isEmpty()) {
            storedActivationCode = activationCode.trim();
            Log.i(TAG, "connect: activationCode stored (len=" + storedActivationCode.length() + ")");
        }

        Log.i(TAG, "connect: deviceId=" + deviceId + " hasActivationCode=" + (storedActivationCode != null));

        executor.execute(() -> {
            try {
                BtInitResult btInit = initBtConnection(deviceId, false);
                int result = btInit.code;

                if (result == PlugPag.RET_OK) {
                    btConnected = true;
                    connectedDeviceId = btInit.connectedIdentifier != null ? btInit.connectedIdentifier : deviceId;

                    // Verificar auth state após BT connect
                    // Token é populado via requestAuthentication (login interativo PagBank)
                    // Demo oficial: requestAuthentication → onSuccess → token salvo localmente
                    boolean postConnectAuth = false;
                    try { postConnectAuth = plugPag.isAuthenticated(); } catch (Exception ignored) {}
                    Log.i(TAG, "BT connected successfully with mode=" + btInit.mode
                        + " isAuthenticated-postConnect=" + postConnectAuth);

                    JSObject ret = new JSObject();
                    ret.put("connected", true);
                    ret.put("authenticated", postConnectAuth);
                    ret.put("deviceId", connectedDeviceId);
                    ret.put("requestedDeviceId", deviceId);
                    ret.put("mode", btInit.mode);
                    ret.put("resolvedBluetoothAddress", safeString(btInit.resolvedBluetoothAddress));
                    ret.put("resolvedBluetoothName", safeString(btInit.resolvedBluetoothName));
                    ret.put("diagnostics", btInit.diagnostics);
                    call.resolve(ret);

                    JSObject connEvt = new JSObject();
                    connEvt.put("status", "connected");
                    connEvt.put("deviceId", connectedDeviceId);
                    connEvt.put("requestedDeviceId", deviceId);
                    connEvt.put("mode", btInit.mode);
                    connEvt.put("resolvedBluetoothAddress", safeString(btInit.resolvedBluetoothAddress));
                    connEvt.put("resolvedBluetoothName", safeString(btInit.resolvedBluetoothName));
                    connEvt.put("diagnostics", btInit.diagnostics);
                    notifyListeners("plugpagConnection", connEvt);
                } else {
                    btConnected = false;
                    String message = buildBtConnectErrorMessageSafe(result, btInit.diagnostics);
                    Log.w(TAG, "connect failed: result=" + result + " diagnostics=" + btInit.diagnostics);
                    JSObject preRejectConnEvt = new JSObject();
                    preRejectConnEvt.put("status", "error");
                    preRejectConnEvt.put("deviceId", deviceId);
                    preRejectConnEvt.put("code", result);
                    preRejectConnEvt.put("message", message);
                    preRejectConnEvt.put("mode", btInit.mode);
                    preRejectConnEvt.put("diagnostics", btInit.diagnostics);
                    notifyListeners("plugpagConnection", preRejectConnEvt);
                    if (message != null) {
                        call.reject(message, "BT_CONNECT_ERROR");
                        return;
                    }
                    call.reject("Falha na conexão BT (código: " + result + ")", "BT_CONNECT_ERROR");

                    JSObject connEvt = new JSObject();
                    connEvt.put("status", "error");
                    connEvt.put("deviceId", deviceId);
                    connEvt.put("code", result);
                    connEvt.put("message", message);
                    connEvt.put("mode", btInit.mode);
                    connEvt.put("diagnostics", btInit.diagnostics);
                    notifyListeners("plugpagConnection", connEvt);
                }
            } catch (Exception e) {
                Log.e(TAG, "connect exception", e);
                btConnected = false;
                call.reject("Exceção ao conectar BT: " + e.getMessage(), "BT_CONNECT_EXCEPTION");
            }
        });
    }

    /**
     * Disconnect from the terminal.
     * Calls the real SDK disconnect to release BT resources.
     */
    @PluginMethod()
    public void disconnect(PluginCall call) {
        Log.i(TAG, "disconnect");

        executor.execute(() -> {
            // PlugPag 4.12.x não expõe disconnect() — SDK gerencia ciclo de vida BT internamente.
            // Ref: demo oficial pagseguro/plugpag não chama disconnect().
            // Basta limpar flags locais; próximo pagamento reconecta via initBTConnection().
            if (plugPag != null) {
                Log.i(TAG, "Clearing local BT state (SDK manages connection lifecycle)");
            }

            btConnected = false;
            connectedDeviceId = null;

            JSObject ret = new JSObject();
            ret.put("disconnected", true);
            call.resolve(ret);

            JSObject connEvt = new JSObject();
            connEvt.put("status", "disconnected");
            notifyListeners("plugpagConnection", connEvt);
        });
    }

    // =========================================================================
    // Authentication
    // =========================================================================

    /**
     * Check if terminal is authenticated (activated with PagBank).
     */
    @PluginMethod()
    public void isAuthenticated(PluginCall call) {
        if (!assertInitialized(call)) return;

        executor.execute(() -> {
            try {
                boolean auth = plugPag.isAuthenticated();
                JSObject ret = new JSObject();
                ret.put("authenticated", auth);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "isAuthenticated exception", e);
                call.reject("Erro ao verificar autenticação: " + e.getMessage(), "AUTH_CHECK_ERROR");
            }
        });
    }

    /**
     * Request authentication (activation) with PagBank.
     *
     * Params: activationCode (string) — código de ativação do PagBank
     */
    @PluginMethod()
    public void requestAuthentication(PluginCall call) {
        if (!assertInitialized(call)) return;

        String activationCode = call.getString("activationCode", "");
        if (activationCode == null || activationCode.isEmpty()) {
            call.reject("activationCode é obrigatório", "INVALID_ACTIVATION");
            return;
        }

        Log.i(TAG, "requestAuthentication: starting activation flow with activationCode (len=" + activationCode.length() + ")");
        Log.i(TAG, "requestAuthentication: calling initializeAndActivatePinpad...(isAuthenticated pre-call=" + (plugPag != null ? plugPag.isAuthenticated() : "null") + ")");

        executor.execute(() -> {
            try {
                Log.i(TAG, "requestAuthentication: btConnected=" + btConnected + " connectedDeviceId=" + safeString(connectedDeviceId));
                PlugPagActivationData activationData = new PlugPagActivationData(activationCode);
                Log.i(TAG, "requestAuthentication: calling initializeAndActivatePinpad NOW...");
                PlugPagInitializationResult result = plugPag.initializeAndActivatePinpad(activationData);

                int resultCode = result.getResult();
                String errorMsg = result.getErrorMessage() != null ? result.getErrorMessage() : "(null)";
                String errorCode = safeString(result.getErrorCode());
                boolean postAuth = false;
                try { postAuth = plugPag.isAuthenticated(); } catch (Exception ignored) {}

                Log.i(TAG, "requestAuthentication: initializeAndActivatePinpad returned:"
                    + " resultCode=" + resultCode
                    + " errorMsg=" + errorMsg
                    + " errorCode=" + errorCode
                    + " isAuthenticated-post=" + postAuth);

                if (resultCode == PlugPag.RET_OK && postAuth) {
                    Log.i(TAG, "Authentication successful (code + postAuth confirmed)");
                    JSObject ret = new JSObject();
                    ret.put("authenticated", true);
                    call.resolve(ret);

                    JSObject authEvt = new JSObject();
                    authEvt.put("status", "authenticated");
                    notifyListeners("plugpagAuth", authEvt);
                } else {
                    Log.w(TAG, "Authentication NOT confirmed: resultCode=" + resultCode + " postAuth=" + postAuth + " errorMsg=" + errorMsg);
                    JSObject ret = new JSObject();
                    ret.put("authenticated", false);
                    ret.put("resultCode", resultCode);
                    ret.put("errorCode", errorCode);
                    ret.put("errorMessage", errorMsg);
                    ret.put("postAuthCheck", postAuth);
                    call.resolve(ret);

                    JSObject authEvt = new JSObject();
                    authEvt.put("status", postAuth ? "authenticated" : "error");
                    authEvt.put("message", errorMsg);
                    authEvt.put("resultCode", resultCode);
                    authEvt.put("errorCode", errorCode);
                    notifyListeners("plugpagAuth", authEvt);
                }
            } catch (Exception e) {
                Log.e(TAG, "requestAuthentication exception", e);
                JSObject ret = new JSObject();
                ret.put("authenticated", false);
                ret.put("errorMessage", e.getMessage());
                call.resolve(ret);
            }
        });
    }

    /**
     * Request interactive authentication using the same flow as the official 4.x demo.
     * This is the preferred path for Bluetooth/serial terminals such as Moderninha PRO/WIFI.
     */
    @PluginMethod()
    public void requestInteractiveAuthentication(PluginCall call) {
        if (!assertInitialized(call)) return;

        if (getActivity() == null) {
            call.reject("Activity indisponivel para autenticacao interativa", "AUTH_NO_ACTIVITY");
            return;
        }

        MainActivity mainActivity = getActivity() instanceof MainActivity ? (MainActivity) getActivity() : null;
        if (mainActivity != null) {
            mainActivity.suspendLockTaskForExternalFlow(INTERACTIVE_AUTH_TIMEOUT_MS);
        }

        Log.i(TAG, "requestInteractiveAuthentication: starting demo-aligned auth flow");
        final long authStartedAt = System.currentTimeMillis();

        getActivity().runOnUiThread(() -> {
            AtomicBoolean completed = new AtomicBoolean(false);
            Handler handler = new Handler(Looper.getMainLooper());
            Runnable timeoutRunnable = () -> {
                if (!completed.compareAndSet(false, true)) {
                    return;
                }

                long durationMs = System.currentTimeMillis() - authStartedAt;
                boolean lockTaskRestored = restoreLockTask(mainActivity, "interactive-auth-timeout");
                Log.w(TAG, "Interactive authentication timed out waiting for SDK callback"
                    + " durationMs=" + durationMs
                    + " lockTaskRestored=" + lockTaskRestored);
                emitInteractiveAuthEvent(
                    "error",
                    "Autenticacao interativa expirou sem retorno do SDK",
                    "AUTH_TIMEOUT",
                    null,
                    false,
                    durationMs,
                    lockTaskRestored
                );

                call.reject("Autenticacao interativa expirou sem retorno do SDK", "AUTH_TIMEOUT");
            };

            handler.postDelayed(timeoutRunnable, INTERACTIVE_AUTH_TIMEOUT_MS);

            try {
                int startResult = plugPag.requestAuthentication(new PlugPagAuthenticationListener() {
                    @Override
                    public void onSuccess() {
                        if (!completed.compareAndSet(false, true)) {
                            return;
                        }

                        handler.removeCallbacks(timeoutRunnable);
                        long durationMs = System.currentTimeMillis() - authStartedAt;
                        boolean authenticated = true;
                        try {
                            authenticated = plugPag.isAuthenticated();
                        } catch (Exception ignored) {
                        }
                        boolean lockTaskRestored = restoreLockTask(mainActivity, "interactive-auth-success");
                        Log.i(TAG, "Interactive authentication succeeded"
                            + " durationMs=" + durationMs
                            + " lockTaskRestored=" + lockTaskRestored
                            + " authenticatedPostCheck=" + authenticated);

                        JSObject ret = new JSObject();
                        ret.put("authenticated", authenticated);
                        ret.put("durationMs", durationMs);
                        call.resolve(ret);

                        emitInteractiveAuthEvent(
                            authenticated ? "authenticated" : "error",
                            authenticated
                                ? "Autenticacao interativa concluida"
                                : "SDK retornou sucesso, mas a sessao nao ficou autenticada",
                            authenticated ? null : "AUTH_NOT_PERSISTED",
                            null,
                            authenticated,
                            durationMs,
                            lockTaskRestored
                        );
                    }

                    @Override
                    public void onError() {
                        if (!completed.compareAndSet(false, true)) {
                            return;
                        }

                        handler.removeCallbacks(timeoutRunnable);
                        boolean authenticated = false;
                        try {
                            authenticated = plugPag.isAuthenticated();
                        } catch (Exception ignored) {
                        }

                        long durationMs = System.currentTimeMillis() - authStartedAt;
                        boolean lockTaskRestored = restoreLockTask(mainActivity, "interactive-auth-error");
                        String errorCode = authenticated ? "AUTH_CALLBACK_ERROR_BUT_PERSISTED" : "AUTH_FAILED";
                        String message = authenticated
                            ? "Autenticacao interativa retornou erro, mas o SDK reporta sessao autenticada"
                            : "Autenticacao interativa falhou ou foi cancelada";
                        Log.w(TAG, "Interactive authentication failed or was cancelled"
                            + " durationMs=" + durationMs
                            + " lockTaskRestored=" + lockTaskRestored
                            + " authenticatedPostCheck=" + authenticated
                            + " errorCode=" + errorCode);

                        emitInteractiveAuthEvent(
                            authenticated ? "authenticated" : "error",
                            message,
                            errorCode,
                            null,
                            authenticated,
                            durationMs,
                            lockTaskRestored
                        );

                        if (authenticated) {
                            JSObject ret = new JSObject();
                            ret.put("authenticated", true);
                            ret.put("errorCode", errorCode);
                            ret.put("durationMs", durationMs);
                            call.resolve(ret);
                        } else {
                            call.reject("Autenticacao interativa falhou ou foi cancelada", "AUTH_FAILED");
                        }
                    }
                });

                Log.i(TAG, "requestInteractiveAuthentication: startResult=" + startResult);
                if (startResult != PlugPag.RET_OK) {
                    if (!completed.compareAndSet(false, true)) {
                        return;
                    }

                    handler.removeCallbacks(timeoutRunnable);
                    long durationMs = System.currentTimeMillis() - authStartedAt;
                    boolean lockTaskRestored = restoreLockTask(mainActivity, "interactive-auth-start-failure");
                    Log.w(TAG, "requestInteractiveAuthentication: startResult failure"
                        + " resultCode=" + startResult
                        + " durationMs=" + durationMs
                        + " lockTaskRestored=" + lockTaskRestored);
                    emitInteractiveAuthEvent(
                        "error",
                        "Falha ao iniciar autenticacao interativa",
                        "AUTH_START_FAILED",
                        startResult,
                        false,
                        durationMs,
                        lockTaskRestored
                    );
                    call.reject(
                        "Falha ao iniciar autenticacao interativa (codigo: " + startResult + ")",
                        "AUTH_START_FAILED"
                    );
                }
            } catch (Exception e) {
                if (!completed.compareAndSet(false, true)) {
                    return;
                }

                handler.removeCallbacks(timeoutRunnable);
                long durationMs = System.currentTimeMillis() - authStartedAt;
                boolean lockTaskRestored = restoreLockTask(mainActivity, "interactive-auth-exception");
                Log.e(TAG, "requestInteractiveAuthentication exception"
                    + " durationMs=" + durationMs
                    + " lockTaskRestored=" + lockTaskRestored, e);
                emitInteractiveAuthEvent(
                    "error",
                    "Excecao na autenticacao interativa: " + e.getMessage(),
                    "AUTH_EXCEPTION",
                    null,
                    false,
                    durationMs,
                    lockTaskRestored
                );
                call.reject("Excecao na autenticacao interativa: " + e.getMessage(), "AUTH_EXCEPTION");
            }
        });
    }

    /**
     * Invalidate authentication (deactivation).
     */
    @PluginMethod()
    public void invalidateAuthentication(PluginCall call) {
        if (!assertInitialized(call)) return;

        executor.execute(() -> {
            try {
                // Doc oficial: invalidateAuthentication() retorna void
                plugPag.invalidateAuthentication();
                JSObject ret = new JSObject();
                ret.put("invalidated", true);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "invalidateAuthentication exception", e);
                call.reject("Erro ao invalidar autenticação: " + e.getMessage(), "DEAUTH_ERROR");
            }
        });
    }

    // =========================================================================
    // Payment — Card-Present
    // =========================================================================

    /**
     * Start a card-present payment on the PlugPag terminal.
     *
     * Params:
     *   amountCents:    number  — total in cents (e.g. 1500 = R$15,00)
     *   type:           string  — "CREDIT" | "DEBIT"
     *   installments:   number  — 1 for à vista (default)
     *   userReference:  string  — order reference for reconciliation
     *   printReceipt:   boolean — whether the terminal should print receipt
     */
    @PluginMethod()
    public void startPayment(PluginCall call) {
        if (!assertReady(call)) return;

        Integer amountCents = call.getInt("amountCents");
        String type = call.getString("type", "DEBIT");
        Integer installments = call.getInt("installments", 1);
        String userReference = call.getString("userReference", "");
        Boolean printReceipt = call.getBoolean("printReceipt", false);

        if (amountCents == null || amountCents <= 0) {
            call.reject("amountCents obrigatório e > 0", "INVALID_AMOUNT");
            return;
        }

        int paymentType;
        if ("CREDIT".equalsIgnoreCase(type)) {
            paymentType = PlugPag.TYPE_CREDITO;
        } else if ("DEBIT".equalsIgnoreCase(type)) {
            paymentType = PlugPag.TYPE_DEBITO;
        } else if ("VOUCHER".equalsIgnoreCase(type)) {
            paymentType = PlugPag.TYPE_VOUCHER;
        } else if ("PIX".equalsIgnoreCase(type)) {
            paymentType = PlugPag.TYPE_PIX;
        } else {
            call.reject("type deve ser CREDIT, DEBIT, VOUCHER ou PIX", "INVALID_TYPE");
            return;
        }

        // isCless deve ser final para uso dentro da lambda do executor
        final boolean isCless = (paymentType == PlugPag.TYPE_PIX);

        int installmentType = (installments != null && installments > 1)
            ? PlugPag.INSTALLMENT_TYPE_PARC_VENDEDOR
            : PlugPag.INSTALLMENT_TYPE_A_VISTA;

        Log.i(TAG, "startPayment: amountCents=" + amountCents + " type=" + type);

        executor.execute(() -> {
            try {
                // Reconectar BT antes de cada transação (padrão do demo oficial)
                // Isso garante resiliência caso o BT tenha desconectado entre transações
                if (connectedDeviceId != null) {
                    // isCless: true para PIX/QRCode (contactless), false para cartão chip/tarja
                    BtInitResult btInit = initBtConnection(connectedDeviceId, isCless);
                    int btResult = btInit.code;
                    Log.i(TAG, "startPayment: re-initBTConnection result=" + btResult + " mode=" + btInit.mode + " isCless=" + isCless);
                    if (btResult != PlugPag.RET_OK) {
                        call.reject(buildBtConnectErrorMessageSafe(btResult, btInit.diagnostics), "BT_RECONNECT_ERROR");
                        return;
                    }
                }

                // Doc oficial Builder: setType, setAmount, setInstallmentType,
                // setInstallments, setUserReference — sem setPaymentReceipt
                PlugPagPaymentData paymentData = new PlugPagPaymentData.Builder()
                    .setType(paymentType)
                    .setAmount(amountCents)
                    .setInstallmentType(installmentType)
                    .setInstallments(installments != null ? installments : 1)
                    .setUserReference(userReference != null ? userReference : "")
                    .build();

                // Verificar se token existe antes de doPayment
                // Token é populado via requestAuthentication (login interativo PagBank, uma vez)
                boolean prePayAuth = false;
                try { prePayAuth = plugPag.isAuthenticated(); } catch (Exception ignored) {}
                Log.i(TAG, "startPayment: isAuthenticated-prePayment=" + prePayAuth);

                if (!prePayAuth) {
                    Log.w(TAG, "startPayment: Token vazio — autenticação PagBank necessária via requestAuthentication");
                }

                PlugPagTransactionResult result = plugPag.doPayment(paymentData);

                JSObject ret = buildSafeResult(result);
                if (!Boolean.TRUE.equals(ret.getBoolean("approved"))) {
                    Log.w(
                        TAG,
                        "startPayment rejected: resultCode="
                            + ret.getInteger("resultCode", -1)
                            + " errorCode="
                            + safeString(ret.getString("errorCode"))
                            + " message="
                            + safeString(ret.getString("message"))
                    );
                }
                call.resolve(ret);

                JSObject txEvt = new JSObject();
                txEvt.put("status", ret.getBoolean("approved") ? "approved" : "rejected");
                txEvt.put("result", ret);
                notifyListeners("plugpagTransaction", txEvt);

            } catch (Exception e) {
                Log.e(TAG, "startPayment exception", e);
                call.reject("Exceção no pagamento: " + e.getMessage(), "PAYMENT_EXCEPTION");
            }
        });
    }

    /**
     * Abort the current in-progress payment on the terminal.
     *
     * CRITICAL: Runs on a NEW thread, NOT on the executor.
     * The executor is single-threaded and doPayment() blocks it.
     * PlugPag SDK allows calling abort() from a different thread
     * to interrupt the blocking doPayment() call.
     */
    @PluginMethod()
    public void abortPayment(PluginCall call) {
        if (!assertInitialized(call)) return;

        Log.i(TAG, "abortPayment requested — running on separate thread");

        new Thread(() -> {
            try {
                PlugPagAbortResult result = plugPag.abort();
                boolean aborted = (result != null && result.getResult() == PlugPag.RET_OK);
                Log.i(TAG, "abortPayment result: aborted=" + aborted);
                JSObject ret = new JSObject();
                ret.put("aborted", aborted);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "abortPayment exception", e);
                call.reject("Exceção no cancelamento: " + e.getMessage(), "ABORT_EXCEPTION");
            }
        }, "PlugPag-Abort").start();
    }

    // =========================================================================
    // Void (Estorno)
    // =========================================================================

    /**
     * Void/refund a previous transaction.
     *
     * Params:
     *   transactionCode: string — from original payment result
     *   transactionId:   string — from original payment result
     *   printReceipt:    boolean — print void receipt
     *
     * If no params provided, voids the last approved transaction.
     */
    @PluginMethod()
    public void voidPayment(PluginCall call) {
        if (!assertReady(call)) return;

        String transactionCode = call.getString("transactionCode", null);
        String transactionId = call.getString("transactionId", null);
        Boolean printReceipt = call.getBoolean("printReceipt", false);

        Log.i(TAG, "voidPayment requested");

        executor.execute(() -> {
            try {
                PlugPagTransactionResult result;

                // Reconectar BT antes do estorno (padrão do demo oficial)
                if (connectedDeviceId != null) {
                    BtInitResult btInit = initBtConnection(connectedDeviceId, false);
                    int btResult = btInit.code;
                    Log.i(TAG, "voidPayment: re-initBTConnection result=" + btResult + " mode=" + btInit.mode);
                    if (btResult != PlugPag.RET_OK) {
                        call.reject(buildBtConnectErrorMessageSafe(btResult, btInit.diagnostics), "BT_RECONNECT_ERROR");
                        return;
                    }
                }

                if (transactionCode != null && transactionId != null) {
                    // Doc oficial VoidData.Builder: setTransactionCode, setTransactionId
                    PlugPagVoidData voidData = new PlugPagVoidData.Builder()
                        .setTransactionCode(transactionCode)
                        .setTransactionId(transactionId)
                        .build();
                    result = plugPag.voidPayment(voidData);
                } else {
                    result = plugPag.voidPayment();
                }

                JSObject ret = buildSafeResult(result);
                call.resolve(ret);

                JSObject txEvt = new JSObject();
                txEvt.put("status", "voided");
                txEvt.put("result", ret);
                notifyListeners("plugpagTransaction", txEvt);

            } catch (Exception e) {
                Log.e(TAG, "voidPayment exception", e);
                call.reject("Exceção no estorno: " + e.getMessage(), "VOID_EXCEPTION");
            }
        });
    }

    // =========================================================================
    // Query
    // =========================================================================

    /**
     * Get the last approved transaction on the terminal.
     */
    @PluginMethod()
    public void getLastApprovedTransaction(PluginCall call) {
        if (!assertReady(call)) return;

        executor.execute(() -> {
            try {
                PlugPagTransactionResult result = plugPag.getLastApprovedTransaction();
                if (result != null) {
                    call.resolve(buildSafeResult(result));
                } else {
                    JSObject ret = new JSObject();
                    ret.put("approved", false);
                    ret.put("message", "Nenhuma transação aprovada encontrada");
                    call.resolve(ret);
                }
            } catch (Exception e) {
                Log.e(TAG, "getLastApprovedTransaction exception", e);
                call.reject("Exceção ao buscar última transação: " + e.getMessage(), "QUERY_EXCEPTION");
            }
        });
    }

    // =========================================================================
    // Status
    // =========================================================================

    /**
     * Check terminal status — initialization, connection, authentication.
     */
    @PluginMethod()
    public void getStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("initialized", plugPag != null);
        ret.put("btConnected", btConnected);
        ret.put("deviceId", connectedDeviceId);

        if (plugPag != null) {
            executor.execute(() -> {
                try {
                    boolean auth = plugPag.isAuthenticated();
                    ret.put("authenticated", auth);
                } catch (Exception e) {
                    ret.put("authenticated", false);
                }
                call.resolve(ret);
            });
        } else {
            ret.put("authenticated", false);
            call.resolve(ret);
        }
    }

    // =========================================================================
    // PIX QR Display (Phase 2+)
    // =========================================================================

    /**
     * Display a PIX QR code on the terminal's screen.
     * Uses PlugPag's showQrCode native method.
     *
     * Params: qrCodeText (string) — EMV/BRCode payload
     */
    @PluginMethod()
    public void displayPixQR(PluginCall call) {
        if (!assertReady(call)) return;

        String qrCodeText = call.getString("qrCodeText", "");
        if (qrCodeText == null || qrCodeText.isEmpty()) {
            call.reject("qrCodeText obrigatório", "INVALID_QR");
            return;
        }

        Log.i(TAG, "displayPixQR: length=" + qrCodeText.length());

        executor.execute(() -> {
            try {
                plugPag.showQrCode(qrCodeText, 256, 300, 0xFFFFFFFF);
                JSObject ret = new JSObject();
                ret.put("displayed", true);
                call.resolve(ret);
            } catch (Exception e) {
                Log.w(TAG, "displayPixQR not supported on this terminal", e);
                JSObject ret = new JSObject();
                ret.put("displayed", false);
                ret.put("message", "QR display não suportado neste terminal: " + e.getMessage());
                call.resolve(ret);
            }
        });
    }

    // =========================================================================
    // Helpers — Security
    // =========================================================================

    /**
     * Build a safe JSObject from PlugPagTransactionResult.
     * SECURITY: Only allowlisted fields cross the bridge.
     * PAN, CVV, track data, full card number are NEVER included.
     */
    private JSObject buildSafeResult(PlugPagTransactionResult result) {
        JSObject ret = new JSObject();

        if (result == null) {
            ret.put("approved", false);
            ret.put("message", "Resultado nulo do terminal");
            return ret;
        }

        boolean approved = result.getResult() == PlugPag.RET_OK;
        ret.put("approved", approved);
        ret.put("resultCode", result.getResult());
        ret.put("message", safeString(result.getMessage()));
        ret.put("errorCode", safeString(result.getErrorCode()));

        // Transaction identifiers — doc: getTransactionCode, getTransactionId, getHostNsu, getUserReference
        ret.put("transactionCode", safeString(result.getTransactionCode()));
        ret.put("transactionId", safeString(result.getTransactionId()));
        ret.put("hostNsu", safeString(result.getHostNsu()));
        ret.put("userReference", safeString(result.getUserReference()));

        // Terminal info — doc: getTerminalSerialNumber, getDate, getTime
        ret.put("terminalSerialNumber", safeString(result.getTerminalSerialNumber()));
        ret.put("date", safeString(result.getDate()));
        ret.put("time", safeString(result.getTime()));

        // Card info (safe) — doc: getCardBrand, getBin (últimos 4), getHolder (últimos 4)
        ret.put("cardBrand", safeString(result.getCardBrand()));
        String bin = safeString(result.getBin());
        if (bin != null && bin.length() > 4) {
            bin = bin.substring(bin.length() - 4);
        }
        ret.put("cardLast4", bin);

        // Amount — doc: getAmount
        ret.put("amount", safeString(result.getAmount()));

        // paymentType — existe no SDK (confirmado via demo oficial SharedPrefDataStorage)
        try {
            ret.put("paymentType", result.getPaymentType());
        } catch (Exception e) {
            // Campo pode não existir em versões futuras
        }

        // holderName — doc: getHolderName (PII)
        // F-13: Mascarar antes de cruzar bridge — defesa em profundidade
        ret.put("holderName", maskHolderName(safeString(result.getHolderName())));

        return ret;
    }

    /**
     * F-13: Mask holder name PII before crossing the native bridge.
     * Keeps first 3 chars + "***" for display compatibility.
     * Returns null for null/empty input.
     */
    private String maskHolderName(String name) {
        if (name == null || name.isEmpty()) return null;
        if (name.length() <= 3) return name.charAt(0) + "***";
        return name.substring(0, 3) + "***";
    }

    private String safeString(String value) {
        return (value != null && !value.isEmpty()) ? value : null;
    }

    private BtInitResult initBtConnection(String deviceId, boolean isCless) throws Exception {
        BluetoothDevice bondedDevice = findBondedDevice(deviceId);
        BluetoothDevice bondedFallbackDevice = resolveBondedTerminalFallback(deviceId, bondedDevice);
        JSObject diagnostics = buildBluetoothDiagnostics(deviceId, bondedDevice, bondedFallbackDevice);
        List<PlugPagIdentifierAttempt> attempts = buildIdentifierAttempts(deviceId, bondedDevice, bondedFallbackDevice);

        diagnostics.put("attemptCount", attempts.size());

        int finalResult = -1035;
        String mode = "explicit_device";
        String connectedIdentifier = deviceId;
        String resolvedBluetoothAddress = bondedFallbackDevice != null ? bondedFallbackDevice.getAddress() : bondedDevice != null ? bondedDevice.getAddress() : null;
        String resolvedBluetoothName = bondedFallbackDevice != null ? bondedFallbackDevice.getName() : bondedDevice != null ? bondedDevice.getName() : null;

        for (int i = 0; i < attempts.size(); i++) {
            PlugPagIdentifierAttempt attempt = attempts.get(i);
            String attemptPrefix = "attempt" + i;
            diagnostics.put(attemptPrefix + "Identifier", safeString(attempt.identifier));
            diagnostics.put(attemptPrefix + "Source", attempt.source);

            try {
                // Manual oficial: PlugPagDevice(deviceIdentification) — construtor de 1 argumento
                // NÃO passar activationCode no construtor do device (activation é via initializeAndActivatePinpad)
                PlugPagDevice device = new PlugPagDevice(attempt.identifier);
                diagnostics.put(attemptPrefix + "DeviceCreated", true);
                diagnostics.put(attemptPrefix + "DeviceType", device.getType());
                diagnostics.put(attemptPrefix + "DeviceIdentification", safeString(device.getIdentification()));
                diagnostics.put(attemptPrefix + "DeviceLess", device.isLess());

                Log.i(TAG, "initBTConnection: attempt=" + i
                    + " identifier=" + safeString(attempt.identifier)
                    + " isCless=" + isCless);

                int result = plugPag.initBTConnection(device);
                diagnostics.put(attemptPrefix + "Result", result);

                finalResult = result;
                mode = attempt.source;
                connectedIdentifier = attempt.identifier;
                if (attempt.device != null) {
                    resolvedBluetoothAddress = attempt.device.getAddress();
                    resolvedBluetoothName = attempt.device.getName();
                }

                if (result == PlugPag.RET_OK || result != -1035) {
                    break;
                }
            } catch (PlugPagInvalidDeviceIdentificationException e) {
                diagnostics.put(attemptPrefix + "DeviceCreated", false);
                diagnostics.put(attemptPrefix + "CreationException", safeString(e.getClass().getSimpleName() + ": " + e.getMessage()));
                finalResult = extractPlugPagErrorCode(e, -1035);
                mode = attempt.source;
                Log.w(TAG, "PlugPagDevice rejected identifier from " + attempt.source + ": " + attempt.identifier, e);
            }
        }

        diagnostics.put("finalResult", finalResult);
        diagnostics.put("mode", mode);
        diagnostics.put("connectedIdentifier", safeString(connectedIdentifier));
        diagnostics.put("resolvedBluetoothAddress", safeString(resolvedBluetoothAddress));
        diagnostics.put("resolvedBluetoothName", safeString(resolvedBluetoothName));
        return new BtInitResult(finalResult, mode, diagnostics, connectedIdentifier, resolvedBluetoothAddress, resolvedBluetoothName);
    }

    private JSObject buildBluetoothDiagnostics(String deviceId, BluetoothDevice bondedDevice, BluetoothDevice bondedFallbackDevice) {
        JSObject diagnostics = new JSObject();
        diagnostics.put("requestedDeviceId", safeString(deviceId));
        diagnostics.put("requestedLooksLikeMac", looksLikeBluetoothMac(deviceId));

        BluetoothAdapter adapter = getBluetoothAdapter();
        diagnostics.put("adapterPresent", adapter != null);
        diagnostics.put("adapterEnabled", adapter != null && adapter.isEnabled());

        List<BluetoothDevice> bondedDevices = getBondedDevices();
        List<BluetoothDevice> bondedTerminalCandidates = getBondedTerminalCandidates(bondedDevices);

        int bondedCount = 0;
        bondedCount = bondedDevices.size();
        diagnostics.put("bondedDeviceCount", bondedCount);
        diagnostics.put("bondedTerminalCandidateCount", bondedTerminalCandidates.size());
        diagnostics.put("bondedTerminalCandidates", summarizeBluetoothDevices(bondedTerminalCandidates));
        diagnostics.put("bondedMatchFound", bondedDevice != null);
        if (bondedDevice != null) {
            diagnostics.put("bondedMatchName", safeString(bondedDevice.getName()));
            diagnostics.put("bondedMatchAddress", safeString(bondedDevice.getAddress()));
            diagnostics.put("bondedMatchState", bondStateToString(bondedDevice.getBondState()));
            diagnostics.put("bondedMatchLooksLikeDefaultDeviceTerminal", shouldTryDefaultDeviceFallback(bondedDevice));
        }
        if (bondedFallbackDevice != null && !sameBluetoothDevice(bondedDevice, bondedFallbackDevice)) {
            diagnostics.put("resolvedBondedFallbackName", safeString(bondedFallbackDevice.getName()));
            diagnostics.put("resolvedBondedFallbackAddress", safeString(bondedFallbackDevice.getAddress()));
            diagnostics.put("resolvedBondedFallbackState", bondStateToString(bondedFallbackDevice.getBondState()));
        }

        return diagnostics;
    }

    private BluetoothAdapter getBluetoothAdapter() {
        try {
            BluetoothManager bluetoothManager = getContext().getSystemService(BluetoothManager.class);
            if (bluetoothManager != null) {
                return bluetoothManager.getAdapter();
            }
        } catch (Exception e) {
            Log.w(TAG, "Unable to get BluetoothManager adapter", e);
        }
        return BluetoothAdapter.getDefaultAdapter();
    }

    private BluetoothDevice findBondedDevice(String identifier) {
        if (identifier == null || identifier.isEmpty()) {
            return null;
        }

        for (BluetoothDevice device : getBondedDevices()) {
            String name = device.getName();
            String address = device.getAddress();
            if (identifier.equalsIgnoreCase(address) || identifier.equalsIgnoreCase(name)) {
                return device;
            }
        }

        return null;
    }

    private List<BluetoothDevice> getBondedDevices() {
        List<BluetoothDevice> devices = new ArrayList<>();
        BluetoothAdapter adapter = getBluetoothAdapter();
        if (adapter == null) {
            return devices;
        }

        try {
            Set<BluetoothDevice> bondedDevices = adapter.getBondedDevices();
            if (bondedDevices != null) {
                devices.addAll(bondedDevices);
            }
        } catch (SecurityException e) {
            Log.w(TAG, "Unable to inspect bonded devices", e);
        }

        return devices;
    }

    private List<BluetoothDevice> getBondedTerminalCandidates(List<BluetoothDevice> bondedDevices) {
        List<BluetoothDevice> candidates = new ArrayList<>();
        for (BluetoothDevice device : bondedDevices) {
            if (shouldTryDefaultDeviceFallback(device)) {
                candidates.add(device);
            }
        }
        return candidates;
    }

    private BluetoothDevice resolveBondedTerminalFallback(String identifier, BluetoothDevice bondedDevice) {
        if (bondedDevice != null) {
            return bondedDevice;
        }

        List<BluetoothDevice> bondedTerminalCandidates = getBondedTerminalCandidates(getBondedDevices());
        if (bondedTerminalCandidates.isEmpty()) {
            return null;
        }

        if (looksLikeBluetoothMac(identifier) && identifier.length() >= 15) {
            String macPrefix = identifier.substring(0, 15).toUpperCase();
            List<BluetoothDevice> prefixMatches = new ArrayList<>();
            for (BluetoothDevice candidate : bondedTerminalCandidates) {
                String address = candidate.getAddress();
                if (address != null && address.toUpperCase().startsWith(macPrefix)) {
                    prefixMatches.add(candidate);
                }
            }
            if (prefixMatches.size() == 1) {
                return prefixMatches.get(0);
            }
        }

        if (bondedTerminalCandidates.size() == 1) {
            return bondedTerminalCandidates.get(0);
        }

        return null;
    }

    private List<PlugPagIdentifierAttempt> buildIdentifierAttempts(String requestedIdentifier, BluetoothDevice bondedDevice, BluetoothDevice bondedFallbackDevice) {
        List<PlugPagIdentifierAttempt> attempts = new ArrayList<>();

        BluetoothDevice candidate = bondedFallbackDevice != null ? bondedFallbackDevice : bondedDevice;
        if (candidate != null) {
            // Device NAME must come first: the SDK infers terminal type from PRO-*, W-*, W+-, PLUS-*,
            // MCHIP-*, A50-* prefixes. Passing a raw MAC as identifier throws PP1035 because
            // the SDK cannot determine device type from a MAC address alone.
            boolean isSame = sameBluetoothDevice(bondedDevice, candidate);
            addIdentifierAttempt(attempts, candidate.getName(),    isSame ? "bonded_device_name"    : "bonded_terminal_name_fallback",    candidate);
            addIdentifierAttempt(attempts, candidate.getAddress(), isSame ? "bonded_device_address" : "bonded_terminal_address_fallback", candidate);
        }

        // Explicit identifier requested by the caller goes last: if it is a raw MAC it will
        // cause PP1035 anyway, but by this point the name-based attempt above should have
        // already succeeded and broken out of the loop.
        addIdentifierAttempt(attempts, requestedIdentifier, "explicit_device", bondedDevice != null ? bondedDevice : candidate);

        return attempts;
    }

    private void addIdentifierAttempt(List<PlugPagIdentifierAttempt> attempts, String identifier, String source, BluetoothDevice device) {
        if (identifier == null || identifier.isEmpty()) {
            return;
        }

        for (PlugPagIdentifierAttempt attempt : attempts) {
            if (identifier.equalsIgnoreCase(attempt.identifier)) {
                return;
            }
        }

        attempts.add(new PlugPagIdentifierAttempt(identifier, source, device));
    }

    private String summarizeBluetoothDevices(List<BluetoothDevice> devices) {
        if (devices.isEmpty()) {
            return null;
        }

        StringBuilder summary = new StringBuilder();
        for (BluetoothDevice device : devices) {
            if (summary.length() > 0) {
                summary.append(", ");
            }
            summary.append(safeString(device.getName()));
            summary.append("@");
            summary.append(safeString(device.getAddress()));
        }
        return summary.toString();
    }

    private boolean sameBluetoothDevice(BluetoothDevice first, BluetoothDevice second) {
        if (first == null || second == null) {
            return false;
        }

        String firstAddress = first.getAddress();
        String secondAddress = second.getAddress();
        return firstAddress != null && firstAddress.equalsIgnoreCase(secondAddress);
    }

    private boolean shouldTryDefaultDeviceFallback(BluetoothDevice bondedDevice) {
        if (bondedDevice == null) {
            return false;
        }

        String name = bondedDevice.getName();
        if (name == null) {
            return false;
        }

        return name.startsWith("PRO-")
            || name.startsWith("W-")
            || name.startsWith("W+-")
            || name.startsWith("PLUS-")
            || name.startsWith("MCHIP-")
            || name.startsWith("A50-");
    }

    private boolean looksLikeBluetoothMac(String value) {
        return value != null && value.matches("(?i)^([0-9A-F]{2}:){5}[0-9A-F]{2}$");
    }

    private String bondStateToString(int bondState) {
        switch (bondState) {
            case BluetoothDevice.BOND_BONDED:
                return "bonded";
            case BluetoothDevice.BOND_BONDING:
                return "bonding";
            case BluetoothDevice.BOND_NONE:
            default:
                return "none";
        }
    }

    private String buildBtConnectErrorMessageSafe(int result, JSObject diagnostics) {
        String message = "Falha na conexao BT (codigo: " + result + ")";

        if (result == -1035) {
            String requestedDeviceId = diagnostics.optString("requestedDeviceId", "");
            String resolvedFallbackAddress = diagnostics.optString("resolvedBondedFallbackAddress", "");
            String resolvedFallbackName = diagnostics.optString("resolvedBondedFallbackName", "");

            if (!resolvedFallbackAddress.isEmpty() && !resolvedFallbackAddress.equalsIgnoreCase(requestedDeviceId)) {
                message += ". O Android pareou esta maquininha como '" + resolvedFallbackAddress + "'";
                if (!resolvedFallbackName.isEmpty()) {
                    message += " (" + resolvedFallbackName + ")";
                }
                message += ", diferente do identificador informado";
            } else if (diagnostics.optBoolean("bondedMatchFound")) {
                String bondedName = diagnostics.optString("bondedMatchName", "");
                if (!bondedName.isEmpty()) {
                    message += ". O Android encontrou o terminal pareado '" + bondedName + "', mas o PlugPag marcou a identificacao como invalida";
                } else {
                    message += ". O Android encontrou um terminal pareado, mas o PlugPag marcou a identificacao como invalida";
                }
            } else {
                message += ". O terminal solicitado nao aparece entre os dispositivos BT pareados do Android";
            }

            if (diagnostics.optBoolean("requestedLooksLikeMac")) {
                message += ". Verifique se o identificador salvo corresponde ao terminal pareado no Android e deixe o Bluetooth dele visivel na tela do terminal";
            }
        }

        return message;
    }

    private int extractPlugPagErrorCode(Throwable error, int defaultValue) {
        if (error == null || error.getMessage() == null) {
            return defaultValue;
        }

        Matcher matcher = Pattern.compile("PP(\\d{3,4})").matcher(error.getMessage());
        if (matcher.find()) {
            try {
                return -Integer.parseInt(matcher.group(1));
            } catch (NumberFormatException ignored) {
                return defaultValue;
            }
        }

        return defaultValue;
    }

    private String buildBtConnectErrorMessage(int result, JSObject diagnostics) {
        String message = "Falha na conexÃ£o BT (cÃ³digo: " + result + ")";

        if (result == -1035) {
            if (diagnostics.optBoolean("bondedMatchFound")) {
                String bondedName = diagnostics.optString("bondedMatchName", "");
                if (!bondedName.isEmpty()) {
                    message += ". O Android encontrou o terminal pareado '" + bondedName + "', mas o SDK rejeitou a identificaÃ§Ã£o informada";
                } else {
                    message += ". O Android encontrou um terminal pareado, mas o SDK rejeitou a identificaÃ§Ã£o informada";
                }
            } else {
                message += ". O terminal solicitado nÃ£o aparece entre os dispositivos BT pareados do Android";
            }

            if (diagnostics.optBoolean("fallbackAttempted") && diagnostics.optInt("fallbackResult", PlugPag.RET_OK) != PlugPag.RET_OK) {
                message += ". A tentativa por dispositivo padrÃ£o tambÃ©m falhou";
            }
        }

        return message;
    }

    private boolean restoreLockTask(MainActivity mainActivity, String reason) {
        if (mainActivity == null) {
            return false;
        }

        mainActivity.restoreLockTaskIfNeeded(reason);
        return true;
    }

    private void emitInteractiveAuthEvent(
        String status,
        String message,
        String errorCode,
        Integer resultCode,
        boolean authenticated,
        long durationMs,
        boolean lockTaskRestored
    ) {
        JSObject authEvt = new JSObject();
        authEvt.put("status", status);
        authEvt.put("message", message);
        authEvt.put("authenticated", authenticated);
        authEvt.put("durationMs", durationMs);
        authEvt.put("lockTaskRestored", lockTaskRestored);
        if (errorCode != null) {
            authEvt.put("errorCode", errorCode);
        }
        if (resultCode != null) {
            authEvt.put("resultCode", resultCode);
        }
        notifyListeners("plugpagAuth", authEvt);
    }

    private static final class BtInitResult {
        final int code;
        final String mode;
        final JSObject diagnostics;
        final String connectedIdentifier;
        final String resolvedBluetoothAddress;
        final String resolvedBluetoothName;

        BtInitResult(int code, String mode, JSObject diagnostics, String connectedIdentifier, String resolvedBluetoothAddress, String resolvedBluetoothName) {
            this.code = code;
            this.mode = mode;
            this.diagnostics = diagnostics;
            this.connectedIdentifier = connectedIdentifier;
            this.resolvedBluetoothAddress = resolvedBluetoothAddress;
            this.resolvedBluetoothName = resolvedBluetoothName;
        }
    }

    private static final class PlugPagIdentifierAttempt {
        final String identifier;
        final String source;
        final BluetoothDevice device;

        PlugPagIdentifierAttempt(String identifier, String source, BluetoothDevice device) {
            this.identifier = identifier;
            this.source = source;
            this.device = device;
        }
    }

    // =========================================================================
    // Assertion helpers
    // =========================================================================

    private boolean assertInitialized(PluginCall call) {
        if (plugPag == null) {
            call.reject("PlugPag não inicializado. Chame initialize() primeiro.", "NOT_INITIALIZED");
            return false;
        }
        return true;
    }

    private boolean hasPlugPagRuntimePermissions() {
        boolean bluetoothGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            getPermissionState("bluetooth") == PermissionState.GRANTED;
        boolean phoneGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
            getPermissionState("phoneState") == PermissionState.GRANTED;
        boolean storageGranted;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            storageGranted = getPermissionState("mediaAudio") == PermissionState.GRANTED;
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            storageGranted = getPermissionState("storageLegacy") == PermissionState.GRANTED;
        } else {
            storageGranted = true;
        }

        return bluetoothGranted && phoneGranted && storageGranted;
    }

    private boolean assertRuntimePermissions(PluginCall call) {
        if (!hasPlugPagRuntimePermissions()) {
            call.reject(
                "PlugPag permissions are missing. Call requestPermissions() and allow Bluetooth, Phone and Media/Storage.",
                "MISSING_PERMISSIONS"
            );
            return false;
        }
        return true;
    }

    private boolean assertReady(PluginCall call) {
        if (plugPag == null) {
            call.reject("PlugPag não inicializado. Chame initialize() primeiro.", "NOT_INITIALIZED");
            return false;
        }
        if (!btConnected) {
            call.reject("Terminal não conectado. Chame connect() primeiro.", "NOT_CONNECTED");
            return false;
        }
        return true;
    }

    private static final class PlugPagCompatContext extends ContextWrapper {
        PlugPagCompatContext(Context base) {
            super(base);
        }

        @Override
        public Intent registerReceiver(BroadcastReceiver receiver, IntentFilter filter) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && receiver != null) {
                return super.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
            }
            return super.registerReceiver(receiver, filter);
        }
    }
}
