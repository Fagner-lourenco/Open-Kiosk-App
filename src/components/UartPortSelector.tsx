
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wifi, WifiOff, Usb, RefreshCw } from "lucide-react";
import { esp32Printer } from "@/services/esp32PrinterService";
import { useToast } from "@/hooks/use-toast";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { useTranslation } from "@/i18n";

interface UartPortSelectorProps {
  onPortSelected?: (comPort: string) => void;
  onPrintRequested?: (comPort: string) => void;
  showPrintButton?: boolean;
}

const UartPortSelector = ({ onPortSelected, onPrintRequested, showPrintButton = false }: UartPortSelectorProps) => {
  const [comPortInput, setComPortInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { settings } = useStoreSettings();
  const { t } = useTranslation();

  useEffect(() => {
    checkConnectionStatus();
    // Load COM port from settings if available
    if (settings?.comPort) {
      setComPortInput(settings.comPort);
    }
  }, [settings]);

  const checkConnectionStatus = () => {
    setIsConnected(esp32Printer.isConnected());
  };

  const handleConnect = async () => {
    if (!comPortInput.trim()) {
      toast({
        title: t('common.error'),
        description: t('uart.enterComPort'),
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const connected = await esp32Printer.connectToComPort(comPortInput.trim());
      if (connected) {
        setIsConnected(true);
        onPortSelected?.(comPortInput.trim());
        toast({
          title: t('common.success'),
          description: t('uart.connectedTo', { port: comPortInput.trim() })
        });
      } else {
        throw new Error('Failed to connect');
      }
    } catch (error) {
      console.error('Connection error:', error);
      toast({
        title: t('common.error'),
        description: t('uart.failedToConnect', { port: comPortInput.trim() }),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await esp32Printer.disconnect();
      setIsConnected(false);
      toast({
        title: t('uart.disconnected'),
        description: t('uart.portDisconnected')
      });
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  };

  const handleTestPrint = () => {
    if (comPortInput.trim()) {
      onPrintRequested?.(comPortInput.trim());
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center">
            <Usb className="w-5 h-5 mr-2" />
            {t('uart.portConnection')}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={checkConnectionStatus}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center">
            {isConnected ? (
              <Wifi className="w-4 h-4 text-green-600 mr-2" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-600 mr-2" />
            )}
            <span className="text-sm">
              {isConnected ? t('uart.connected') : t('uart.disconnected')}
            </span>
          </div>
          {isConnected && comPortInput && (
            <Badge variant="outline">
              {comPortInput}
            </Badge>
          )}
        </div>

        {/* COM Port Input */}
        <div className="space-y-2">
          <Label htmlFor="comPort">{t('uart.comPort')}</Label>
          <Input
            id="comPort"
            placeholder="e.g., COM3, COM4, COM5..."
            value={comPortInput}
            onChange={(e) => setComPortInput(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {!isConnected ? (
            <Button
              onClick={handleConnect}
              disabled={loading || !comPortInput.trim()}
              className="flex-1"
            >
              {loading ? t('common.loading') : t('uart.connect')}
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={handleDisconnect}
              className="flex-1"
            >
              {t('uart.disconnect')}
            </Button>
          )}
        </div>

        {/* Print Test Button */}
        {showPrintButton && isConnected && comPortInput && (
          <Button
            onClick={handleTestPrint}
            className="w-full"
          >
            {t('uart.testPrint')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default UartPortSelector;
