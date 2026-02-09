/**
 * TapSelector - Componente para seleção de torneira (Multi-Tap)
 * 
 * Exibe as torneiras disponíveis e permite ao usuário escolher qual usar.
 * Integra com ESP32Context para obter status em tempo real.
 */

import { useESP32 } from "@/context/ESP32Context";
import { useStoreContext } from "@/context/StoreContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Beer, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n";
import { useMemo } from "react";

interface TapSelectorProps {
  /** ID do tap selecionado */
  selectedTapId: number;
  /** Callback quando um tap é selecionado */
  onSelectTap: (tapId: number) => void;
  /** Modo compacto (inline badges) ou modo "card" (cards grandes) */
  mode?: 'compact' | 'card';
  /** Desabilitar seleção */
  disabled?: boolean;
  /** Classe CSS adicional */
  className?: string;
}

export function TapSelector({
  selectedTapId,
  onSelectTap,
  mode = 'card',
  disabled = false,
  className,
}: TapSelectorProps) {
  const { taps: hardwareTaps, numTaps, status } = useESP32();
  const { taps: configuredTaps, tapsLoading, tapsSource } = useStoreContext();
  const { t } = useTranslation();

  // Combinar dados do Store (configuração) com dados do Hardware (status vivo)
  const tapList = useMemo(() => {
    // Se não temos nada do store, usar numTaps do hardware como fallback
    if (configuredTaps.length === 0) {
      return Array.from({ length: numTaps || 1 }, (_, i) => ({
        id: i,
        name: `Torneira ${i + 1}`,
        enabled: true,
        isDispensing: hardwareTaps.find(h => h.id === i)?.isDispensing || false,
        progress: hardwareTaps.find(h => h.id === i)?.progress || 0,
      }));
    }

    // Usar taps do store (filtrando apenas habilitados)
    return configuredTaps
      .filter(tap => tap.enabled)
      .map(tap => {
        const hardwareTap = hardwareTaps.find(h => h.id === tap.id);
        return {
          id: tap.id,
          name: tap.name,
          enabled: true,
          isDispensing: hardwareTap?.isDispensing || false,
          progress: hardwareTap?.progress || 0,
        };
      });
  }, [configuredTaps, hardwareTaps, numTaps]);

  // Se não há taps disponíveis para mostrar
  if (tapList.length <= 1 && tapsSource !== 'none') {
    // No modo quiosque, se só tem 1 tap, talvez nem mostramos o seletor
    // ou mostramos só se for para informar o nome.
    // Mas o requisito numTaps <= 1 costumava retornar null.
    // Vamos manter a lógica de esconder se for 1 ou 0.
    if (tapList.length <= 1) return null;
  }

  // Modo compacto - badges inline
  if (mode === 'compact') {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="text-sm text-muted-foreground mr-1">{t('tapSelector.tap')}:</span>
        {tapList.map((tap) => (
          <Badge
            key={tap.id}
            variant={selectedTapId === tap.id ? "default" : "outline"}
            className={cn(
              "cursor-pointer transition-all",
              selectedTapId === tap.id && "ring-2 ring-primary ring-offset-2",
              tap.isDispensing && "opacity-50 cursor-not-allowed",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            onClick={() => !tap.isDispensing && !disabled && onSelectTap(tap.id)}
          >
            <Beer className="h-3 w-3 mr-1" />
            {tap.name}
            {tap.isDispensing && <Loader2 className="h-3 w-3 ml-1 animate-spin" />}
          </Badge>
        ))}
      </div>
    );
  }

  // Modo normal - cards
  return (
    <div className={cn("grid grid-cols-2 gap-3", className)}>
      {tapList.map((tap) => {
        const isSelected = selectedTapId === tap.id;
        const isBusy = tap.isDispensing;

        return (
          <Card
            key={tap.id}
            className={cn(
              "relative cursor-pointer transition-all hover:shadow-md",
              isSelected && "ring-2 ring-primary shadow-lg",
              isBusy && "opacity-60 cursor-not-allowed",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            onClick={() => !isBusy && !disabled && onSelectTap(tap.id)}
          >
            <CardContent className="p-4 flex flex-col items-center gap-2">
              {/* Ícone */}
              <div className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center",
                isSelected ? "bg-primary text-primary-foreground" : "bg-muted",
                isBusy && "bg-orange-100"
              )}>
                {isBusy ? (
                  <Loader2 className="h-6 w-6 animate-spin text-orange-600" />
                ) : (
                  <Beer className="h-6 w-6" />
                )}
              </div>

              {/* Label */}
              <div className="text-center">
                <p className="font-semibold">{tap.name}</p>
                <p className="text-xs text-muted-foreground">
                  {isBusy ? (
                    <span className="text-orange-600">{t('tapSelector.inUse', { progress: tap.progress })}</span>
                  ) : status.connected ? (
                    <span className="text-green-600">{t('tapSelector.available')}</span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </p>
              </div>

              {/* Indicador de selecionado */}
              {isSelected && !isBusy && (
                <div className="absolute top-2 right-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/**
 * Hook para facilitar o uso do TapSelector
 */
export function useTapSelection(defaultTapId: number = 0) {
  const { selectedTapId, setSelectedTapId, numTaps, taps } = useESP32();

  // Usar o tap do contexto ou o default
  const currentTapId = selectedTapId ?? defaultTapId;

  // Verificar se o tap está disponível
  const isTapAvailable = (tapId: number): boolean => {
    const tap = taps.find(t => t.id === tapId);
    return !tap?.isDispensing;
  };

  // Encontrar próximo tap disponível
  const getNextAvailableTap = (): number => {
    for (let i = 0; i < numTaps; i++) {
      if (isTapAvailable(i)) {
        return i;
      }
    }
    return 0; // Fallback
  };

  return {
    selectedTapId: currentTapId,
    setSelectedTapId,
    numTaps,
    taps,
    isTapAvailable,
    getNextAvailableTap,
    showSelector: numTaps > 1,
  };
}

export default TapSelector;
