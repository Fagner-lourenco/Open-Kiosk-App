import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, CupSoda, Clock } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { Product } from "@/types/product";
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "@/i18n";

interface DrinkPickupScreenProps {
  isOpen: boolean;
  orderNumber: string;
  drinkData: {
    product: Product;
    sizeLabel: string;
    mlPerUnit: number;
    quantity: number;
    price: number;
    totalAmount: number;
  } | null;
  timeoutSeconds?: number;
  onComplete: () => void;
  onTimeout?: () => void;
}

const DrinkPickupScreen = ({ 
  isOpen, 
  orderNumber, 
  drinkData, 
  timeoutSeconds = 80,
  onComplete,
  onTimeout 
}: DrinkPickupScreenProps) => {
  const { currentCurrency } = useSettings();
  const { t } = useTranslation();
  const [timeLeft, setTimeLeft] = useState(timeoutSeconds);

  useEffect(() => {
    if (!isOpen) {
      setTimeLeft(timeoutSeconds);
      return;
    }

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (onTimeout) {
            onTimeout();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, timeoutSeconds, onTimeout]);

  if (!drinkData) return null;

  const progressValue = (timeLeft / timeoutSeconds) * 100;
  const isUrgent = timeLeft <= 20;

  return (
    <Dialog open={isOpen} onOpenChange={onComplete}>
      <DialogContent className="w-full sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-700">
            {t('drinkPickup.drinkReady')}
          </DialogTitle>
          <DialogDescription>
            {t('drinkPickup.readyForPickup')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-center">
          <div className="flex flex-col items-center gap-3">
            <CupSoda className={`w-16 h-16 ${isUrgent ? 'text-red-500 animate-bounce' : 'text-blue-500'}`} />
            <p className="text-base font-semibold text-gray-800">
              {t('drinkPickup.positionCup')}
            </p>
          </div>

          {/* Timer com contagem regressiva */}
          <div className={`p-6 rounded-lg ${isUrgent ? 'bg-red-50 border-2 border-red-300' : 'bg-blue-50 border-2 border-blue-300'}`}>
            <div className="flex items-center justify-center gap-2 mb-2">
              <Clock className={`w-5 h-5 ${isUrgent ? 'text-red-600' : 'text-blue-600'}`} />
              <p className={`text-sm font-medium ${isUrgent ? 'text-red-700' : 'text-blue-700'}`}>
                {t('drinkPickup.timeToPickup')}
              </p>
            </div>
            <div className={`text-6xl font-mono font-bold ${isUrgent ? 'text-red-600 animate-pulse' : 'text-blue-600'}`}>
              {timeLeft}s
            </div>
            <Progress value={progressValue} className="mt-4 h-3" />
            {isUrgent && (
              <p className="text-xs text-red-600 font-medium mt-2 animate-pulse">
                {t('drinkPickup.pickupNowWarning')}m mt-2 animate-pulse">
                ⚠️ Retire agora ou a máquina será liberada!
              </p>
            )}
          </div>

          <div className="bg-gray-50 border rounded-lg p-4 text-left space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">{t('drinkPickup.order')}</span>
              <span className="font-semibold">#{orderNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('drinkPickup.product')}</span>
              <span className="font-medium">{drinkData.product.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('drinkPickup.size')}</span>
              <span className="font-medium">{drinkData.sizeLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('drinkPickup.quantity')}</span>
              <span className="font-medium">{drinkData.quantity} x {drinkData.mlPerUnit}ml</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('drinkPickup.total')}</span>
              <span className="font-semibold">
                {currentCurrency.symbol}
                {drinkData.totalAmount.toFixed(2)}
              </span>
            </div>
          </div>

          <Button className="w-full" onClick={onComplete} size="lg">
            {t('drinkPickup.drinkPickedUp')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DrinkPickupScreen;
