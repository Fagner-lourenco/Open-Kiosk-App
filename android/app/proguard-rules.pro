# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ============================================================================
# F-05: ProGuard rules preparadas para habilitação futura de minifyEnabled
# IMPORTANTE: Só ativar minifyEnabled true após testar em dispositivo real
# com terminal PlugPag conectado.
# ============================================================================

# --- Capacitor ---
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public <methods>;
    @com.getcapacitor.annotation.PermissionCallback <methods>;
}

# --- PlugPag SDK (PagBank) ---
# O SDK usa reflection internamente; manter todas as classes públicas
-keep class br.com.uol.pagseguro.plugpag.** { *; }
-dontwarn br.com.uol.pagseguro.plugpag.**

# --- Open Kiosk plugins ---
-keep class com.openkiosk.app.KioskModePlugin { *; }
-keep class com.openkiosk.app.PlugPagTerminalPlugin { *; }
-keep class com.openkiosk.app.MainActivity { *; }
-keep class com.openkiosk.app.PlugPagCompatContext { *; }

# --- WebView JS interface ---
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
