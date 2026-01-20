/**
 * ============================================================================
 * AuthContext - Contexto de Autenticação
 * ============================================================================
 * 
 * Gerencia autenticação via Firebase Auth.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

// Tipo de role do usuário (espelhado de shared/types/roles.ts)
type UserRole = 'superadmin' | 'owner' | 'admin' | 'manager' | 'operator' | 'technician' | 'viewer';

// ============================================================================
// TIPOS
// ============================================================================

interface UserClaims {
  role: UserRole | null;
  franchiseId: string | null;
  storeId: string | null;
}

interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  claims: UserClaims;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isSuperAdmin: boolean;
  claims: UserClaims | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, displayName: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  refreshClaims: () => Promise<void>;
}

// ============================================================================
// CONTEXTO
// ============================================================================

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ============================================================================
// PROVIDER
// ============================================================================

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Função para obter claims do token
  const getClaims = useCallback(async (): Promise<UserClaims> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { role: null, franchiseId: null, storeId: null };
    }
    
    try {
      const idTokenResult = await currentUser.getIdTokenResult(true);
      return {
        role: (idTokenResult.claims.role as UserRole) || null,
        franchiseId: (idTokenResult.claims.franchiseId as string) || null,
        storeId: (idTokenResult.claims.storeId as string) || null,
      };
    } catch (error) {
      console.error('Erro ao obter claims:', error);
      return { role: null, franchiseId: null, storeId: null };
    }
  }, []);

  // Listener de autenticação
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Obter claims do token
        const claims = await getClaims();
        
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          emailVerified: firebaseUser.emailVerified,
          claims,
        });

        // Atualiza lastLoginAt
        try {
          const userRef = doc(db, 'users', firebaseUser.uid);
          await setDoc(userRef, {
            lastLoginAt: serverTimestamp(),
          }, { merge: true });
        } catch (error) {
          console.error('Erro ao atualizar lastLoginAt:', error);
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [getClaims]);

  // Força atualização das claims
  const refreshClaims = useCallback(async () => {
    if (!auth.currentUser) return;
    
    const claims = await getClaims();
    setUser(prev => prev ? { ...prev, claims } : null);
  }, [getClaims]);

  // Login
  const login = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { success: true };
    } catch (error: any) {
      const errorMessages: Record<string, string> = {
        'auth/invalid-email': 'Email inválido',
        'auth/user-disabled': 'Usuário desabilitado',
        'auth/user-not-found': 'Usuário não encontrado',
        'auth/wrong-password': 'Senha incorreta',
        'auth/invalid-credential': 'Credenciais inválidas',
        'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
      };
      return {
        success: false,
        error: errorMessages[error.code] || 'Erro ao fazer login',
      };
    }
  }, []);

  // Registro
  const register = useCallback(async (email: string, password: string, displayName: string) => {
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Atualiza display name
      await updateProfile(credential.user, { displayName });

      // Cria documento do usuário
      const userRef = doc(db, 'users', credential.user.uid);
      await setDoc(userRef, {
        email,
        displayName,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        isActive: true,
      });

      return { success: true };
    } catch (error: any) {
      const errorMessages: Record<string, string> = {
        'auth/email-already-in-use': 'Este email já está em uso',
        'auth/invalid-email': 'Email inválido',
        'auth/weak-password': 'Senha muito fraca (mínimo 6 caracteres)',
      };
      return {
        success: false,
        error: errorMessages[error.code] || 'Erro ao criar conta',
      };
    }
  }, []);

  // Logout
  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  // Reset password
  const resetPassword = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (error: any) {
      const errorMessages: Record<string, string> = {
        'auth/invalid-email': 'Email inválido',
        'auth/user-not-found': 'Usuário não encontrado',
      };
      return {
        success: false,
        error: errorMessages[error.code] || 'Erro ao enviar email',
      };
    }
  }, []);

  // Computed: verifica se é super admin
  const isSuperAdmin = user?.claims?.role === 'superadmin';

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isSuperAdmin,
        claims: user?.claims || null,
        login,
        register,
        logout,
        resetPassword,
        refreshClaims,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}
