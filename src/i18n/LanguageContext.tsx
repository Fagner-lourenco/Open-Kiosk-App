import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import en from './locales/en.json';
import ptBR from './locales/pt-BR.json';

export type Language = 'en' | 'pt-BR';
type Translations = typeof en;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  translations: Translations;
}

const translationsMap: Record<Language, Translations> = {
  'en': en,
  'pt-BR': ptBR,
};

const LANGUAGE_STORAGE_KEY = 'kiosk_language';

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

interface LanguageProviderProps {
  children: ReactNode;
  initialLanguage?: Language;
}

/**
 * Carrega idioma do localStorage (hot cache)
 */
const loadLanguageFromStorage = (): Language | null => {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language;
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
const saveLanguageToStorage = (lang: Language): void => {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // localStorage indisponível
  }
};

export const LanguageProvider = ({ children, initialLanguage = 'en' }: LanguageProviderProps) => {
  // Prioridade: localStorage > initialLanguage (Firebase) > 'en'
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = loadLanguageFromStorage();
    if (stored) {
      return stored;
    }
    if (initialLanguage && translationsMap[initialLanguage]) {
      return initialLanguage;
    }
    return 'en';
  });

  // Sincroniza quando initialLanguage muda (vindo do Firebase)
  // Mas só atualiza se for diferente E se não houver valor salvo localmente
  useEffect(() => {
    if (initialLanguage && translationsMap[initialLanguage]) {
      const stored = loadLanguageFromStorage();
      
      // Se não há nada salvo localmente, usa o do Firebase
      if (!stored) {
        console.log('[LanguageContext] Setting language from Firebase:', initialLanguage);
        setLanguageState(initialLanguage);
        saveLanguageToStorage(initialLanguage);
      } else if (stored !== initialLanguage) {
        // Se o local é diferente do Firebase, mantém o local
        // (usuário escolheu manualmente)
        console.log('[LanguageContext] Keeping local language preference:', stored);
      }
    }
  }, [initialLanguage]);

  /**
   * Altera o idioma e persiste localmente
   */
  const setLanguage = useCallback((lang: Language) => {
    if (!translationsMap[lang]) {
      console.warn('[LanguageContext] Invalid language:', lang);
      return;
    }
    
    console.log('[LanguageContext] Setting language:', lang);
    setLanguageState(lang);
    saveLanguageToStorage(lang);
    
    // Notifica para sync com Firebase (via evento customizado)
    try {
      window.dispatchEvent(new CustomEvent('language-changed', { detail: { language: lang } }));
    } catch {
      // Evento não suportado
    }
  }, []);

  // Função de tradução com suporte a nested keys: t('checkout.title')
  // E suporte a interpolação: t('shop.stockCount', { count: 5 }) -> "5 em estoque"
  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let value: unknown = translationsMap[language];
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        // Fallback para inglês se não encontrar
        let fallbackValue: unknown = translationsMap['en'];
        for (const fk of keys) {
          if (fallbackValue && typeof fallbackValue === 'object' && fk in fallbackValue) {
            fallbackValue = (fallbackValue as Record<string, unknown>)[fk];
          } else {
            console.warn(`Translation missing: ${key}`);
            return key;
          }
        }
        value = fallbackValue;
        break;
      }
    }
    
    let result = typeof value === 'string' ? value : key;
    
    // Interpolação de variáveis: substitui {{variavel}} pelos valores
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
      translations: translationsMap[language] 
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
