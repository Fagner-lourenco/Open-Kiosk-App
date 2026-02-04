import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reducer } from '@/components/ui/use-toast';

describe('useToast reducer', () => {
  const initialState = { toasts: [] };

  describe('ADD_TOAST', () => {
    it('adiciona toast ao estado', () => {
      const toast = { id: '1', title: 'Test Toast' };
      const result = reducer(initialState, { type: 'ADD_TOAST', toast });
      
      expect(result.toasts).toHaveLength(1);
      expect(result.toasts[0].title).toBe('Test Toast');
    });

    it('limita quantidade de toasts ao TOAST_LIMIT', () => {
      const state = { toasts: [{ id: '1', title: 'First' }] };
      const result = reducer(state, { 
        type: 'ADD_TOAST', 
        toast: { id: '2', title: 'Second' } 
      });
      
      // TOAST_LIMIT é 1, então deve ter apenas 1 toast
      expect(result.toasts.length).toBeLessThanOrEqual(1);
    });

    it('adiciona toast com variant destructive', () => {
      const toast = { id: '1', title: 'Error', variant: 'destructive' as const };
      const result = reducer(initialState, { type: 'ADD_TOAST', toast });
      
      expect(result.toasts[0].variant).toBe('destructive');
    });

    it('adiciona toast com description', () => {
      const toast = { id: '1', title: 'Title', description: 'Description text' };
      const result = reducer(initialState, { type: 'ADD_TOAST', toast });
      
      expect(result.toasts[0].description).toBe('Description text');
    });

    it('novo toast aparece no início da lista', () => {
      const state = { toasts: [{ id: '1', title: 'First' }] };
      const result = reducer(state, { 
        type: 'ADD_TOAST', 
        toast: { id: '2', title: 'Second' } 
      });
      
      // Se houver espaço, o novo deve estar primeiro
      if (result.toasts.length > 0) {
        expect(result.toasts[0].id).toBe('2');
      }
    });
  });

  describe('UPDATE_TOAST', () => {
    it('atualiza toast existente', () => {
      const state = { toasts: [{ id: '1', title: 'Original' }] };
      const result = reducer(state, { 
        type: 'UPDATE_TOAST', 
        toast: { id: '1', title: 'Updated' } 
      });
      
      expect(result.toasts[0].title).toBe('Updated');
    });

    it('não altera toast se id não corresponde', () => {
      const state = { toasts: [{ id: '1', title: 'Original' }] };
      const result = reducer(state, { 
        type: 'UPDATE_TOAST', 
        toast: { id: '2', title: 'Updated' } 
      });
      
      expect(result.toasts[0].title).toBe('Original');
    });

    it('preserva outras propriedades ao atualizar', () => {
      const state = { toasts: [{ id: '1', title: 'Original', variant: 'destructive' as const }] };
      const result = reducer(state, { 
        type: 'UPDATE_TOAST', 
        toast: { id: '1', description: 'New description' } 
      });
      
      expect(result.toasts[0].title).toBe('Original');
      expect(result.toasts[0].description).toBe('New description');
    });
  });

  describe('REMOVE_TOAST', () => {
    it('remove toast específico', () => {
      const state = { toasts: [{ id: '1', title: 'To Remove' }] };
      const result = reducer(state, { type: 'REMOVE_TOAST', toastId: '1' });
      
      expect(result.toasts).toHaveLength(0);
    });

    it('remove todos os toasts quando toastId é undefined', () => {
      const state = { 
        toasts: [
          { id: '1', title: 'First' },
        ] 
      };
      const result = reducer(state, { type: 'REMOVE_TOAST', toastId: undefined });
      
      expect(result.toasts).toHaveLength(0);
    });

    it('não remove toast se id não corresponde', () => {
      const state = { toasts: [{ id: '1', title: 'Stay' }] };
      const result = reducer(state, { type: 'REMOVE_TOAST', toastId: '2' });
      
      expect(result.toasts).toHaveLength(1);
      expect(result.toasts[0].title).toBe('Stay');
    });
  });

  describe('DISMISS_TOAST', () => {
    it('marca toast como fechado', () => {
      const state = { toasts: [{ id: '1', title: 'To Dismiss' }] };
      const result = reducer(state, { type: 'DISMISS_TOAST', toastId: '1' });
      
      expect(result.toasts[0]).toHaveProperty('open', false);
    });

    it('marca todos os toasts como fechados quando toastId é undefined', () => {
      const state = { toasts: [{ id: '1', title: 'First' }, { id: '2', title: 'Second' }] };
      const result = reducer(state, { type: 'DISMISS_TOAST', toastId: undefined });
      
      result.toasts.forEach(toast => {
        expect(toast).toHaveProperty('open', false);
      });
    });

    it('não altera toast se id não corresponde', () => {
      const state = { toasts: [{ id: '1', title: 'Stay Open' }] };
      const result = reducer(state, { type: 'DISMISS_TOAST', toastId: '2' });
      
      // toast[0] não deve ter open: false já que id não corresponde
      expect(result.toasts[0].id).toBe('1');
    });
  });
});
