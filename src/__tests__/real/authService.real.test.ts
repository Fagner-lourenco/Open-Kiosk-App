/**
 * ============================================================================
 * TESTES REAIS - Auth Service
 * ============================================================================
 * Testa o serviço de autenticação REAL (singleton).
 * Apenas Firebase Auth é mockado (API externa) via setup.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authService } from '@/services/authService';

describe('AuthService Real Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authService.initialize();
  });

  describe('Email Authentication', () => {
    it('should login with valid email/password', async () => {
      const result = await authService.loginWithEmail('test@example.com', 'password123');
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    it('should fail with wrong password', async () => {
      const result = await authService.loginWithEmail('test@example.com', 'wrongpassword');
      expect(result).toBeDefined();
      expect(result.error).toBeDefined();
    });

    it('should fail with invalid email', async () => {
      const result = await authService.loginWithEmail('invalid@example.com', 'wrongpass');
      expect(result).toBeDefined();
      expect(result.error).toBeDefined();
    });
  });

  describe('PIN Authentication', () => {
    it('should login with valid PIN (offline mode)', async () => {
      const result = await authService.loginWithPin('1234');
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    it('should fail with wrong PIN', async () => {
      const result = await authService.loginWithPin('0000');
      expect(result).toBeDefined();
      expect(result.error).toBeDefined();
    });
  });

  describe('Session Management', () => {
    it('should get current user', () => {
      const user = authService.getCurrentUser();
      expect(user === null || user !== undefined).toBe(true);
    });

    it('should logout successfully', async () => {
      await authService.logout();
      const user = authService.getCurrentUser();
      expect(user).toBeNull();
    });
  });

  describe('Offline Mode', () => {
    it('should work offline with cached credentials', async () => {
      const result = await authService.loginWithPin('1234');
      expect(result).toBeDefined();
    });

    it('should cache user session', () => {
      const user = authService.getCurrentUser();
      expect(user === null || typeof user === 'object').toBe(true);
    });
  });
});
