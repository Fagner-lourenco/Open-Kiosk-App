import { useEffect, useMemo, useRef } from "react";
import { AlertCircle, Clock } from "lucide-react";
import { InactivityTimerProps } from "@/types/checkoutFlow";
import { useTranslation } from "@/i18n";

export function InactivityTimer({ secondsLeft, maxSeconds, variant, onTimeout, onWarning }: InactivityTimerProps) {
  const { t } = useTranslation();
  const percentage = maxSeconds > 0 ? Math.max(0, Math.min(100, (secondsLeft / maxSeconds) * 100)) : 0;

  const { textColor, progressColor, showUrgent } = useMemo(() => {
    switch (variant) {
      case "critical":
        return { textColor: "text-red-600", progressColor: "bg-red-500", showUrgent: true };
      case "warning":
        return { textColor: "text-amber-600", progressColor: "bg-amber-500", showUrgent: false };
      case "running":
      default:
        return { textColor: "text-gray-500", progressColor: "bg-blue-500", showUrgent: false };
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

  // Versão compacta para estados normais
  if (variant === "running" && percentage > 50) {
    return (
      <div className="flex items-center justify-between text-xs text-gray-400 px-1">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          <span>{secondsLeft}s</span>
        </div>
        <div className="flex-1 mx-3 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div className={`${progressColor} h-full transition-all duration-300`} style={{ width: `${percentage}%` }} />
        </div>
      </div>
    );
  }

  // Versão expandida para warning/critical ou baixo tempo
  return (
    <div className={`rounded-lg p-2.5 ${variant === "critical" ? "bg-red-50 border border-red-200" : variant === "warning" ? "bg-amber-50 border border-amber-200" : "bg-gray-50 border border-gray-200"}`}>
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 ${textColor} text-sm font-medium`}>
          {showUrgent ? <AlertCircle className="w-4 h-4 animate-pulse" /> : <Clock className="w-4 h-4" />}
          <span>{showUrgent && "⚠️ "}{secondsLeft}s</span>
        </div>
        <span className={`text-xs ${textColor} font-medium`}>{Math.round(percentage)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden mt-2">
        <div className={`${progressColor} h-full transition-all duration-300`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
