import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef } from 'react';
import { authService } from '../services/authService';
import { AuthenticatedUser } from '../types/franchise';
import { systemLogService } from '../services/systemLogService';

/**
 * ============================================================================
 * Contexto de Autenticação
 * ============================================================================
 * 
 * Gerencia autenticação do painel administrativo.
 * 
 * Modos de operação:
 * - Firebase Auth + fallback PIN offline
 * 
 * Em todos os casos:
 * - Timeout de sessão automático
 * - Detecção de inatividade
 * - PIN como fallback offline
 * 
 * @author Open Kiosk Project
 * @version 2.0.0
 */

// ============================================================================
// TIPOS
// ============================================================================

export interface AuthContextType {
  /** Usuário autenticado (Firebase) */
  user: AuthenticatedUser | null;
  
  /** Se está autenticado (PIN ou Firebase) */
  isAuthenticated: boolean;
  
  /** Se está em modo offline (autenticado via PIN) */
  isOfflineMode: boolean;
  
  /** Se está carregando estado de auth */
  isLoading: boolean;
  
  /** Timeout de sessão em minutos */
  sessionTimeout: number;
  
  /** Erro de autenticação */
  authError: string | null;
  
  // === Ações ===
  setSessionTimeout: (minutes: number) => void;
  logout: () => void;
  resetInactivityTimer: () => void;
  
  // === Ações (Firebase) ===
  loginWithEmail: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginWithPin: (pin: string) => Promise<{ success: boolean; error?: string }>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthContextProvider');
  }
  return context;
};

// ============================================================================
// PROVIDER
// ============================================================================

interface AuthContextProviderProps {
  children: ReactNode;
  isKiosk?: boolean;
}

export const AuthContextProvider: React.FC<AuthContextProviderProps> = ({ children, isKiosk = false }) => {
  // Estado Firebase
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  
  // Estado PIN (offline)
  const [isPinAuthenticated, setIsPinAuthenticated] = useState(false);
  
  // Configurações
  const [sessionTimeout, setSessionTimeout] = useState(30); // 30 minutos
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ==========================================================================
  // COMPUTED
  // ==========================================================================

  // Autenticado se tem user OU PIN válido
  const isAuthenticated = user !== null || isPinAuthenticated;

  const isOfflineMode = (user === null && isPinAuthenticated) || authService.isOfflineMode();

  // ==========================================================================
  // FIREBASE AUTH LISTENER
  // ==========================================================================

  useEffect(() => {
    // Inicializa authService em modo franchise (Firebase já inicializado via firebase.ts)
    if (!authService.isInitialized()) {
      console.log('[AuthContext] Inicializando authService para modo franchise...');
      authService.initialize();
    }

    const unsubscribe = authService.onAuthStateChange((authUser) => {
      setUser(authUser);
      setIsLoading(false);
      
      // Se tem usuário Firebase, limpa auth via PIN
      if (authUser && !authService.isOfflineMode()) {
        setIsPinAuthenticated(false);
      }
    });

    return unsubscribe;
  }, []);

  // ==========================================================================
  // INACTIVITY TIMER
  // ==========================================================================

  const resetInactivityTimer = useCallback(() => {
    // Limpar timer anterior
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    // Apenas contar se está autenticado
    if (!isAuthenticated || isKiosk) return;

    // Novo timer
    inactivityTimerRef.current = setTimeout(() => {
      console.log('[Auth] Sessão admin expirada por inatividade');
      
      // Logout completo (Firebase + offline)
      authService.logout();
      
      setIsPinAuthenticated(false);
      setUser(null);

      // Log auditoria
      console.warn('[Auth] Admin session expired - INACTIVITY');
      systemLogService.warn('kiosk', 'Sessão admin expirada por inatividade', { sessionTimeoutMinutes: sessionTimeout });

      // Navegar para landing page
      window.location.hash = '/';
    }, sessionTimeout * 60 * 1000);
  }, [isAuthenticated, isKiosk, sessionTimeout]);

  /**
   * Detectar interação do usuário e resetar timer de inatividade
   */
  useEffect(() => {
    if (!isAuthenticated || isKiosk) {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      return;
    }

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
  }, [isAuthenticated, isKiosk, sessionTimeout, resetInactivityTimer]);

  // ==========================================================================
  // ACTIONS
  // ==========================================================================

  /**
   * Função de logout explícito
   */
  const logout = useCallback(async () => {
    console.log('[Auth] Logout manual');
    
    // Limpa timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    
    // Logout completo (Firebase + offline)
    await authService.logout();
    
    // Limpa estados
    setIsPinAuthenticated(false);
    setUser(null);
    setAuthError(null);
  }, []);

  // ==========================================================================
  // ACTIONS - Firebase + PIN
  // ==========================================================================

  /**
   * Login com email/senha (Firebase)
   */
  const loginWithEmail = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    setIsLoading(true);

    try {
      const result = await authService.loginWithEmail(email, password);
      
      if (result.success && result.user) {
        setUser(result.user);
        return { success: true };
      }
      
      const error = result.error || 'Erro de autenticação';
      setAuthError(error);
      return { success: false, error };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Erro desconhecido';
      systemLogService.warn('kiosk', `Login email falhou: ${error}`);
      setAuthError(error);
      return { success: false, error };
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Login com PIN (offline fallback)
   */
  const loginWithPin = useCallback(async (pin: string) => {
    setAuthError(null);

    try {
      const result = await authService.loginWithPin(pin);

      if (result.success) {
        setIsPinAuthenticated(true);
        if (result.user) {
          setUser(result.user);
        }
        return { success: true };
      }

      const error = result.error || 'PIN incorreto';
      setAuthError(error);
      return { success: false, error };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Erro ao validar PIN';
      systemLogService.warn('kiosk', `Login PIN falhou: ${error}`);
      setAuthError(error);
      return { success: false, error };
    }
  }, []);

  /**
   * Limpa erro de autenticação
   */
  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  // ==========================================================================
  // VALUE
  // ==========================================================================

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isOfflineMode,
    isLoading,
    sessionTimeout,
    authError,
    
    setSessionTimeout,
    logout,
    resetInactivityTimer,
    
    // Novas
    loginWithEmail,
    loginWithPin,
    clearAuthError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Alias para manter compatibilidade com componentes que importam AuthProvider
export const AuthProvider = AuthContextProvider;
