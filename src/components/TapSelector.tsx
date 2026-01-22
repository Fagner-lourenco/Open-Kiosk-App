/**
 * TapSelector - Componente para seleção de torneira (Multi-Tap)
 * 
 * Exibe as torneiras disponíveis e permite ao usuário escolher qual usar.
 * Integra com ESP32Context para obter status em tempo real.
 */

import { useESP32 } from "@/context/ESP32Context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Beer, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n";

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
  const { numTaps, taps, status } = useESP32();
  const { t } = useTranslation();
  
  // Se não há múltiplas torneiras, não mostrar seletor
  if (numTaps <= 1) {
    return null;
  }
  
  // Gerar array de taps se não vier do ESP32
  const tapList = taps.length > 0 
    ? taps 
    : Array.from({ length: numTaps }, (_, i) => ({
        id: i,
        isDispensing: false,
        orderId: undefined,
        currentCup: 0,
        totalCups: 0,
        mlDispensed: 0,
        targetMl: 0,
        flowStarted: false,
        progress: 0,
      }));

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
            {tap.id + 1}
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
                <p className="font-semibold">{t('tapSelector.tapNumber', { number: tap.id + 1 })}</p>
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
