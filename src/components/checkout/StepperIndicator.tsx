import { Check } from "lucide-react";
import { StepperIndicatorProps } from "@/types/checkoutFlow";

export function StepperIndicator({ currentStep, completedSteps, steps }: StepperIndicatorProps) {
  return (
    <div className="w-full mb-4">
      <div className="hidden sm:flex items-center justify-between">
        {steps.map((step, index) => {
          const stepNum = (index + 1) as typeof currentStep;
          const isCompleted = completedSteps.includes(stepNum);
          const isCurrent = currentStep === stepNum;

          return (
            <div key={stepNum} className="flex items-center flex-1">
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold text-sm transition-all
                  ${isCurrent ? "bg-blue-600 text-white" : isCompleted ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}
              >
                {isCompleted ? <Check className="w-5 h-5" /> : stepNum}
              </div>
              {index < steps.length - 1 && (
                <div className={`flex-1 h-1 mx-2 ${isCompleted ? "bg-green-100" : "bg-gray-200"}`} />
              )}
            </div>
          );
        })}
      </div>

      <div className="sm:hidden flex items-center justify-between">
        {steps.map((_, index) => {
          const stepNum = (index + 1) as typeof currentStep;
          const isCompleted = completedSteps.includes(stepNum);
          const isCurrent = currentStep === stepNum;

          return (
            <div
              key={stepNum}
              className={`flex items-center justify-center w-8 h-8 rounded-full font-semibold text-xs transition-all
                ${isCurrent ? "bg-blue-600 text-white" : isCompleted ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}
            >
              {isCompleted ? <Check className="w-4 h-4" /> : stepNum}
            </div>
          );
        })}
      </div>

      <div className="hidden md:grid grid-cols-4 gap-2 mt-3 text-center text-xs text-gray-600">
        {steps.map((step, idx) => (
          <div key={idx} className="truncate">
            <p className="font-medium text-gray-900">{step.label}</p>
            {step.description && <p className="text-gray-500">{step.description}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
