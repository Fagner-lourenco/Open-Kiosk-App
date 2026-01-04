import { useState, useCallback } from 'react';
import { Device } from '@capacitor/device';

/**
 * Hook para gerenciar PIN administrativo seguro
 * - Valida PIN numérico (4-6 dígitos)
 * - Rate limiting: máx 5 tentativas com delay progressivo
 * - Logging de auditoria
 */

/**
 * Obtém o storeId do localStorage (onde as settings são salvas)
 */
const getStoredStoreId = (): string => {
  try {
    const savedSettings = localStorage.getItem('storeSettings');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      return parsed.storeId || 'default';
    }
  } catch (error) {
    console.warn('[useAdminPin] Erro ao ler storeSettings:', error);
  }
  return 'default';
};

/**
 * PIN root padrão para primeiro acesso
 * IMPORTANTE: Após primeiro login, o admin deve configurar um novo PIN
 * SEGURANÇA: Configurado via variável de ambiente VITE_ROOT_PIN
 */
const ROOT_PIN = import.meta.env.VITE_ROOT_PIN || '000000';

// Validar que PIN foi configurado (log warning se usando fallback)
if (!import.meta.env.VITE_ROOT_PIN) {
  console.warn('[useAdminPin] ⚠️ VITE_ROOT_PIN não configurado! Usando PIN padrão inseguro.');
}

export interface PinValidationResult {
  valid: boolean;
  message?: string;
  attemptCount?: number;
  blockedUntil?: Date;
}

