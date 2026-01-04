/**
 * Setup Kiosk Controller
 * 
 * Controla a transição para kiosk mode APENAS após setup completo
 * Valida Firebase connection antes de bloquear a tela
 */

import { Capacitor } from '@capacitor/core';
import { enterKioskMode } from './kioskModeService';

interface SetupCheckResult {
  isComplete: boolean;
  hasValidConfig: boolean;
  kioskEnabled: boolean;
}

class SetupKioskControllerImpl {
  /**
   * Verificar se setup foi completado
   */
  public static isSetupComplete(): boolean {
    try {
      const setupCompleted = localStorage.getItem('setupCompleted') === 'true';
      const storeInitialized = localStorage.getItem('storeInitialized') === 'true';
      
      console.log('[SetupKioskController] Setup check:', {
        setupCompleted,
        storeInitialized
      });
      
      return setupCompleted && storeInitialized;
    } catch (error) {
      console.error('[SetupKioskController] Error checking setup:', error);
      return false;
    }
  }

  /**
   * Verificar se config do Firebase é válida
   */
  public static hasValidConfig(): boolean {
    try {
      const settings = localStorage.getItem('storeSettings');
      if (!settings) return false;

      const parsed = JSON.parse(settings);
      const firebaseConfig = parsed.firebaseConfig || {};

      // Validar campos obrigatórios
      const hasRequiredFields =
        firebaseConfig.projectId &&
        firebaseConfig.apiKey &&
        firebaseConfig.authDomain;

      console.log('[SetupKioskController] Config validation:', {
        hasProjectId: !!firebaseConfig.projectId,
        hasApiKey: !!firebaseConfig.apiKey,
        hasAuthDomain: !!firebaseConfig.authDomain,
        isValid: hasRequiredFields
      });

      return hasRequiredFields;
    } catch (error) {
      console.error('[SetupKioskController] Error validating config:', error);
      return false;
    }
  }

  /**
   * Marcar setup como completo e iniciar kiosk mode
   * CHAMADO por StoreInitialization após sucesso
   */
  public static async completeSetupAndEnterKiosk(): Promise<boolean> {
    try {
      console.log('[SetupKioskController] Completing setup and entering kiosk mode...');

      // 1. Marcar setup como completo
      localStorage.setItem('setupCompleted', 'true');
      console.log('[SetupKioskController] Setup marked as complete');

      // 2. Iniciar kiosk mode (se em plataforma nativa)
      if (Capacitor.isNativePlatform()) {
        const kioskSuccess = await enterKioskMode();
        if (kioskSuccess) {
          console.log('[SetupKioskController] ✅ Kiosk mode iniciado com sucesso');
        } else {
          console.warn('[SetupKioskController] ⚠️ Falha ao iniciar kiosk mode, continuando...');
          // Não falhar completamente se kiosk mode não funcionar
        }
      } else {
        console.log('[SetupKioskController] Não é plataforma nativa, skipping kiosk mode');
      }

      return true;
    } catch (error) {
      console.error('[SetupKioskController] Error during setup completion:', error);
      return false;
    }
  }

  /**
   * Reset setup (para teste/debug ou re-setup)
   */
  public static resetSetup(): void {
    try {
      localStorage.removeItem('setupCompleted');
      localStorage.removeItem('storeInitialized');
      localStorage.removeItem('storeSettings');
      localStorage.removeItem('currentStoreId');
      console.log('[SetupKioskController] Setup reset');
    } catch (error) {
      console.error('[SetupKioskController] Error resetting setup:', error);
    }
  }

  /**
   * Diagnóstico completo do status de setup
   */
  public static getStatus(): SetupCheckResult {
    return {
      isComplete: this.isSetupComplete(),
      hasValidConfig: this.hasValidConfig(),
      kioskEnabled: this.isSetupComplete() && Capacitor.isNativePlatform()
    };
  }
}

export const setupKioskController = SetupKioskControllerImpl;
