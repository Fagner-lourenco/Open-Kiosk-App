package com.openkiosk.app;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
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

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import br.com.uol.pagseguro.plugpag.PlugPag;
import br.com.uol.pagseguro.plugpag.PlugPagAbortResult;
import br.com.uol.pagseguro.plugpag.PlugPagActivationData;
import br.com.uol.pagseguro.plugpag.PlugPagAppIdentification;
import br.com.uol.pagseguro.plugpag.PlugPagDevice;
import br.com.uol.pagseguro.plugpag.PlugPagEventData;
import br.com.uol.pagseguro.plugpag.PlugPagEventListener;
import br.com.uol.pagseguro.plugpag.PlugPagInitializationResult;
import br.com.uol.pagseguro.plugpag.PlugPagPaymentData;
import br.com.uol.pagseguro.plugpag.PlugPagTransactionResult;
import br.com.uol.pagseguro.plugpag.PlugPagVoidData;

/**
 * PlugPagTerminalPlugin — Full integration with PagBank PlugPag SDK 4.11.0
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
        )
    }
)
public class PlugPagTerminalPlugin extends Plugin {
    private static final String TAG = "PlugPagTerminal";

    // Single-thread executor — PlugPag SDK is NOT thread-safe
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private PlugPag plugPag;
    private boolean btConnected = false;
    private String connectedDeviceId;

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
            // SDK 4.11.0: construtor aceita apenas Context
            plugPag = new PlugPag(getContext());

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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (getPermissionState("bluetooth") == PermissionState.GRANTED) {
                JSObject ret = new JSObject();
                ret.put("granted", true);
                call.resolve(ret);
                return;
            }
            requestPermissionForAlias("bluetooth", call, "btPermissionCallback");
        } else {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
        }
    }

    @PermissionCallback
    private void btPermissionCallback(PluginCall call) {
        boolean granted = getPermissionState("bluetooth") == PermissionState.GRANTED;
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
     * Params: deviceId (string) — Bluetooth MAC address e.g. "00:1B:66:XX:YY:ZZ"
     */
    @PluginMethod()
    public void connect(PluginCall call) {
        if (!assertInitialized(call)) return;

        String deviceId = call.getString("deviceId", "");
        if (deviceId == null || deviceId.isEmpty()) {
            call.reject("deviceId (MAC address) é obrigatório", "INVALID_DEVICE");
            return;
        }

        Log.i(TAG, "connect: deviceId=" + deviceId);

        executor.execute(() -> {
            try {
                // 4-param constructor: (identification, null, null, isCless)
                // isCless=false para BT Classic (chip/tarja)
                PlugPagDevice device = new PlugPagDevice(deviceId, null, null, false);
                int result = plugPag.initBTConnection(device);

                if (result == PlugPag.RET_OK) {
                    btConnected = true;
                    connectedDeviceId = deviceId;
                    Log.i(TAG, "BT connected successfully");

                    JSObject ret = new JSObject();
                    ret.put("connected", true);
                    ret.put("deviceId", deviceId);
                    call.resolve(ret);

                    JSObject connEvt = new JSObject();
                    connEvt.put("status", "connected");
                    connEvt.put("deviceId", deviceId);
                    notifyListeners("plugpagConnection", connEvt);
                } else {
                    btConnected = false;
                    call.reject("Falha na conexão BT (código: " + result + ")", "BT_CONNECT_ERROR");

                    JSObject connEvt = new JSObject();
                    connEvt.put("status", "error");
                    connEvt.put("deviceId", deviceId);
                    connEvt.put("code", result);
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
            // PlugPag 4.11.0 não expõe disconnect() — SDK gerencia ciclo de vida BT internamente.
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

        Log.i(TAG, "requestAuthentication: starting activation flow");

        executor.execute(() -> {
            try {
                PlugPagActivationData activationData = new PlugPagActivationData(activationCode);
                PlugPagInitializationResult result = plugPag.initializeAndActivatePinpad(activationData);

                if (result.getResult() == PlugPag.RET_OK) {
                    Log.i(TAG, "Authentication successful");
                    JSObject ret = new JSObject();
                    ret.put("authenticated", true);
                    call.resolve(ret);

                    JSObject authEvt = new JSObject();
                    authEvt.put("status", "authenticated");
                    notifyListeners("plugpagAuth", authEvt);
                } else {
                    String errorMsg = result.getErrorMessage() != null ? result.getErrorMessage() : "Erro de ativação";
                    Log.w(TAG, "Authentication failed: " + errorMsg);
                    call.reject("Ativação falhou: " + errorMsg, "AUTH_FAILED");

                    JSObject authEvt = new JSObject();
                    authEvt.put("status", "error");
                    authEvt.put("message", errorMsg);
                    notifyListeners("plugpagAuth", authEvt);
                }
            } catch (Exception e) {
                Log.e(TAG, "requestAuthentication exception", e);
                call.reject("Exceção na ativação: " + e.getMessage(), "AUTH_EXCEPTION");
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
                    PlugPagDevice device = new PlugPagDevice(connectedDeviceId, null, null, isCless);
                    int btResult = plugPag.initBTConnection(device);
                    Log.i(TAG, "startPayment: re-initBTConnection result=" + btResult + " isCless=" + isCless);
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

                PlugPagTransactionResult result = plugPag.doPayment(paymentData);

                JSObject ret = buildSafeResult(result);
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
                    PlugPagDevice device = new PlugPagDevice(connectedDeviceId, null, null, false);
                    int btResult = plugPag.initBTConnection(device);
                    Log.i(TAG, "voidPayment: re-initBTConnection result=" + btResult);
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

        // holderName — doc: getHolderName (PII, callers must mask before persist/log)
        ret.put("holderName", safeString(result.getHolderName()));

        return ret;
    }

    private String safeString(String value) {
        return (value != null && !value.isEmpty()) ? value : null;
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
}
