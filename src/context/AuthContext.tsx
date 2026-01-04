import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef } from 'react';

/**
 * Contexto de autenticação global para o painel administrativo
 * Gerencia:
 * - Estado de autenticação (PIN validado)
 * - Timeout de sessão automático
 * - Detecção de inatividade
 */

export interface AuthContextType {
  isAuthenticated: boolean;
  sessionTimeout: number; // minutos
  setIsAuthenticated: (value: boolean) => void;
  setSessionTimeout: (minutes: number) => void;
  logout: () => void;
  resetInactivityTimer: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthContextProvider');
  }
  return context;
};

interface AuthContextProviderProps {
  children: ReactNode;
}

export const AuthContextProvider: React.FC<AuthContextProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState(30); // 30 minutos
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Resetar timer de inatividade
   * Chamado toda vez que usuário interage com a tela
   */
  const resetInactivityTimer = useCallback(() => {
    // Limpar timer anterior
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    // Apenas contar se está autenticado
    if (!isAuthenticated) return;

    // Novo timer
    inactivityTimerRef.current = setTimeout(() => {
      console.log('[Auth] Sessão admin expirada por inatividade');
      setIsAuthenticated(false);

      // Log auditoria
      console.warn('[Auth] Admin session expired - INACTIVITY');

      // Navegar para landing page
      window.location.hash = '/';
    }, sessionTimeout * 60 * 1000);
  }, [isAuthenticated, sessionTimeout]);

  /**
   * Detectar interação do usuário e resetar timer de inatividade
   */
  useEffect(() => {
    if (!isAuthenticated) return;

    const events = ['mousedown', 'keydown', 'touchstart', 'click'];

    const handleInteraction = () => {
      resetInactivityTimer();
    };

    // Adicionar listeners
    events.forEach((evt) => {
      window.addEventListener(evt, handleInteraction, { passive: true });
    });

    // Timer inicial
    resetInactivityTimer();

    // Cleanup
    return () => {
      events.forEach((evt) => {
        window.removeEventListener(evt, handleInteraction);
      });
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [isAuthenticated, sessionTimeout, resetInactivityTimer]);

  /**
   * Função de logout explícito
   */
  const logout = useCallback(() => {
    console.log('[Auth] Logout manual');
    setIsAuthenticated(false);
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
  }, []);

  const value: AuthContextType = {
    isAuthenticated,
    sessionTimeout,
    setIsAuthenticated,
    setSessionTimeout,
    logout,
    resetInactivityTimer,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
