import { AlertCircle, Check, Loader2 } from "lucide-react";
import { ProcessingProgressProps } from "@/types/checkoutFlow";

export function ProcessingProgress({ stage, steps, showPercentage = true }: ProcessingProgressProps) {
  const completedCount = steps.filter((s) => s.status === "completed").length;
  const inProgressCount = steps.filter((s) => s.status === "in-progress").length;
  const totalProgress = steps.length > 0 ? Math.round(((completedCount + inProgressCount * 0.5) / steps.length) * 100) : 0;

  return (
    <div className="space-y-4 w-full">
      <div className="space-y-2">
        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-3">
            <div className="flex-shrink-0">
              {step.status === "completed" && (
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-100">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
              )}
              {step.status === "in-progress" && <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />}
              {step.status === "pending" && <div className="w-6 h-6 rounded-full border-2 border-gray-300" />}
              {step.status === "error" && (
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-red-100">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                </div>
              )}
            </div>
            <span
              className={`text-sm font-medium ${
                step.status === "completed"
                  ? "text-gray-600"
                  : step.status === "in-progress"
                  ? "text-blue-700"
                  : step.status === "error"
                  ? "text-red-700"
                  : "text-gray-500"
              }`}
            >
              {step.status === "completed" && "✓ "}
              {step.status === "in-progress" && "⟳ "}
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {stage === "error" && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200">
          <div className="flex items-center gap-2 text-red-700 text-sm font-semibold">
            <AlertCircle className="w-4 h-4" />
            <span>Ocorreu um erro no processamento</span>
          </div>
        </div>
      )}

      {showPercentage && (
        <div className="pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-600">Progresso</span>
            <span className="text-xs font-bold text-gray-700">{totalProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${totalProgress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
