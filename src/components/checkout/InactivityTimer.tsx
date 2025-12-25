import { useEffect, useMemo, useRef } from "react";
import { AlertCircle, Clock } from "lucide-react";
import { InactivityTimerProps } from "@/types/checkoutFlow";

export function InactivityTimer({ secondsLeft, maxSeconds, variant, onTimeout, onWarning }: InactivityTimerProps) {
  const percentage = maxSeconds > 0 ? Math.max(0, Math.min(100, (secondsLeft / maxSeconds) * 100)) : 0;

  const { bgColor, textColor, borderColor, icon } = useMemo(() => {
    switch (variant) {
      case "critical":
        return { bgColor: "bg-red-50", textColor: "text-red-700", borderColor: "border-red-200", icon: <AlertCircle className="w-4 h-4" /> };
      case "warning":
        return { bgColor: "bg-yellow-50", textColor: "text-yellow-700", borderColor: "border-yellow-200", icon: <Clock className="w-4 h-4" /> };
      case "running":
      default:
        return { bgColor: "bg-blue-50", textColor: "text-blue-700", borderColor: "border-blue-200", icon: <Clock className="w-4 h-4" /> };
    }
  }, [variant]);

  const progressBarColor = useMemo(() => {
    switch (variant) {
      case "critical":
        return "bg-red-600";
      case "warning":
        return "bg-yellow-500";
      default:
        return "bg-blue-600";
    }
  }, [variant]);

  // Guarded callbacks to avoid firing repeatedly on every render
  const warnedRef = useRef(false);
  const timedOutRef = useRef(false);

  useEffect(() => {
    if (secondsLeft <= 0) {
      if (!timedOutRef.current) {
        timedOutRef.current = true;
        onTimeout?.();
      }
      return;
    }
    // Reset timeout flag when timer is reset
    timedOutRef.current = false;

    if (secondsLeft <= 10) {
      if (!warnedRef.current) {
        warnedRef.current = true;
        onWarning?.(secondsLeft);
      }
    } else {
      // Clear warning guard when time increases back above threshold
      warnedRef.current = false;
    }
  }, [secondsLeft, onTimeout, onWarning]);

  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg p-3`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`flex items-center gap-2 ${textColor} text-sm font-medium`}>
          {icon}
          <span>{variant === "critical" ? "⚠️ URGENTE:" : "Inatividade:"} {secondsLeft}s</span>
        </div>
        <span className={`text-xs ${textColor} font-semibold`}>{Math.round(percentage)}%</span>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div className={`${progressBarColor} h-full transition-all duration-300`} style={{ width: `${percentage}%` }} />
      </div>

      {variant === "critical" && (
        <p className="text-xs text-red-600 mt-2 font-semibold">A sessão fechará em breve se não houver interação</p>
      )}
    </div>
  );
}
