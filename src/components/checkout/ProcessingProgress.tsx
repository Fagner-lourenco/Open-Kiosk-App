import { AlertCircle, Check, Loader2 } from "lucide-react";
import { ProcessingProgressProps } from "@/types/checkoutFlow";
import { useTranslation } from "@/i18n";

export function ProcessingProgress({ stage, steps, showPercentage = true }: ProcessingProgressProps) {
  const { t } = useTranslation();
  const completedCount = steps.filter((s) => s.status === "completed").length;
  const inProgressStep = steps.find((s) => s.status === "in-progress");
  const totalProgress = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  // Versão simplificada - mostra apenas o passo atual
  return (
    <div className="w-full text-center space-y-4">
      {/* Indicador principal */}
      <div className="flex flex-col items-center justify-center gap-3">
        {stage === "error" ? (
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
        ) : inProgressStep ? (
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : (
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <Check className="w-8 h-8 text-green-600" />
          </div>
        )}

        {/* Texto do passo atual */}
        <p className={`font-medium ${
          stage === "error" ? "text-red-700" : inProgressStep ? "text-blue-700" : "text-green-700"
        }`}>
          {stage === "error" 
            ? t('checkout.processingError')
            : inProgressStep?.label || t('checkout.completed')
          }
        </p>
      </div>

      {/* Barra de progresso simples */}
      {showPercentage && stage !== "error" && (
        <div className="w-full max-w-xs mx-auto">
          <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div className="bg-blue-600 h-full transition-all duration-500 ease-out" style={{ width: `${totalProgress}%` }} />
          </div>
          <p className="text-xs text-gray-500 mt-1">{completedCount}/{steps.length}</p>
        </div>
      )}
    </div>
  );
}
