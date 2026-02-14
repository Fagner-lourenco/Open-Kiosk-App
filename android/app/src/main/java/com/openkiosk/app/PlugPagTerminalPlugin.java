package com.openkiosk.app;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * PlugPagTerminalPlugin — Phase 1 Skeleton (mini-spike)
 *
 * <p>Capacitor bridge for PagBank PlugPag SDK 4.x (Bluetooth Classic).
 * This skeleton provides lifecycle methods and call signatures; actual
 * PlugPag SDK dependency will be added when the .aar is integrated.
 *
 * <p>Thread model:
 *   - Capacitor plugin methods run on the WebView thread.
 *   - PlugPag SDK calls MUST run on a background thread (blocking I/O).
 *   - We use {@code execute(Runnable, ...)} for async bridge calls.
 *
 * <p>Security invariants:
 *   - PAN/CVV/track data NEVER cross the bridge.
 *   - Only cardBrand, cardLast4, authCode, nsu, and status are returned.
 *   - holderName is PII — returned but callers must mask before persist.
 */
@CapacitorPlugin(name = "PlugPagTerminal")
public class PlugPagTerminalPlugin extends Plugin {
    private static final String TAG = "PlugPagTerminal";

    // PlugPag instance placeholder (will be: private PlugPag plugPag;)
    private boolean initialized = false;

    // =========================================================================
    // Lifecycle
    // =========================================================================

    /**
     * Initialize PlugPag SDK with Bluetooth MAC address of the terminal.
     *
     * Expected params:
     *   macAddress: string   — e.g. "00:1B:66:XX:YY:ZZ"
     *   appName:    string   — e.g. "OpenKiosk"
     *   appVersion: string   — e.g. "1.0.0"
     */
    @PluginMethod()
    public void initialize(PluginCall call) {
        String macAddress = call.getString("macAddress", "");
        String appName = call.getString("appName", "OpenKiosk");
        String appVersion = call.getString("appVersion", "1.0.0");

        if (macAddress == null || macAddress.isEmpty()) {
            call.reject("macAddress é obrigatório");
            return;
        }

        Log.i(TAG, "initialize: macAddress=" + macAddress + " app=" + appName + "/" + appVersion);

        // TODO Phase 1: Instantiate PlugPag with PlugPagCustomPrinterLayout,
        //               PlugPagAppIdentification, and Bluetooth connector.
        //
        // PlugPagAppIdentification appId = new PlugPagAppIdentification(appName, appVersion);
        // plugPag = new PlugPag(getContext(), appId);
        // plugPag.initBTConnection(new PlugPagDevice(macAddress));

        this.initialized = true;

        JSObject ret = new JSObject();
        ret.put("connected", true);
        ret.put("macAddress", macAddress);
        call.resolve(ret);
    }

    // =========================================================================
    // Payment — Card-Present
    // =========================================================================

