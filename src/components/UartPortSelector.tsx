/**
 * UartPortSelector - Componente para conexão USB Serial com ESP32
 * 
 * Este componente agora usa o ESP32Context (serviço unificado) para gerenciar
 * a conexão USB Serial, evitando conflitos de lock na porta.
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wifi, WifiOff, Usb, RefreshCw } from "lucide-react";
import { useESP32 } from "@/context/ESP32Context";
import esp32Serial from "@/services/esp32SerialService";
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
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { settings } = useStoreSettings();
  const { t } = useTranslation();
  
  // Usar ESP32Context para status de conexão unificado
  const { status, connectUSB, disconnect } = useESP32();
  const isConnected = status.connected && status.type === 'usb';

  useEffect(() => {
    // Load COM port from settings if available
    if (settings?.comPort) {
      setComPortInput(settings.comPort);
    }
  }, [settings]);

  const handleConnect = async () => {
    setLoading(true);
    try {
      // 🔧 FIX H1: Usar Context (connectUSB) em vez de esp32Serial direto.
      // Isso garante fonte única de verdade e detecta plataforma (Web vs Android).
      const connected = await connectUSB();
      if (connected) {
        onPortSelected?.(comPortInput.trim() || 'USB Serial');
        toast({
          title: t('common.success'),
          description: t('uart.connectedTo', { port: 'USB Serial' })
        });
      } else {
        throw new Error('Failed to connect');
      }
    } catch (error) {
      console.error('Connection error:', error);
      toast({
        title: t('common.error'),
        description: t('uart.failedToConnect', { port: comPortInput.trim() || 'USB Serial' }),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await esp32Serial.disconnect();
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
          <Badge variant={isConnected ? "default" : "secondary"}>
            {isConnected ? "Conectado" : "Desconectado"}
          </Badge>
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
          {isConnected && status.deviceName && (
            <Badge variant="outline">
              {status.deviceName}
            </Badge>
          )}
        </div>

        {/* COM Port Input (informativo - Web Serial usa seletor do navegador) */}
        <div className="space-y-2">
          <Label htmlFor="comPort">{t('uart.comPort')}</Label>
          <Input
            id="comPort"
            placeholder="Clique em Conectar para selecionar a porta..."
            value={comPortInput}
            onChange={(e) => setComPortInput(e.target.value)}
            disabled={loading || isConnected}
          />
          <p className="text-xs text-muted-foreground">
            O navegador abrirá um seletor de porta ao conectar.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {!isConnected ? (
            <Button
              onClick={handleConnect}
              disabled={loading}
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
        {showPrintButton && isConnected && (
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
