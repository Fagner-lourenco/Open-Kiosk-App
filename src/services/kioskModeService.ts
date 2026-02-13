/**
 * Kiosk Mode Service - Controle do Lock Task Mode do Android
 * 
 * Este serviço permite controlar o modo kiosk (Lock Task) do Android
 * a partir do JavaScript/TypeScript via plugin Capacitor nativo.
 */

import { registerPlugin, Capacitor } from '@capacitor/core';

interface KioskModePlugin {
  exitLockTask(options?: { pin?: string }): Promise<void>;
  startLockTask(): Promise<void>;
  isInLockTaskMode(): Promise<{ locked: boolean }>;
}

// Registrar plugin apenas se estiver em plataforma nativa
const KioskMode = Capacitor.isNativePlatform()
  ? registerPlugin<KioskModePlugin>('KioskMode')
  : null;

/**
 * Sair do modo kiosk (Lock Task)
 * Permite que o usuário saia do app após autenticação admin
 * @param pin PIN de manutenção exigido pelo plugin nativo (AND-01)
 */
export const exitKioskMode = async (pin: string): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) {
    console.log('[KioskMode] Não é plataforma nativa, ignorando');
    return true;
  }

  if (!KioskMode) {
    console.warn('[KioskMode] Plugin não disponível');
    return false;
  }

  try {
    await KioskMode.exitLockTask({ pin });
    console.log('[KioskMode] Lock Task encerrado com sucesso');
    return true;
  } catch (error) {
    console.error('[KioskMode] Erro ao sair do Lock Task:', error);
    return false;
  }
};

/**
 * Entrar no modo kiosk (Lock Task)
 * Bloqueia o dispositivo no app
 */
export const enterKioskMode = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) {
    console.log('[KioskMode] Não é plataforma nativa, ignorando');
    return true;
  }

  if (!KioskMode) {
    console.warn('[KioskMode] Plugin não disponível');
    return false;
  }

  try {
    await KioskMode.startLockTask();
    console.log('[KioskMode] Lock Task iniciado com sucesso');
    return true;
  } catch (error) {
    console.error('[KioskMode] Erro ao iniciar Lock Task:', error);
    return false;
  }
};

/**
 * Verificar se está em modo kiosk
 */
export const isInKioskMode = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  if (!KioskMode) {
    return false;
  }

  try {
    const result = await KioskMode.isInLockTaskMode();
    return result.locked;
  } catch (error) {
    console.error('[KioskMode] Erro ao verificar Lock Task:', error);
    return false;
  }
};
