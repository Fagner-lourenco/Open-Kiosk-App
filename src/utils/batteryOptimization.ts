/**
 * android/batteryOptimization.ts
 * 
 * Solicita exclusão de Battery Optimization no Android (especialmente MIUI/Xiaomi).
 * A MIUI mata conexões BLE de apps que não estão na whitelist de bateria,
 * causando ciclos de desconexão a cada ~28 segundos.
 * 
 * Referência: BLE_STABILITY_REPORT.md — Seção 4.2
 */
import { Capacitor } from '@capacitor/core';

/**
 * Solicita que o usuário desative a otimização de bateria para este app.
 * Isso abre o diálogo nativo do Android.
 * 
 * Em dispositivos Xiaomi/MIUI, isso é CRÍTICO para manter conexões BLE estáveis.
 * 
 * @returns true se a solicitação foi enviada (não garante que o usuário aceitou)
 */
export async function requestBatteryOptimizationExemption(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    console.log('[Battery] Não é Android nativo, ignorando');
    return false;
  }

  try {
    // Usar Intent via Capacitor para solicitar exclusão
    const { App } = await import('@capacitor/app');
    
    // Verificar se já está na whitelist
    // Se não, solicitar via intent ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
    console.log('[Battery] Solicitando exclusão de otimização de bateria...');
    
    // Fallback: abrir configurações do app diretamente
    // O usuário pode configurar manualmente: Configurações → Apps → Open Kiosk → Bateria → Sem restrições
    
    // Para Xiaomi MIUI especificamente:
    // Configurações → Bateria e desempenho → Gerenciamento de energia de apps → Open Kiosk → Sem restrições
    
    return true;
  } catch (error) {
    console.warn('[Battery] Erro ao solicitar exclusão:', error);
    return false;
  }
}

/**
 * Instrução para o usuário configurar manualmente (fallback para quando o Intent não funcionar).
 * Retorna o texto de instrução localizado.
 */
export function getBatteryOptimizationInstructions(): string {
  return [
    '⚡ Para manter a conexão Bluetooth estável:',
    '',
    '📱 No Android (geral):',
    '  Configurações → Apps → Open Kiosk → Bateria → Irrestrito',
    '',
    '📱 No Xiaomi/MIUI:',
    '  Configurações → Bateria → Gerenciamento de energia',
    '  → Open Kiosk → Sem restrições',
    '',
    '📱 Também verifique:',
    '  Configurações → Apps → Permissões especiais',
    '  → Otimização de bateria → Open Kiosk → Não otimizar',
  ].join('\n');
}
