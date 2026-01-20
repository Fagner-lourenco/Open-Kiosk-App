/**
 * ============================================================================
 * Hook useDispensers
 * ============================================================================
 * 
 * Hook para gerenciamento de dispensers/torneiras com:
 * - Carregamento automático
 * - Subscription em tempo real
 * - CRUD operations
 * - Integração com StoreContext
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { StoreDispenser, DispenserHardwareConfig, DispenserCalibration } from '../types/franchise';
import { dispenserService } from '../services/dispenserService';
import { useStoreContext } from '../context/StoreContext';
import { useFranchiseSafe } from '../context/FranchiseContext';
import { isFranchiseMode } from '../lib/pathResolver';

// ============================================================================
// TIPOS
// ============================================================================

interface UseDispensersReturn {
  /** Lista de dispensers */
  dispensers: StoreDispenser[];
  
  /** Dispensers ativos apenas */
  activeDispensers: StoreDispenser[];
  
  /** Carregando */
  loading: boolean;
  
  /** Erro */
  error: string | null;
  
  /** Recarrega lista */
  refresh: () => Promise<void>;
  
  /** Cria novo dispenser */
  createDispenser: (
    data: Omit<StoreDispenser, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<StoreDispenser>;
  
  /** Atualiza dispenser */
  updateDispenser: (
    dispenserId: string,
    updates: Partial<Omit<StoreDispenser, 'id' | 'createdAt'>>
  ) => Promise<void>;
  
  /** Remove dispenser */
  deleteDispenser: (dispenserId: string) => Promise<void>;
  
  /** Ativa/desativa dispenser */
  toggleDispenser: (dispenserId: string, isActive: boolean) => Promise<void>;
  
  /** Atualiza configuração de hardware */
  updateHardware: (dispenserId: string, hardware: DispenserHardwareConfig) => Promise<void>;
  
  /** Atualiza calibração */
  updateCalibration: (dispenserId: string, calibration: DispenserCalibration) => Promise<void>;
  
  /** Busca dispenser por ID */
  getDispenser: (dispenserId: string) => StoreDispenser | undefined;
  
  /** Retorna dispenser padrão para criação */
  getDefaultDispenser: () => Omit<StoreDispenser, 'id' | 'createdAt' | 'updatedAt'>;
}

// ============================================================================
// HOOK
// ============================================================================

