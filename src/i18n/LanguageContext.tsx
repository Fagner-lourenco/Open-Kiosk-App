import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import en from './locales/en.json';
import ptBR from './locales/pt-BR.json';

export type Language = 'en' | 'pt-BR';
type Translations = typeof en;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  translations: Translations;
  isKiosk: boolean;
}

const translationsMap: Record<Language, Translations> = {
  'en': en,
  'pt-BR': ptBR,
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

interface LanguageProviderProps {
  children: ReactNode;
  initialLanguage?: Language;
  storeId?: string;
  isKiosk?: boolean;
}

// Chaves de storage dinâmicas
const getStorageKey = (isKiosk: boolean, storeId?: string) => {
  if (isKiosk) {
    return storeId ? `kiosk_language_${storeId}` : 'kiosk_language_default';
  }
  return 'admin_language';
};

/**
 * Carrega idioma do localStorage (hot cache)
 */
const loadLanguageFromStorage = (key: string): Language | null => {
  try {
    const saved = localStorage.getItem(key) as Language;
    if (saved && translationsMap[saved]) {
      return saved;
    }
  } catch {
    // localStorage indisponível
  }
  return null;
};

/**
 * Salva idioma no localStorage
 */
const saveLanguageToStorage = (key: string, lang: Language): void => {
  try {
    localStorage.setItem(key, lang);
  } catch {
    // localStorage indisponível
  }
};

export const LanguageProvider = ({
  children,
  initialLanguage,
  storeId,
  isKiosk = false
}: LanguageProviderProps) => {
  const storageKey = getStorageKey(isKiosk, storeId);

  // Track manual override in the current session
  const [isManualOverride, setIsManualOverride] = useState(false);

  // Ref para rastrear se o primeiro carregamento do Firebase já aconteceu
  const firebaseDataApplied = useRef(false);

  // Inicialização: Prioridade: localStorage > initialLanguage (se pronto) > 'en'
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = loadLanguageFromStorage(storageKey);
    if (stored) {
      console.log(`[LanguageContext:Init] Found stored lang for ${storageKey}:`, stored);
      return stored;
    }

    // Se initialLanguage já veio (raro no boot frio, mas possível no hot reload)
    if (initialLanguage && translationsMap[initialLanguage]) {
      console.log(`[LanguageContext:Init] Using initialLanguage:`, initialLanguage);
      return initialLanguage;
    }

    // Importante: não salvar 'en' no storage agora se for apenas fallback de boot
    return 'en';
  });

  // Reconciliação com Firebase/Settings
  useEffect(() => {
    // Se initialLanguage é nulo/undefined, ainda estamos em loading. Não fazemos nada.
    if (!initialLanguage || !translationsMap[initialLanguage]) return;

    // Se o usuário já mudou manualmente nesta sessão, ignoramos o que vem do Firebase
    // para não "dar susto" no usuário enquanto ele navega.
    if (isManualOverride) {
      console.log('[LanguageContext:Sync] Ignoring Firebase update due to manual override');
      return;
    }

    const stored = loadLanguageFromStorage(storageKey);

    // Hardening: Se for kiosk e storeId ainda for 'default', evitamos aplicar logicamente
    // se o initialLanguage (Firestore) vier de uma loja específica. 
    // Isso evita fragmentação de chaves durante o boot.
    if (isKiosk && storageKey === 'kiosk_language_default' && initialLanguage) {
      console.log('[LanguageContext:Sync] Waiting for stable storeId before applying Firebase settings...');
      return;
    }

    // Se o que temos no state (ou storage) é diferente do que veio do Firebase
    // e NÃO houve override manual, o Firebase vence (Fonte Única)
    if (language !== initialLanguage) {
      console.log(`[LanguageContext:Sync] Applying Firebase language: ${initialLanguage} over ${language} (Key: ${storageKey})`);
      setLanguageState(initialLanguage);

      // Persiste no storage apenas para cache de boot rápido (fallback offline)
      saveLanguageToStorage(storageKey, initialLanguage);
    }

    firebaseDataApplied.current = true;
  }, [initialLanguage, storageKey, isManualOverride, language]);

  /**
   * Altera o idioma e persiste localmente como override manual
   */
  const setLanguage = useCallback((lang: Language) => {
    if (!translationsMap[lang]) {
      console.warn('[LanguageContext] Invalid language:', lang);
      return;
    }

    console.log(`[LanguageContext:Update] Setting language to ${lang} (Manual)`);
    setLanguageState(lang);
    setIsManualOverride(true);
    saveLanguageToStorage(storageKey, lang);

    // Notifica para sync com Firebase (via evento customizado)
    try {
      window.dispatchEvent(new CustomEvent('language-changed', { detail: { language: lang } }));
    } catch {
      // Evento não suportado
    }
  }, [storageKey]);

  // Função de tradução com suporte a nested keys e interpolação
  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let value: unknown = translationsMap[language];

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        // Fallback para inglês
        let fallbackValue: unknown = translationsMap['en'];
        let found = true;
        for (const fk of keys) {
          if (fallbackValue && typeof fallbackValue === 'object' && fk in fallbackValue) {
            fallbackValue = (fallbackValue as Record<string, unknown>)[fk];
          } else {
            found = false;
            break;
          }
        }
        if (found && typeof fallbackValue === 'string') {
          value = fallbackValue;
        } else {
          // console.warn(`Translation missing: ${key}`);
          return key;
        }
        break;
      }
    }

    let result = typeof value === 'string' ? value : key;

    if (params) {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        result = result.replace(new RegExp(`\\{\\{${paramKey}\\}\\}`, 'g'), String(paramValue));
      });
    }

    return result;
  }, [language]);

  return (
    <LanguageContext.Provider value={{
      language,
      setLanguage,
      t,
      translations: translationsMap[language],
      isKiosk
    }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};

export const useTranslation = () => {
  const { t, language } = useLanguage();
  return { t, language };
};
