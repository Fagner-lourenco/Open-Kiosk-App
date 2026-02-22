/**
 * Environment Config Loader
 * 
 * Carrega arquivo de configuração (.env.local.json) para pré-preencher
 * campos de setup automaticamente
 */

import { Clipboard } from '@capacitor/clipboard';
import { Capacitor } from '@capacitor/core';

// Interface local para config parcial (todos os campos opcionais)
interface EnvConfig {
  storeId?: string;
  name?: string;
  currency?: string;
  taxPercentage?: number;
  taxId?: string;
  firebaseConfig?: {
    apiKey?: string;
    authDomain?: string;
    projectId?: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId?: string;
  };
}

// Tipo de retorno que aceita firebaseConfig parcial
export interface PartialStoreConfig {
  storeId?: string;
  name?: string;
  currency?: string;
  taxPercentage?: number;
  taxId?: string;
  firebaseConfig?: {
    apiKey?: string;
    authDomain?: string;
    projectId?: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId?: string;
  };
}

/**
 * Validar schema básico do arquivo de config
 */
const validateConfigSchema = (data: any): void => {
  if (!data || typeof data !== 'object') {
    throw new Error('Config deve ser um objeto JSON válido');
  }

  // Validar firebaseConfig se presente
  if (data.firebaseConfig) {
    const { firebaseConfig } = data;
    if (typeof firebaseConfig !== 'object') {
      throw new Error('firebaseConfig deve ser um objeto');
    }

    // Pelo menos projectId e apiKey devem estar presentes
    if (!firebaseConfig.projectId) {
      throw new Error('firebaseConfig.projectId é obrigatório');
    }
    if (!firebaseConfig.apiKey) {
      throw new Error('firebaseConfig.apiKey é obrigatório');
    }
  }

  console.log('[EnvironmentLoader] Schema validation passed');
};

/**
 * Carregar arquivo de config bundled com a aplicação
 * Procura em:
 * 1. /config/.env.local.json (desenvolvimento)
 * 2. /assets/config/.env.local.json (build Android)
 */
export const loadEnvironmentConfig = async (): Promise<PartialStoreConfig | null> => {
  const paths = [
    '/config/.env.local.json',
    '/assets/config/.env.local.json',
    '/.env.local.json'
  ];

  for (const path of paths) {
    try {
      console.log(`[EnvironmentLoader] Tentando carregar: ${path}`);
      const response = await fetch(path);

      if (!response.ok) {
        console.log(`[EnvironmentLoader] ${path} não encontrado (status: ${response.status})`);
        continue;
      }

      const data = await response.json() as EnvConfig;

      // Validar schema
      validateConfigSchema(data);

      console.log('[EnvironmentLoader] ✅ Config carregado com sucesso:', {
        hasStoreId: !!data.storeId,
        hasTaxId: !!data.taxId,
        hasFirebaseConfig: !!data.firebaseConfig,
        hasProjectId: !!data.firebaseConfig?.projectId
      });

      return data;
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.warn(`[EnvironmentLoader] JSON inválido em ${path}:`, error.message);
      } else if (error instanceof Error && error.message.includes('Config')) {
        console.warn(`[EnvironmentLoader] Validação falhou em ${path}:`, error.message);
      }
      // Continuar procurando próximo arquivo
    }
  }

  console.log('[EnvironmentLoader] Nenhum arquivo de config encontrado, usando campos vazios');
  return null;
};

/**
 * Importar config de arquivo JSON selecionado pelo usuário
 */
export const importConfigFromFile = async (file: File): Promise<PartialStoreConfig> => {
  try {
    const text = await file.text();
    const data = JSON.parse(text) as EnvConfig;

    validateConfigSchema(data);

    console.log('[EnvironmentLoader] Config importada de arquivo');
    return data;
  } catch (error) {
    console.error('[EnvironmentLoader] Erro ao importar arquivo:', error);
    throw new Error(`Erro ao importar config: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Importar config de JSON colado do clipboard
 * Usa @capacitor/clipboard para suporte nativo em Android/iOS
 */
export const importConfigFromClipboard = async (): Promise<PartialStoreConfig> => {
  try {
    let text: string;

    // Usar plugin Capacitor em plataforma nativa, navigator em web
    if (Capacitor.isNativePlatform()) {
      const result = await Clipboard.read();
      if (result.type !== 'text/plain' || !result.value) {
        throw new Error('Clipboard não contém texto válido');
      }
      text = result.value;
    } else {
      text = await navigator.clipboard.readText();
    }

    const data = JSON.parse(text) as EnvConfig;

    validateConfigSchema(data);

    console.log('[EnvironmentLoader] Config importada de clipboard');
    return data;
  } catch (error) {
    console.error('[EnvironmentLoader] Erro ao ler clipboard:', error);
    throw new Error(`Erro ao colar config: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Exportar config atual como JSON para clipboard
 * Usa @capacitor/clipboard para suporte nativo em Android/iOS
 */
export const exportConfigToClipboard = async (settings: PartialStoreConfig): Promise<boolean> => {
  try {
    const json = JSON.stringify(settings, null, 2);

    // Usar plugin Capacitor em plataforma nativa, navigator em web
    if (Capacitor.isNativePlatform()) {
      await Clipboard.write({ string: json });
    } else {
      await navigator.clipboard.writeText(json);
    }

    console.log('[EnvironmentLoader] Config copiada para clipboard');
    return true;
  } catch (error) {
    console.error('[EnvironmentLoader] Erro ao copiar para clipboard:', error);
    return false;
  }
};

/**
 * Mesclar config carregada com valores padrão
 */
export const mergeWithDefaults = (
  envConfig: PartialStoreConfig,
  defaults: PartialStoreConfig
): PartialStoreConfig => {
  return {
    storeId: envConfig.storeId || defaults.storeId,
    name: envConfig.name || defaults.name,
    currency: envConfig.currency || defaults.currency,
    taxPercentage: envConfig.taxPercentage ?? defaults.taxPercentage,
    taxId: envConfig.taxId || defaults.taxId,
    firebaseConfig: {
      apiKey: envConfig.firebaseConfig?.apiKey || defaults.firebaseConfig?.apiKey || '',
      authDomain: envConfig.firebaseConfig?.authDomain || defaults.firebaseConfig?.authDomain || '',
      projectId: envConfig.firebaseConfig?.projectId || defaults.firebaseConfig?.projectId || '',
      storageBucket: envConfig.firebaseConfig?.storageBucket || defaults.firebaseConfig?.storageBucket || '',
      messagingSenderId: envConfig.firebaseConfig?.messagingSenderId || defaults.firebaseConfig?.messagingSenderId || '',
      appId: envConfig.firebaseConfig?.appId || defaults.firebaseConfig?.appId || ''
    }
  };
};
