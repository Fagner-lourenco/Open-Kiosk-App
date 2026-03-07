/**
 * Payment Gateway Context
 * 
 * Provê configuração de gateway de pagamento para toda a árvore de componentes,
 * evitando prop drilling. Sincroniza automaticamente com StoreSettings.
 */

import { createContext, useContext, useMemo, useEffect, type ReactNode } from 'react';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import type { PaymentGatewayConfig, EnabledPaymentMethods } from '@/types/store';
import { getPaymentConfig, type ResolvedPaymentConfig, isPaymentConfigured } from '@/config/paymentGateway';

/** Métodos de pagamento habilitados com defaults */
const DEFAULT_ENABLED_METHODS: EnabledPaymentMethods = {
  cash: true,
  pix: true,
  credit: true,
  debit: true,
};

/**
 * Valor do contexto de gateway de pagamento
 */
interface PaymentGatewayContextValue {
  /** Configuração bruta do Firestore (pode ser null se não configurado) */
  gatewayConfig: PaymentGatewayConfig | null;
  
  /** Configuração resolvida com fallback para env vars */
  resolvedConfig: ResolvedPaymentConfig;
  
  /** Se pagamentos estão configurados (Firestore ou env vars) */
  isConfigured: boolean;
  
  /** Fonte da configuração atual */
  source: 'firestore' | 'env';
  
  /** Se está carregando configurações */
  isLoading: boolean;
  
  /** Métodos de pagamento habilitados (cash, pix, credit, debit) */
  enabledMethods: EnabledPaymentMethods;
}

const PaymentGatewayContext = createContext<PaymentGatewayContextValue>({
  gatewayConfig: null,
  resolvedConfig: getPaymentConfig(null),
  isConfigured: false,
  source: 'env',
  isLoading: true,
  enabledMethods: DEFAULT_ENABLED_METHODS,
});

interface PaymentGatewayProviderProps {
  children: ReactNode;
}

/**
 * Provider que sincroniza configuração de pagamento com StoreSettings
 */
export function PaymentGatewayProvider({ children }: PaymentGatewayProviderProps) {
  const { settings, loading } = useStoreSettings();

  const value = useMemo<PaymentGatewayContextValue>(() => {
    const gatewayConfig = settings?.paymentGatewayConfig || null;
    const resolvedConfig = getPaymentConfig(gatewayConfig);
    
    // Keep source semantics aligned with getPaymentConfig().
    const source = resolvedConfig.source;
    
    const isConfigured = isPaymentConfigured(gatewayConfig);
    
    // Métodos de pagamento habilitados (default: todos true)
    const enabledMethods: EnabledPaymentMethods = {
      cash: gatewayConfig?.enabledMethods?.cash ?? true,
      pix: gatewayConfig?.enabledMethods?.pix ?? true,
      credit: gatewayConfig?.enabledMethods?.credit ?? true,
      debit: gatewayConfig?.enabledMethods?.debit ?? true,
    };
    
    return {
      gatewayConfig,
      resolvedConfig,
      isConfigured,
      source,
      isLoading: loading,
      enabledMethods,
    };
  }, [settings?.paymentGatewayConfig, loading]);

  // 🔍 DIAG: Log payment gateway resolution para debug de sync
  useEffect(() => {
    if (!loading) {
      console.log('[PaymentGateway] provider=%s source=%s gatewayConfig.provider=%s resolvedConfig.provider=%s',
        value.gatewayConfig?.provider || '(null)',
        value.source,
        value.gatewayConfig?.provider || '(null)',
        value.resolvedConfig.provider
      );
    }
  }, [value.gatewayConfig?.provider, value.source, value.resolvedConfig.provider, loading]);

  return (
    <PaymentGatewayContext.Provider value={value}>
      {children}
    </PaymentGatewayContext.Provider>
  );
}

/**
 * Hook para acessar configuração de gateway de pagamento
 * 
 * @example
 * ```tsx
 * function CheckoutComponent() {
 *   const { resolvedConfig, isConfigured, source } = usePaymentGateway();
 *   
 *   if (!isConfigured) {
 *     return <div>Pagamentos não configurados</div>;
 *   }
 *   
 *   console.log(`Usando config de: ${source}`);
 *   // Usar resolvedConfig.accessToken, resolvedConfig.externalPosId, etc.
 * }
 * ```
 */
export const usePaymentGateway = () => {
  const context = useContext(PaymentGatewayContext);
  
  if (context === undefined) {
    throw new Error('usePaymentGateway must be used within a PaymentGatewayProvider');
  }
  
  return context;
};

/**
 * Hook simplificado que retorna apenas a config resolvida
 * Para casos onde só precisa da configuração, sem metadados
 */
export const useResolvedPaymentConfig = (): ResolvedPaymentConfig => {
  const { resolvedConfig } = usePaymentGateway();
  return resolvedConfig;
};

export default PaymentGatewayContext;
