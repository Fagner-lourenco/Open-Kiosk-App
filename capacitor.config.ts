import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.openkiosk.app',
  appName: 'Open Kiosk',
  webDir: 'dist',
  
  // Configurações de plugins
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#ffffff',
    },
    BluetoothLe: {
      // Habilita BLE para comunicação ESP32
      displayStrings: {
        scanning: 'Escaneando dispositivos...',
        cancel: 'Cancelar',
        availableDevices: 'Dispositivos disponíveis',
        noDeviceFound: 'Nenhum dispositivo encontrado',
      },
    },
  },
  
  // Configurações Android
  android: {
    allowMixedContent: true, // Permite HTTP em WebView (para ESP32 local)
    captureInput: true,
    // 🔒 FIX BUG-NEW-8: Hardcode false for production builds.
    // process.env.NODE_ENV is unreliable during `cap sync`.
    webContentsDebuggingEnabled: false,
  },
  
  // Servidor (para hot reload em desenvolvimento)
  server: {
    androidScheme: 'https',
    cleartext: true, // Permite HTTP para ESP32
  },
};

export default config;
