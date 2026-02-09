/**
 * useTapConfiguration - Escuta a configuração de torneiras (taps) do Firestore
 *
 * Caminho canônico: franchises/{franchiseId}/stores/{storeId}
 * Campos: taps, tapsVersion, tapsUpdatedAt, tapsUpdatedBy
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { TapConfig } from '@/types/store';
import { getFirebaseDb, isFirebaseInitialized } from '@/services/firebase';

const CACHE_KEY = 'open-kiosk:tapsConfig';

/**
 * Converts legacy DispenserConfig[] to canonical TapConfig[] format.
 * Provides backward compatibility for stores that haven't migrated yet.
 * Maps mlPerPulse → calibration.pulsesPerLiter using inverse formula (1000 / mlPerPulse).
 * Does NOT derive mlPerSecond from flowTimeout (different concepts).
 * No magic defaults — esp32CommunicationService handles fallbacks.
 */
function convertDispensersToTaps(dispensers: any[]): TapConfig[] {
  return dispensers.map(d => ({
    id: d.id,
    name: d.name,
    enabled: d.enabled,
    valvePin: d.valvePin,
    sensorPin: d.sensorPin,
    calibration: d.calibration ? {
      pulsesPerLiter: d.calibration.mlPerPulse > 0
        ? Math.round(1000 / d.calibration.mlPerPulse)
        : undefined,
      // flowTimeout ≠ mlPerSecond; don't convert
    } : undefined,
    productId: d.productId,
    productName: d.productName,
  }));
}

interface UseTapConfigurationParams {
  currentStoreId: string | null;
  currentFranchiseId: string | null;
}

interface UseTapConfigurationResult {
  taps: TapConfig[];
  version: number;
  loading: boolean;
  source: 'none' | 'cache' | 'firestore';
  reportApplied: (version: number, result: { status: 'success' | 'error'; errorMsg?: string }) => Promise<void>;
}

export function useTapConfiguration({
  currentStoreId,
  currentFranchiseId,
}: UseTapConfigurationParams): UseTapConfigurationResult {
  const [taps, setTaps] = useState<TapConfig[]>([]);
  const [version, setVersion] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'none' | 'cache' | 'firestore'>('none');
  const unsubRef = useRef<(() => void) | null>(null);

  // Carregar cache local como fallback imediato
  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed.taps)) {
          setTaps(parsed.taps);
          setVersion(parsed.version ?? 0);
          setSource('cache');
        }
      }
    } catch {
      // cache inválido, ignorar
    }
  }, []);

  // Escutar Firestore
  useEffect(() => {
    // Limpar listener anterior
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    if (!currentStoreId || !currentFranchiseId || !isFirebaseInitialized()) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const db = getFirebaseDb();
      const storeDocRef = doc(db, 'franchises', currentFranchiseId, 'stores', currentStoreId);

      const unsub = onSnapshot(
        storeDocRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            let firestoreTaps: TapConfig[] = Array.isArray(data.taps) ? data.taps : [];

            // FALLBACK: If taps[] is empty, try reading from legacy dispensers[] field
            if (firestoreTaps.length === 0 && Array.isArray(data.dispensers)) {
              console.warn('[useTapConfiguration] Falling back to dispensers[] field - store needs migration');
              firestoreTaps = convertDispensersToTaps(data.dispensers);
            }

            const firestoreVersion: number = typeof data.tapsVersion === 'number' ? data.tapsVersion : 0;

            setTaps(firestoreTaps);
            setVersion(firestoreVersion);
            setSource('firestore');

            // Atualizar cache local
            try {
              localStorage.setItem(CACHE_KEY, JSON.stringify({ taps: firestoreTaps, version: firestoreVersion }));
            } catch {
              // localStorage cheio, ignorar
            }
          }
          setLoading(false);
        },
        (err) => {
          console.warn('[useTapConfiguration] onSnapshot error:', err);
          setLoading(false);
        }
      );

      unsubRef.current = unsub;
    } catch (err) {
      console.error('[useTapConfiguration] Failed to subscribe:', err);
      setLoading(false);
    }

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [currentStoreId, currentFranchiseId]);

  // Reportar que uma versão de config foi aplicada no dispositivo
  const reportApplied = useCallback(
    async (appliedVersion: number, result: { status: 'success' | 'error'; errorMsg?: string }) => {
      if (!currentStoreId || !currentFranchiseId || !isFirebaseInitialized()) return;

      try {
        const db = getFirebaseDb();
        const storeDocRef = doc(db, 'franchises', currentFranchiseId, 'stores', currentStoreId);

        await updateDoc(storeDocRef, {
          tapsLastAppliedVersion: appliedVersion,
          tapsLastAppliedStatus: result.status,
          ...(result.errorMsg ? { tapsLastAppliedError: result.errorMsg } : {}),
          tapsLastAppliedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error('[useTapConfiguration] reportApplied error:', err);
      }
    },
    [currentStoreId, currentFranchiseId]
  );

  return { taps, version, loading, source, reportApplied };
}