export const useAdminPin = () => {
  const [attempts, setAttempts] = useState(0);
  const [blockUntil, setBlockUntil] = useState<Date | null>(null);

  /**
   * Simular PBKDF2 (em ambiente real, usar crypto.subtle ou libsodium)
   * Para agora, usar um hash simples baseado no PIN
   * TODO: Implementar crypto.subtle.deriveKey em produção
   */
  const hashPin = async (pin: string, salt: string = 'default-salt'): Promise<string> => {
    // Concatenar PIN + salt
    const input = `${pin}:${salt}`;

    // Usar SubtleCrypto (Web API nativa - sem dependências!)
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(input);

        // PBKDF2 com 100,000 iterações (padrão seguro)
        const key = await crypto.subtle.importKey('raw', data, 'PBKDF2', false, ['deriveBits']);

        const derivedBits = await crypto.subtle.deriveBits(
          {
            name: 'PBKDF2',
            salt: encoder.encode(salt),
            iterations: 100000,
            hash: 'SHA-256',
          },
          key,
          256
        );

        // Converter para hex string
        const hashArray = Array.from(new Uint8Array(derivedBits));
        return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch (error) {
        console.error('[useAdminPin] Erro ao gerar hash PBKDF2:', error);
        // Fallback para hash simples
        return btoa(input);
      }
    }

    // Fallback: Base64 se SubtleCrypto não disponível
    // AVISO: Base64 não é criptograficamente seguro, apenas encoding
    console.warn('[useAdminPin] ⚠️ SubtleCrypto indisponível - usando Base64 (inseguro)');
    return btoa(input);
  };

  /**
   * Validar PIN com rate limiting
   */
  const validatePinWithRateLimit = useCallback(
    async (inputPin: string): Promise<PinValidationResult> => {
      try {
        // 1️⃣ Verificar se está bloqueado
        if (blockUntil && new Date() < blockUntil) {
          const remainingSeconds = Math.ceil((blockUntil.getTime() - new Date().getTime()) / 1000);
          const message = `Bloqueado. Tente novamente em ${remainingSeconds}s`;

          console.warn(`[useAdminPin] ${message}`);

          return {
            valid: false,
            message,
            blockedUntil: blockUntil,
            attemptCount: attempts,
          };
        }

        // 2️⃣ Validar PIN é numérico e 4-6 dígitos
        if (!/^\d{4,6}$/.test(inputPin)) {
          console.warn('[useAdminPin] PIN inválido: não é numérico ou tamanho errado');
          return {
            valid: false,
            message: 'PIN deve ter 4-6 dígitos',
          };
        }

        // 3️⃣ Buscar PIN criptografado do localStorage
        const storeId = getStoredStoreId();
        const storageKey = `adminPin_${storeId}`;
        const storedData = localStorage.getItem(storageKey);

        // 🔑 PRIMEIRO ACESSO: Se não há PIN configurado, aceitar PIN root
        if (!storedData) {
          console.log('[useAdminPin] Nenhum PIN configurado - verificando PIN root...');
          
          if (inputPin === ROOT_PIN) {
            // ✅ PIN root correto! Configurar automaticamente para próximos acessos
            console.log('[useAdminPin] ✅ PIN root aceito! Configurando para futuros acessos...');
            
            // Gerar salt e salvar hash do PIN root
            const salt = Math.random().toString(36).slice(2, 18);
            const pinHash = await hashPin(inputPin, salt);
            
            localStorage.setItem(
              storageKey,
              JSON.stringify({
                pinHash,
                salt,
                createdAt: new Date().toISOString(),
                isRootPin: true, // Marcar como PIN root (para sugerir troca depois)
              })
            );
            
            setAttempts(0);
            setBlockUntil(null);
            
            // Log auditoria
            const deviceId = await Device.getId();
            console.info('[useAdminPin] FIRST_ACCESS_ROOT_PIN', {
              deviceId: deviceId.identifier,
              timestamp: new Date().toISOString(),
            });
            
            return {
              valid: true,
              message: 'Primeiro acesso com PIN root - recomenda-se trocar o PIN',
              attemptCount: 0,
            };
          } else {
            // ❌ PIN root incorreto
            const newAttempts = attempts + 1;
            setAttempts(newAttempts);
            
            console.warn(`[useAdminPin] PIN root incorreto (tentativa ${newAttempts}/5)`);
            
            if (newAttempts >= 5) {
              const delaySeconds = Math.pow(2, newAttempts - 3);
              const blockTime = new Date(Date.now() + delaySeconds * 1000);
              setBlockUntil(blockTime);
            }
            
            return {
              valid: false,
              message: `PIN incorreto. Tentativas: ${newAttempts}/5`,
              attemptCount: newAttempts,
            };
          }
        }

        // 4️⃣ Fazer hash do PIN informado
        const { pinHash: storedHash, salt } = JSON.parse(storedData);
        const inputHash = await hashPin(inputPin, salt);

        // 5️⃣ Comparar hashes
        if (inputHash !== storedHash) {
          // ❌ PIN incorreto
          const newAttempts = attempts + 1;
          setAttempts(newAttempts);

          console.warn(`[useAdminPin] PIN incorreto (tentativa ${newAttempts}/5)`);

          // Bloquear após 5 tentativas
          if (newAttempts >= 5) {
            // Delay progressivo: 1s, 2s, 4s, 8s, 16s
            const delaySeconds = Math.pow(2, newAttempts - 3);
            const blockTime = new Date(Date.now() + delaySeconds * 1000);
            setBlockUntil(blockTime);

            // Log auditoria
            const deviceId = await Device.getId();
            console.error('[useAdminPin] BLOQUEADO - Múltiplas tentativas falhadas', {
              attempts: newAttempts,
              deviceId: deviceId.identifier,
              timestamp: new Date().toISOString(),
            });
          }

          return {
            valid: false,
            message: `PIN incorreto. Tentativas: ${newAttempts}/5`,
            attemptCount: newAttempts,
          };
        }

        // ✅ PIN correto!
        setAttempts(0);
        setBlockUntil(null);

        console.log('[useAdminPin] ✅ PIN validado com sucesso');

        // Log auditoria
        const deviceId = await Device.getId();
        console.info('[useAdminPin] ADMIN_PIN_SUCCESS', {
          deviceId: deviceId.identifier,
          timestamp: new Date().toISOString(),
        });

        return {
          valid: true,
          message: 'PIN correto',
          attemptCount: 0,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        console.error('[useAdminPin] Erro ao validar PIN:', error);

        return {
          valid: false,
          message: `Erro: ${errorMessage}`,
        };
      }
    },
    [attempts, blockUntil]
  );

  /**
   * Configurar PIN (apenas uma vez, por admin root)
   */
  const setAdminPin = useCallback(
    async (newPin: string): Promise<boolean> => {
      try {
        // Validar PIN
        if (!/^\d{4,6}$/.test(newPin)) {
          console.error('[useAdminPin] PIN inválido');
          return false;
        }

        // Gerar salt aleatório
        const salt = Math.random().toString(36).slice(2, 18);

        // Hash o novo PIN
        const pinHash = await hashPin(newPin, salt);

        // Salvar no localStorage
        const storeId = getStoredStoreId();
        const storageKey = `adminPin_${storeId}`;

        localStorage.setItem(
          storageKey,
          JSON.stringify({
            pinHash,
            salt,
            createdAt: new Date().toISOString(),
          })
        );

        console.log('[useAdminPin] ✅ PIN configurado com sucesso');
        return true;
      } catch (error) {
        console.error('[useAdminPin] Erro ao configurar PIN:', error);
        return false;
      }
    },
    []
  );

  /**
   * Reset de tentativas (apenas após desbloqueio bem-sucedido)
   */
  const resetAttempts = useCallback(() => {
    setAttempts(0);
    setBlockUntil(null);
    console.log('[useAdminPin] Tentativas resetadas');
  }, []);

  return {
    validatePinWithRateLimit,
    setAdminPin,
    resetAttempts,
    attempts,
    blockUntil,
    isBlocked: blockUntil ? new Date() < blockUntil : false,
  };
};
