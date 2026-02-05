/**
 * ============================================================================
 * Serviço de Autenticação
 * ============================================================================
 * 
 * Gerencia autenticação Firebase Auth com fallback para PIN offline.
 * 
 * Funcionalidades:
 * - Login com email/senha
 * - Login com Google (futuro)
 * - Fallback para PIN quando offline
 * - Gerenciamento de sessão
 * - Refresh de tokens
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
  getIdTokenResult,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  browserLocalPersistence,
  setPersistence,
  Unsubscribe,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from './firebase';
import { AuthenticatedUser, User, UserRole } from '../types/franchise';
import { globalCollectionPath } from '../lib/pathResolver';

// ============================================================================
// CONSTANTES
// ============================================================================

/** Chave para PIN hash no localStorage */
const PIN_HASH_KEY = 'openKiosk_pinHash';

/** Chave para sessão offline */
const OFFLINE_SESSION_KEY = 'openKiosk_offlineSession';

/** Duração padrão da sessão offline (30 minutos) */
const DEFAULT_OFFLINE_SESSION_DURATION = 30 * 60 * 1000;

/** Número de iterações para PBKDF2 */
const PBKDF2_ITERATIONS = 100000;

/** Salt fixo para compatibilidade */
const PBKDF2_SALT = 'openKiosk_salt_v1';

// ============================================================================
// TIPOS INTERNOS
// ============================================================================

interface OfflineSession {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  storeAccess: string[];
  franchiseId?: string;
  storeId?: string;
  expiresAt: number;
  isPinAuth: true;
}

interface AuthResult {
  success: boolean;
  user?: AuthenticatedUser;
  error?: string;
  isOffline?: boolean;
}

// ============================================================================
// CLASSE DO SERVIÇO
// ============================================================================

class AuthService {
  private currentUser: AuthenticatedUser | null = null;
  private authStateListeners: Set<(user: AuthenticatedUser | null) => void> = new Set();
  private offlineCheckInterval: ReturnType<typeof setInterval> | null = null;
  private firebaseAuthUnsubscribe: Unsubscribe | null = null;
  private initialized = false;

  constructor() {
    // Não inicializa Firebase Auth aqui - será feito via initialize()
    // Isso permite que o AuthService seja instanciado antes do Firebase estar pronto
    
    // Inicia verificação de sessão offline (não depende do Firebase)
    this.startOfflineSessionCheck();
    
    // Tenta carregar sessão offline existente
    const offlineSession = this.getValidOfflineSession();
    if (offlineSession) {
      this.setCurrentUser(this.offlineSessionToUser(offlineSession));
    }
  }

