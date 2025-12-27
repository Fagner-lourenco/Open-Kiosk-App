import { Check } from "lucide-react";
import { StepperIndicatorProps } from "@/types/checkoutFlow";

export function StepperIndicator({ currentStep, completedSteps, steps }: StepperIndicatorProps) {
  return (
    <div className="w-full mb-4">
      {/* Desktop/Tablet: Stepper completo */}
      <div className="flex items-start justify-between">
        {steps.map((step, index) => {
          const stepNum = (index + 1) as typeof currentStep;
          const isCompleted = completedSteps.includes(stepNum);
          const isCurrent = currentStep === stepNum;

          return (
            <div key={stepNum} className="flex flex-col items-center flex-1 relative">
              {/* Círculo numerado */}
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold text-sm transition-all z-10
                  ${isCurrent ? "bg-blue-600 text-white" : isCompleted ? "bg-green-500 text-white" : "bg-gray-200 text-gray-600"}`}
              >
                {isCompleted ? <Check className="w-5 h-5" /> : stepNum}
              </div>
              
              {/* Linha conectora */}
              {index < steps.length - 1 && (
                <div className={`absolute top-5 left-1/2 w-full h-0.5 ${isCompleted ? "bg-green-500" : "bg-gray-200"}`} />
              )}
              
              {/* Labels centralizados abaixo */}
              <div className="text-center mt-2">
                <p className={`text-xs font-medium ${isCurrent ? "text-blue-600" : isCompleted ? "text-green-600" : "text-gray-900"}`}>
                  {step.label}
                </p>
                {step.description && (
                  <p className="text-[10px] text-gray-500">{step.description}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
