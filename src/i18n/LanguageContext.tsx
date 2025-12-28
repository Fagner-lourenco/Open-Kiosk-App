import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

interface LanguageProviderProps {
  children: ReactNode;
  initialLanguage?: Language;
}

export const LanguageProvider = ({ children, initialLanguage = 'en' }: LanguageProviderProps) => {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  // Sincronizar com initialLanguage quando ele mudar (ex: vindo do Firebase)
  useEffect(() => {
    if (initialLanguage && translationsMap[initialLanguage]) {
      setLanguageState(initialLanguage);
      try {
        localStorage.setItem('kiosk_language', initialLanguage);
      } catch {
        // localStorage indisponível (modo privado, quota excedida)
      }
    }
  }, [initialLanguage]);

  // Carregar idioma do localStorage como fallback inicial
  useEffect(() => {
    try {
      const savedLang = localStorage.getItem('kiosk_language') as Language;
      if (savedLang && translationsMap[savedLang]) {
        setLanguageState(savedLang);
      }
    } catch {
      // localStorage indisponível
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('kiosk_language', lang);
    } catch {
      // localStorage indisponível
    }
  };

  // Função de tradução com suporte a nested keys: t('checkout.title')
  // E suporte a interpolação: t('shop.stockCount', { count: 5 }) -> "5 em estoque"
  const t = (key: string, params?: Record<string, string | number>): string => {
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
  };

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