export function useDispensers(): UseDispensersReturn {
  const { currentStoreId } = useStoreContext();
  const [dispensers, setDispensers] = useState<StoreDispenser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Obtém franchiseId de forma segura (retorna null se fora do provider)
  const franchiseContext = useFranchiseSafe();
  const franchiseId = isFranchiseMode() ? franchiseContext?.currentFranchise?.id : undefined;

  // ==========================================================================
  // LOAD & SUBSCRIBE
  // ==========================================================================

  useEffect(() => {
    if (!currentStoreId) {
      setDispensers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Subscribe para atualizações em tempo real
    const unsubscribe = dispenserService.subscribeToDispensers(
      currentStoreId,
      (updatedDispensers) => {
        setDispensers(updatedDispensers);
        setLoading(false);
      },
      franchiseId
    );

    return () => {
      unsubscribe();
    };
  }, [currentStoreId, franchiseId]);

  // ==========================================================================
  // COMPUTED
  // ==========================================================================

  const activeDispensers = useMemo(() => {
    return dispensers.filter((d) => d.isActive);
  }, [dispensers]);

  // ==========================================================================
  // ACTIONS
  // ==========================================================================

  const refresh = useCallback(async () => {
    if (!currentStoreId) return;

    setLoading(true);
    setError(null);

    try {
      const list = await dispenserService.listDispensers(currentStoreId, franchiseId);
      setDispensers(list);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar dispensers';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [currentStoreId, franchiseId]);

  const createDispenser = useCallback(
    async (data: Omit<StoreDispenser, 'id' | 'createdAt' | 'updatedAt'>) => {
      if (!currentStoreId) throw new Error('Nenhuma loja selecionada');

      try {
        const newDispenser = await dispenserService.createDispenser(
          currentStoreId,
          data,
          franchiseId
        );
        return newDispenser;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao criar dispenser';
        setError(message);
        throw err;
      }
    },
    [currentStoreId, franchiseId]
  );

  const updateDispenser = useCallback(
    async (
      dispenserId: string,
      updates: Partial<Omit<StoreDispenser, 'id' | 'createdAt'>>
    ) => {
      if (!currentStoreId) throw new Error('Nenhuma loja selecionada');

      try {
        await dispenserService.updateDispenser(
          currentStoreId,
          dispenserId,
          updates,
          franchiseId
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao atualizar dispenser';
        setError(message);
        throw err;
      }
    },
    [currentStoreId, franchiseId]
  );

  const deleteDispenser = useCallback(
    async (dispenserId: string) => {
      if (!currentStoreId) throw new Error('Nenhuma loja selecionada');

      try {
        await dispenserService.deleteDispenser(currentStoreId, dispenserId, franchiseId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao remover dispenser';
        setError(message);
        throw err;
      }
    },
    [currentStoreId, franchiseId]
  );

  const toggleDispenser = useCallback(
    async (dispenserId: string, isActive: boolean) => {
      if (!currentStoreId) throw new Error('Nenhuma loja selecionada');

      try {
        await dispenserService.toggleDispenser(
          currentStoreId,
          dispenserId,
          isActive,
          franchiseId
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao alterar status';
        setError(message);
        throw err;
      }
    },
    [currentStoreId, franchiseId]
  );

  const updateHardware = useCallback(
    async (dispenserId: string, hardware: DispenserHardwareConfig) => {
      if (!currentStoreId) throw new Error('Nenhuma loja selecionada');

      try {
        await dispenserService.updateHardwareConfig(
          currentStoreId,
          dispenserId,
          hardware,
          franchiseId
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao atualizar hardware';
        setError(message);
        throw err;
      }
    },
    [currentStoreId, franchiseId]
  );

  const updateCalibration = useCallback(
    async (dispenserId: string, calibration: DispenserCalibration) => {
      if (!currentStoreId) throw new Error('Nenhuma loja selecionada');

      try {
        await dispenserService.updateCalibration(
          currentStoreId,
          dispenserId,
          calibration,
          franchiseId
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao atualizar calibração';
        setError(message);
        throw err;
      }
    },
    [currentStoreId, franchiseId]
  );

  const getDispenser = useCallback(
    (dispenserId: string) => {
      return dispensers.find((d) => d.id === dispenserId);
    },
    [dispensers]
  );

  const getDefaultDispenser = useCallback(() => {
    return dispenserService.getDefaultDispenser();
  }, []);

  // ==========================================================================
  // RETURN
  // ==========================================================================

  return {
    dispensers,
    activeDispensers,
    loading,
    error,
    refresh,
    createDispenser,
    updateDispenser,
    deleteDispenser,
    toggleDispenser,
    updateHardware,
    updateCalibration,
    getDispenser,
    getDefaultDispenser,
  };
}

// ============================================================================
// HOOKS AUXILIARES
// ============================================================================

/**
 * Hook para um dispenser específico
 */
export function useDispenser(dispenserId: string | undefined) {
  const { dispensers, loading, error } = useDispensers();

  const dispenser = useMemo(() => {
    if (!dispenserId) return null;
    return dispensers.find((d) => d.id === dispenserId) || null;
  }, [dispensers, dispenserId]);

  return { dispenser, loading, error };
}

/**
 * Hook para buscar dispenser por device ID (MAC)
 */
export function useDispenserByDevice(deviceId: string | undefined) {
  const { dispensers, loading, error } = useDispensers();

  const dispenser = useMemo(() => {
    if (!deviceId) return null;
    return dispensers.find((d) => d.hardware.deviceId === deviceId) || null;
  }, [dispensers, deviceId]);

  return { dispenser, loading, error };
}