    /**
     * Start a card-present payment on the PlugPag terminal.
     *
     * Expected params:
     *   amount:        number  — total in cents (e.g. 1500 = R$15,00)
     *   type:          string  — "CREDIT" | "DEBIT"
     *   installments:  number  — 1 for à vista (v1: always 1)
     *   printReceipt:  boolean — whether the terminal should print receipt
     *
     * Resolves with: { approved, cardBrand, cardLast4, nsu, authCode, transactionId, message }
     * Rejects with:  { code, message }
     */
    @PluginMethod()
    public void startPayment(PluginCall call) {
        if (!initialized) {
            call.reject("Terminal não inicializado. Chame initialize() primeiro.", "NOT_INITIALIZED");
            return;
        }

        Integer amount = call.getInt("amount");
        String type = call.getString("type", "DEBIT");
        Integer installments = call.getInt("installments", 1);
        Boolean printReceipt = call.getBoolean("printReceipt", false);

        if (amount == null || amount <= 0) {
            call.reject("amount obrigatório e > 0", "INVALID_AMOUNT");
            return;
        }

        Log.i(TAG, "startPayment: amount=" + amount + " type=" + type + " installments=" + installments);

        // TODO Phase 1: Execute on background thread
        // execute(() -> {
        //     PlugPagPaymentData paymentData = new PlugPagPaymentData(
        //         type.equals("CREDIT") ? PlugPag.TYPE_CREDITO : PlugPag.TYPE_DEBITO,
        //         amount,
        //         installments != null ? installments : 1,
        //         printReceipt != null && printReceipt
        //             ? PlugPag.PRINTER_ON : PlugPag.PRINTER_OFF,
        //         null // user reference
        //     );
        //
        //     PlugPagTransactionResult result = plugPag.doPayment(paymentData);
        //
        //     if (result.getResult() == PlugPag.RET_OK) {
        //         JSObject ret = new JSObject();
        //         ret.put("approved", true);
        //         ret.put("cardBrand", result.getCardBrand());
        //         ret.put("cardLast4", result.getBin()); // last 4
        //         ret.put("nsu", result.getNsu());
        //         ret.put("authCode", result.getAutoCode());
        //         ret.put("transactionId", result.getTransactionId());
        //         ret.put("message", result.getMessage());
        //         call.resolve(ret);
        //     } else {
        //         call.reject(result.getMessage(), String.valueOf(result.getResult()));
        //     }
        // });

        // Skeleton: return mock structure for build validation
        JSObject ret = new JSObject();
        ret.put("approved", false);
        ret.put("message", "SKELETON: PlugPag SDK não integrado ainda");
        ret.put("cardBrand", null);
        ret.put("cardLast4", null);
        ret.put("nsu", null);
        ret.put("authCode", null);
        ret.put("transactionId", null);
        call.resolve(ret);
    }

    /**
     * Abort the current in-progress payment on the terminal.
     * Should be called from the UI when user taps "Cancel".
     */
    @PluginMethod()
    public void abortPayment(PluginCall call) {
        if (!initialized) {
            call.reject("Terminal não inicializado.", "NOT_INITIALIZED");
            return;
        }

        Log.i(TAG, "abortPayment requested");

        // TODO Phase 1:
        // plugPag.abort();

        JSObject ret = new JSObject();
        ret.put("aborted", true);
        call.resolve(ret);
    }

    // =========================================================================
    // PIX Mirroring (Phase 2+) — display QR on terminal screen
    // =========================================================================

    /**
     * Display a PIX QR code on the terminal's screen.
     * The QR is generated by PagBank REST API (same code shown on tablet).
     *
     * Expected params:
     *   qrCodeText: string — EMV/BRCode payload
     */
    @PluginMethod()
    public void displayPixQR(PluginCall call) {
        String qrCodeText = call.getString("qrCodeText", "");
        if (qrCodeText == null || qrCodeText.isEmpty()) {
            call.reject("qrCodeText obrigatório", "INVALID_QR");
            return;
        }

        Log.i(TAG, "displayPixQR: length=" + qrCodeText.length());

        // TODO Phase 2: Use PlugPag's custom printer/display to show QR
        // This allows the same QR to appear on both tablet and maquininha.

        JSObject ret = new JSObject();
        ret.put("displayed", false);
        ret.put("message", "SKELETON: displayPixQR não implementado");
        call.resolve(ret);
    }

    // =========================================================================
    // Status & Discovery
    // =========================================================================

    /**
     * Check if the terminal is connected and ready.
     */
    @PluginMethod()
    public void getStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("initialized", initialized);
        ret.put("connected", initialized); // TODO: real connectivity check via plugPag.isAuthenticated()
        ret.put("sdkVersion", "skeleton-0.0.0");
        call.resolve(ret);
    }

    /**
     * Disconnect and release PlugPag resources.
     */
    @PluginMethod()
    public void disconnect(PluginCall call) {
        Log.i(TAG, "disconnect");
        // TODO Phase 1: plugPag.disconnect();
        initialized = false;

        JSObject ret = new JSObject();
        ret.put("disconnected", true);
        call.resolve(ret);
    }
}