  /**
   * Inicializa a integração com Firebase Auth
   * DEVE ser chamado após initializeFirebase()
   */
  initialize(): void {
    if (this.initialized) {
      console.log('[AuthService] Já inicializado');
      return;
    }

    try {
      const auth = getFirebaseAuth();
      
      // Configura persistência local do Firebase Auth
      setPersistence(auth, browserLocalPersistence).catch(console.error);
      
      // Escuta mudanças de estado do Firebase Auth
      this.firebaseAuthUnsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          try {
            const authUser = await this.buildAuthenticatedUser(firebaseUser);
            this.setCurrentUser(authUser);
          } catch (error) {
            console.error('[AuthService] Erro ao construir usuário:', error);
            this.setCurrentUser(null);
          }
        } else {
          // Verifica se há sessão offline válida
          const offlineSession = this.getValidOfflineSession();
          if (offlineSession) {
            this.setCurrentUser(this.offlineSessionToUser(offlineSession));
          } else {
            this.setCurrentUser(null);
          }
        }
      });

      this.initialized = true;
      console.log('[AuthService] Inicializado com Firebase Auth');
    } catch (error) {
      console.warn('[AuthService] Firebase não disponível, usando apenas modo offline:', error);
    }
  }

  /**
   * Verifica se o AuthService está inicializado com Firebase
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ==========================================================================
  // AUTENTICAÇÃO FIREBASE
  // ==========================================================================

  /**
   * Login com email e senha
   */
  async loginWithEmail(email: string, password: string): Promise<AuthResult> {
    try {
      const auth = getFirebaseAuth();
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const user = await this.buildAuthenticatedUser(credential.user);
      
      // Atualiza lastLoginAt no Firestore
      await this.updateLastLogin(user.id);
      
      return { success: true, user };
    } catch (error: unknown) {
      const firebaseError = error as { code?: string; message?: string };
      const errorCode = firebaseError.code || 'unknown';
      
      // Se estiver offline, tenta fallback para PIN
      if (errorCode === 'auth/network-request-failed') {
        return {
          success: false,
          error: 'Sem conexão. Use o PIN para acesso offline.',
          isOffline: true,
        };
      }

      // Se Firebase não estiver inicializado
      if (errorCode === 'unknown' && firebaseError.message?.includes('not initialized')) {
        return {
          success: false,
          error: 'Sistema não inicializado. Use o PIN para acesso.',
          isOffline: true,
        };
      }

      const errorMessages: Record<string, string> = {
        'auth/invalid-credential': 'Email ou senha incorretos',
        'auth/user-disabled': 'Conta desativada',
        'auth/user-not-found': 'Usuário não encontrado',
        'auth/wrong-password': 'Senha incorreta',
        'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
        'auth/invalid-email': 'Email inválido',
      };

      return {
        success: false,
        error: errorMessages[errorCode] || `Erro de autenticação: ${firebaseError.message}`,
      };
    }
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    // Limpa sessão offline
    this.clearOfflineSession();
    
    // Logout do Firebase
    try {
      const auth = getFirebaseAuth();
      await firebaseSignOut(auth);
    } catch (error) {
      console.warn('[AuthService] Erro no logout (Firebase pode não estar inicializado):', error);
    }

    this.setCurrentUser(null);
  }

  /**
   * Recuperação de senha
   */
  async sendPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const auth = getFirebaseAuth();
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (error: unknown) {
      const firebaseError = error as { message?: string };
      return {
        success: false,
        error: firebaseError.message || 'Erro ao enviar email de recuperação',
      };
    }
  }

  /**
   * Registrar novo usuário com email/senha
   */
  async registerWithEmail(
    email: string,
    password: string,
    displayName?: string
  ): Promise<AuthResult> {
    try {
      const auth = getFirebaseAuth();
      
      // Criar usuário no Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      // Atualizar display name se fornecido
      if (displayName) {
        await updateProfile(firebaseUser, { displayName });
      }

      // Criar documento do usuário no Firestore
      const db = getFirebaseDb();
      const userPath = globalCollectionPath('users');
      const userDocRef = doc(db, userPath, firebaseUser.uid);
      
      await setDoc(userDocRef, {
        email,
        displayName: displayName || email.split('@')[0],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isActive: true,
        storeAccess: [],
      });

      // Não faz login automático - o convite será aceito depois
      return {
        success: true,
        user: {
          id: firebaseUser.uid,
          uid: firebaseUser.uid,
          email: firebaseUser.email || email,
          displayName: displayName || firebaseUser.displayName || email.split('@')[0],
          isActive: true,
          createdAt: new Date(),
          lastLoginAt: new Date(),
          customClaims: {
            role: 'operator' as UserRole, // Role padrão, será atualizado pelo convite
            storeAccess: [],
          },
        },
      };
    } catch (error: unknown) {
      console.error('[AuthService] Erro ao registrar:', error);
      
      const firebaseError = error as { code?: string; message?: string };
      const errorCode = firebaseError.code || '';
      
      const errorMessages: Record<string, string> = {
        'auth/email-already-in-use': 'Este email já está em uso. Tente fazer login.',
        'auth/invalid-email': 'Email inválido',
        'auth/weak-password': 'A senha é muito fraca. Use pelo menos 6 caracteres.',
        'auth/operation-not-allowed': 'Operação não permitida',
      };

      return {
        success: false,
        error: errorMessages[errorCode] || `Erro ao criar conta: ${firebaseError.message}`,
      };
    }
  }

  /**
   * Alterar senha
   */
  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const auth = getFirebaseAuth();
      const firebaseUser = auth.currentUser;
      if (!firebaseUser || !firebaseUser.email) {
        return { success: false, error: 'Usuário não autenticado' };
      }

      // Reautentica primeiro
      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
      await reauthenticateWithCredential(firebaseUser, credential);

      // Atualiza a senha
      await updatePassword(firebaseUser, newPassword);
      return { success: true };
    } catch (error: unknown) {
      const firebaseError = error as { code?: string };
      if (firebaseError.code === 'auth/wrong-password') {
        return { success: false, error: 'Senha atual incorreta' };
      }
      return { success: false, error: 'Erro ao alterar senha' };
    }
  }

  // ==========================================================================
  // AUTENTICAÇÃO PIN (FALLBACK OFFLINE)
  // ==========================================================================

  /**
   * Login com PIN (fallback offline)
   * 
   * O PIN é verificado contra:
   * 1. Hash armazenado no localStorage (configurado previamente)
   * 2. ROOT_PIN do ambiente (para acesso de emergência)
   */
  async loginWithPin(pin: string): Promise<AuthResult> {
    try {
      // Verifica ROOT_PIN primeiro (emergência)
      const rootPin = import.meta.env.VITE_ROOT_PIN;
      if (rootPin && pin === rootPin) {
        const session = this.createRootPinSession();
        this.saveOfflineSession(session);
        this.setCurrentUser(this.offlineSessionToUser(session));
        return { success: true, user: this.currentUser!, isOffline: true };
      }

      // Verifica PIN hash armazenado
      const storedHash = localStorage.getItem(PIN_HASH_KEY);
      if (!storedHash) {
        return {
          success: false,
          error: 'PIN não configurado. Configure um PIN nas configurações.',
        };
      }

      const inputHash = await this.hashPin(pin);
      if (inputHash !== storedHash) {
        return { success: false, error: 'PIN incorreto' };
      }

      // Carrega sessão salva ou cria uma nova
      const savedSession = this.getValidOfflineSession();
      if (savedSession) {
        // Renova a sessão
        savedSession.expiresAt = Date.now() + DEFAULT_OFFLINE_SESSION_DURATION;
        this.saveOfflineSession(savedSession);
        this.setCurrentUser(this.offlineSessionToUser(savedSession));
        return { success: true, user: this.currentUser!, isOffline: true };
      }

      // Cria sessão offline básica
      const session = this.createBasicOfflineSession();
      this.saveOfflineSession(session);
      this.setCurrentUser(this.offlineSessionToUser(session));
      return { success: true, user: this.currentUser!, isOffline: true };
    } catch (error) {
      console.error('[AuthService] Erro no login com PIN:', error);
      return { success: false, error: 'Erro ao verificar PIN' };
    }
  }

  /**
   * Configura um novo PIN
   */
  async setPin(pin: string): Promise<{ success: boolean; error?: string }> {
    if (pin.length < 4) {
      return { success: false, error: 'PIN deve ter pelo menos 4 dígitos' };
    }

    try {
      const hash = await this.hashPin(pin);
      localStorage.setItem(PIN_HASH_KEY, hash);
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Erro ao configurar PIN' };
    }
  }

  /**
   * Verifica se PIN está configurado
   */
  isPinConfigured(): boolean {
    return localStorage.getItem(PIN_HASH_KEY) !== null;
  }

  /**
   * Remove PIN configurado
   */
  clearPin(): void {
    localStorage.removeItem(PIN_HASH_KEY);
  }

  // ==========================================================================
  // GETTERS E SUBSCRIPTIONS
  // ==========================================================================

  /**
   * Retorna o usuário atual
   */
  getCurrentUser(): AuthenticatedUser | null {
    return this.currentUser;
  }

  /**
   * Verifica se está autenticado
   */
  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  /**
   * Verifica se está em modo offline
   */
  isOfflineMode(): boolean {
    return this.currentUser !== null && (this.currentUser as unknown as { isPinAuth?: boolean }).isPinAuth === true;
  }

  /**
   * Subscribe para mudanças de estado de auth
   */
  onAuthStateChange(callback: (user: AuthenticatedUser | null) => void): () => void {
    this.authStateListeners.add(callback);
    
    // Chama imediatamente com estado atual
    callback(this.currentUser);

    // Retorna função de cleanup
    return () => {
      this.authStateListeners.delete(callback);
    };
  }

  /**
   * Obtém token de acesso atual
   */
  async getAccessToken(): Promise<string | null> {
    try {
      const auth = getFirebaseAuth();
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return null;

      return await firebaseUser.getIdToken(true);
    } catch (error) {
      console.error('[AuthService] Erro ao obter token:', error);
      return null;
    }
  }

  // ==========================================================================
  // HELPERS PRIVADOS
  // ==========================================================================

  private setCurrentUser(user: AuthenticatedUser | null): void {
    this.currentUser = user;
    this.authStateListeners.forEach((listener) => listener(user));
  }

  private async buildAuthenticatedUser(firebaseUser: FirebaseUser): Promise<AuthenticatedUser> {
    // Obtém claims customizadas
    const tokenResult = await getIdTokenResult(firebaseUser);
    const customClaims = tokenResult.claims as {
      franchiseId?: string;
      role?: UserRole;
      storeAccess?: string[];
    };

    // Busca dados do usuário no Firestore
    const userPath = globalCollectionPath('users');
    
    const db = getFirebaseDb();
    const userDoc = await getDoc(doc(db, userPath, firebaseUser.uid));
    const userData = userDoc.exists() ? (userDoc.data() as Partial<User>) : {};

    const authUser: AuthenticatedUser = {
      id: firebaseUser.uid,
      uid: firebaseUser.uid,
      email: firebaseUser.email || '',
      displayName: firebaseUser.displayName || userData.displayName || 'Usuário',
      photoURL: firebaseUser.photoURL || userData.photoURL,
      phone: userData.phone,
      defaultFranchiseId: userData.defaultFranchiseId || customClaims.franchiseId,
      defaultStoreId: userData.defaultStoreId,
      isActive: userData.isActive !== false,
      createdAt: userData.createdAt || new Date(),
      lastLoginAt: new Date(),
      accessToken: tokenResult.token,
      customClaims: {
        franchiseId: customClaims.franchiseId,
        role: customClaims.role,
        storeAccess: customClaims.storeAccess,
      },
    };

    // Salva dados para sessão offline futura
    this.cacheUserForOffline(authUser);

    return authUser;
  }

  private async updateLastLogin(userId: string): Promise<void> {
    try {
      const userPath = globalCollectionPath('users');
      
      const db = getFirebaseDb();
      await updateDoc(doc(db, userPath, userId), {
        lastLoginAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('[AuthService] Erro ao atualizar lastLogin:', error);
    }
  }

  private async hashPin(pin: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + PBKDF2_SALT);
    
    // Importa a chave
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      data,
      'PBKDF2',
      false,
      ['deriveBits']
    );

    // Deriva os bits
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: encoder.encode(PBKDF2_SALT),
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );

    // Converte para hex
    const hashArray = Array.from(new Uint8Array(derivedBits));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  private createRootPinSession(): OfflineSession {
    return {
      userId: 'root',
      email: 'root@localhost',
      displayName: 'Administrador',
      role: 'owner',
      storeAccess: ['*'],
      expiresAt: Date.now() + DEFAULT_OFFLINE_SESSION_DURATION,
      isPinAuth: true,
    };
  }

  private createBasicOfflineSession(): OfflineSession {
    return {
      userId: 'offline_user',
      email: 'offline@localhost',
      displayName: 'Modo Offline',
      role: 'operator',
      storeAccess: ['*'],
      expiresAt: Date.now() + DEFAULT_OFFLINE_SESSION_DURATION,
      isPinAuth: true,
    };
  }

  private cacheUserForOffline(user: AuthenticatedUser): void {
    const session: OfflineSession = {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      role: (user.customClaims?.role as UserRole) || 'operator',
      storeAccess: user.customClaims?.storeAccess || ['*'],
      franchiseId: user.customClaims?.franchiseId,
      storeId: user.defaultStoreId,
      expiresAt: Date.now() + DEFAULT_OFFLINE_SESSION_DURATION,
      isPinAuth: true,
    };
    
    // Salva para uso offline futuro
    localStorage.setItem(OFFLINE_SESSION_KEY + '_cached', JSON.stringify(session));
  }

  private saveOfflineSession(session: OfflineSession): void {
    localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(session));
  }

  private getValidOfflineSession(): OfflineSession | null {
    const sessionJson = localStorage.getItem(OFFLINE_SESSION_KEY);
    if (!sessionJson) return null;

    try {
      const session: OfflineSession = JSON.parse(sessionJson);
      if (session.expiresAt > Date.now()) {
        return session;
      }
      // Sessão expirada
      this.clearOfflineSession();
      return null;
    } catch {
      return null;
    }
  }

  private clearOfflineSession(): void {
    localStorage.removeItem(OFFLINE_SESSION_KEY);
  }

  private offlineSessionToUser(session: OfflineSession): AuthenticatedUser {
    return {
      id: session.userId,
      uid: session.userId,
      email: session.email,
      displayName: session.displayName,
      isActive: true,
      createdAt: new Date(),
      lastLoginAt: new Date(),
      defaultFranchiseId: session.franchiseId,
      defaultStoreId: session.storeId,
      customClaims: {
        role: session.role,
        storeAccess: session.storeAccess,
        franchiseId: session.franchiseId,
      },
    };
  }

  private startOfflineSessionCheck(): void {
    // Verifica a cada minuto se a sessão offline expirou
    this.offlineCheckInterval = setInterval(() => {
      if (this.currentUser && this.isOfflineMode()) {
        const session = this.getValidOfflineSession();
        if (!session) {
          console.log('[AuthService] Sessão offline expirada');
          this.setCurrentUser(null);
        }
      }
    }, 60000);
  }

  /**
   * Cleanup ao destruir o serviço
   */
  destroy(): void {
    if (this.offlineCheckInterval) {
      clearInterval(this.offlineCheckInterval);
    }
    if (this.firebaseAuthUnsubscribe) {
      this.firebaseAuthUnsubscribe();
    }
    this.authStateListeners.clear();
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const authService = new AuthService();

// Exports de tipos para conveniência
export type { AuthResult, OfflineSession };
