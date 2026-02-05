/**
 * ============================================================================
 * Serviço de Usuários
 * ============================================================================
 * 
 * Gerencia operações de usuários no Firestore.
 * 
 * Funcionalidades:
 * - CRUD de usuários
 * - Perfil do usuário
 * - Preferências
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { User } from '../types/franchise';
import { globalCollectionPath } from '../lib/pathResolver';
import { sanitizeFirestoreData } from '../utils/firestoreSanitize';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Converte Timestamps do Firestore para Date
 */
function convertTimestamps<T extends Record<string, unknown>>(data: T): T {
  const result = { ...data };
  for (const key of Object.keys(result)) {
    const value = result[key];
    if (value instanceof Timestamp) {
      (result as Record<string, unknown>)[key] = value.toDate();
    }
  }
  return result;
}

/**
 * Retorna o path da collection de usuários
 */
function usersPath(): string {
  return globalCollectionPath('users');
}

// ============================================================================
// CLASSE DO SERVIÇO
// ============================================================================

class UserService {
  // ==========================================================================
  // CRUD
  // ==========================================================================

  /**
   * Busca um usuário por ID
   */
  async getUser(userId: string): Promise<User | null> {
    try {
      const db = getFirebaseDb();
      const docRef = doc(db, usersPath(), userId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return null;
      }

      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...convertTimestamps(data),
      } as User;
    } catch (error) {
      console.error('[UserService] Erro ao buscar usuário:', error);
      throw error;
    }
  }

  /**
   * Busca um usuário por email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const db = getFirebaseDb();
      const q = query(
        collection(db, usersPath()),
        where('email', '==', email.toLowerCase())
      );
      const querySnap = await getDocs(q);

      if (querySnap.empty) {
        return null;
      }

      const docSnap = querySnap.docs[0];
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...convertTimestamps(data),
      } as User;
    } catch (error) {
      console.error('[UserService] Erro ao buscar usuário por email:', error);
      throw error;
    }
  }

  /**
   * Cria um novo usuário
   */
  async createUser(
    userId: string,
    userData: Omit<User, 'id' | 'createdAt' | 'lastLoginAt'>
  ): Promise<User> {
    try {
      const db = getFirebaseDb();
      const docRef = doc(db, usersPath(), userId);
      
      const data = {
        ...userData,
        email: userData.email.toLowerCase(),
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      };

        const sanitizedData = sanitizeFirestoreData(data) as typeof data;
        await setDoc(docRef, sanitizedData);

      return {
        id: userId,
        ...userData,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      };
    } catch (error) {
      console.error('[UserService] Erro ao criar usuário:', error);
      throw error;
    }
  }

  /**
   * Atualiza um usuário existente
   */
  async updateUser(
    userId: string,
    updates: Partial<Omit<User, 'id' | 'createdAt'>>
  ): Promise<void> {
    try {
      const db = getFirebaseDb();
      const docRef = doc(db, usersPath(), userId);
        const sanitizedUpdates = sanitizeFirestoreData(updates) as typeof updates;
        await updateDoc(docRef, {
          ...sanitizedUpdates,
          updatedAt: serverTimestamp(),
        });
    } catch (error) {
      console.error('[UserService] Erro ao atualizar usuário:', error);
      throw error;
    }
  }

  /**
   * Desativa um usuário (soft delete)
   */
  async deactivateUser(userId: string): Promise<void> {
    try {
      await this.updateUser(userId, { isActive: false });
    } catch (error) {
      console.error('[UserService] Erro ao desativar usuário:', error);
      throw error;
    }
  }

  /**
   * Reativa um usuário
   */
  async reactivateUser(userId: string): Promise<void> {
    try {
      await this.updateUser(userId, { isActive: true });
    } catch (error) {
      console.error('[UserService] Erro ao reativar usuário:', error);
      throw error;
    }
  }

  /**
   * Remove um usuário permanentemente
   */
  async deleteUser(userId: string): Promise<void> {
    try {
      const db = getFirebaseDb();
      const docRef = doc(db, usersPath(), userId);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('[UserService] Erro ao remover usuário:', error);
      throw error;
    }
  }

  // ==========================================================================
  // PERFIL
  // ==========================================================================

  /**
   * Atualiza o perfil do usuário
   */
  async updateProfile(
    userId: string,
    profile: {
      displayName?: string;
      photoURL?: string;
      phone?: string;
    }
  ): Promise<void> {
    return this.updateUser(userId, profile);
  }

  /**
   * Atualiza a franquia/loja padrão do usuário
   */
  async updateDefaults(
    userId: string,
    defaults: {
      defaultFranchiseId?: string;
      defaultStoreId?: string;
    }
  ): Promise<void> {
    return this.updateUser(userId, defaults);
  }

  /**
   * Atualiza o último login
   */
  async updateLastLogin(userId: string): Promise<void> {
    try {
      const db = getFirebaseDb();
      const docRef = doc(db, usersPath(), userId);
      await updateDoc(docRef, {
        lastLoginAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('[UserService] Erro ao atualizar último login:', error);
      // Não propaga o erro para não bloquear o login
    }
  }

  // ==========================================================================
  // VERIFICAÇÕES
  // ==========================================================================

  /**
   * Verifica se um email já está em uso
   */
  async isEmailInUse(email: string): Promise<boolean> {
    const user = await this.getUserByEmail(email);
    return user !== null;
  }

  /**
   * Verifica se um usuário existe
   */
  async userExists(userId: string): Promise<boolean> {
    try {
      const db = getFirebaseDb();
      const docRef = doc(db, usersPath(), userId);
      const docSnap = await getDoc(docRef);
      return docSnap.exists();
    } catch (error) {
      console.error('[UserService] Erro ao verificar existência:', error);
      return false;
    }
  }

  /**
   * Verifica se um usuário está ativo
   */
  async isUserActive(userId: string): Promise<boolean> {
    const user = await this.getUser(userId);
    return user?.isActive ?? false;
  }

  // ==========================================================================
  // CRIAÇÃO AUTOMÁTICA
  // ==========================================================================

  /**
   * Garante que o documento do usuário existe no Firestore
   * (cria se não existir, atualiza lastLogin se existir)
   */
  async ensureUserDocument(
    userId: string,
    userData: {
      email: string;
      displayName: string;
      photoURL?: string;
    }
  ): Promise<User> {
    const existingUser = await this.getUser(userId);

    if (existingUser) {
      await this.updateLastLogin(userId);
      return existingUser;
    }

    return this.createUser(userId, {
      ...userData,
      isActive: true,
    });
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const userService = new UserService();
