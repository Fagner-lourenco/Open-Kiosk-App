import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/i18n';
import {
  Wifi,
  Bluetooth,
  Usb,
  RefreshCw,
  Plug,
  Unplug,
  CheckCircle,
  XCircle,
  Loader2,
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
} from 'lucide-react';
import esp32Service, { ESP32Device, ConnectionStatus } from '@/services/esp32CommunicationService';

const ESP32ConnectionPanel: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [devices, setDevices] = useState<ESP32Device[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false,
    type: 'none',
  });
  const [manualIp, setManualIp] = useState('192.168.1.100');

  // Atualizar status periodicamente
  useEffect(() => {
    const interval = setInterval(() => {
      setConnectionStatus(esp32Service.getConnectionStatus());
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  /**
   * Escanear dispositivos
   */
  const handleScan = async () => {
    setScanning(true);
    setDevices([]);

    try {
      const foundDevices = await esp32Service.scanAllDevices();
      setDevices(foundDevices);

      if (foundDevices.length === 0) {
        toast({
          title: t('common.error'),
          description: t('esp32.noDevicesFound'),
          variant: 'destructive',
        });
      } else {
        toast({
          title: t('common.success'),
          description: `${foundDevices.length} ${t('esp32.devicesFound').toLowerCase()}`,
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setScanning(false);
    }
  };

  /**
   * Conectar a um dispositivo
   */
  const handleConnect = async (device: ESP32Device) => {
    setConnecting(true);

    try {
      const success = await esp32Service.connect(device);

      if (success) {
        setConnectionStatus(esp32Service.getConnectionStatus());
        toast({
          title: t('common.success'),
          description: `${t('esp32.connected')}: ${device.name}`,
        });
      } else {
        toast({
          title: t('common.error'),
          description: t('esp32.connectionFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setConnecting(false);
    }
  };

  /**
   * Conectar via IP manual (WiFi)
   */
  const handleManualConnect = async () => {
    if (!manualIp) return;

    setConnecting(true);

    try {
      const success = await esp32Service.connectWifi(manualIp);

      if (success) {
        setConnectionStatus(esp32Service.getConnectionStatus());
        toast({
          title: t('common.success'),
          description: `${t('esp32.connected')}: ${manualIp}`,
        });
      } else {
        toast({
          title: t('common.error'),
          description: t('esp32.connectionFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setConnecting(false);
    }
  };

  /**
   * Desconectar
   */
  const handleDisconnect = async () => {
    await esp32Service.disconnect();
    setConnectionStatus({ connected: false, type: 'none' });
    toast({
      title: t('esp32.disconnected'),
      description: t('uart.portDisconnected'),
    });
  };

  /**
   * Testar conexão
   */
  const handleTest = async () => {
    // Usar ping em vez de beep (beep não existe no firmware)
    const success = await esp32Service.ping();

    if (success) {
      toast({
        title: t('common.success'),
        description: t('esp32.deviceResponded'),
      });
    } else {
      toast({
        title: t('common.error'),
        description: t('esp32.deviceNotResponding'),
        variant: 'destructive',
      });
    }
  };

  /**
   * Ícone do tipo de conexão
   */
  const getConnectionIcon = (type: string) => {
    switch (type) {
      case 'bluetooth':
        return <Bluetooth className="w-5 h-5 text-blue-500" />;
      case 'wifi':
        return <Wifi className="w-5 h-5 text-green-500" />;
      case 'usb':
        return <Usb className="w-5 h-5 text-orange-500" />;
      default:
        return <XCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  /**
   * Ícone de intensidade de sinal
   */
  const getSignalIcon = (rssi?: number) => {
    if (!rssi) return <Signal className="w-4 h-4 text-gray-400" />;
    if (rssi > -50) return <SignalHigh className="w-4 h-4 text-green-500" />;
    if (rssi > -70) return <SignalMedium className="w-4 h-4 text-yellow-500" />;
    return <SignalLow className="w-4 h-4 text-red-500" />;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="w-5 h-5" />
          {t('esp32.title')}
        </CardTitle>
        <CardDescription>
          {t('esp32.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Status da Conexão */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3">
            {getConnectionIcon(connectionStatus.type)}
            <div>
              <p className="font-medium">
                {connectionStatus.connected ? t('esp32.connected') : t('esp32.disconnected')}
              </p>
              {connectionStatus.deviceName && (
                <p className="text-sm text-gray-500">{connectionStatus.deviceName}</p>
              )}
            </div>
          </div>

          <Badge variant={connectionStatus.connected ? 'default' : 'secondary'}>
            {connectionStatus.connected ? (
              <>
                <CheckCircle className="w-3 h-3 mr-1" /> {t('esp32.online')}
              </>
            ) : (
              <>
                <XCircle className="w-3 h-3 mr-1" /> {t('esp32.offline')}
              </>
            )}
          </Badge>
        </div>

        {/* Ações de Conexão */}
        {connectionStatus.connected ? (
          <div className="flex gap-2">
            <Button onClick={handleTest} variant="outline" className="flex-1">
              {t('esp32.testConnection')}
            </Button>
            <Button onClick={handleDisconnect} variant="destructive" className="flex-1">
              <Unplug className="w-4 h-4 mr-2" />
              {t('esp32.disconnect')}
            </Button>
          </div>
        ) : (
          <>
            {/* Scan Automático */}
            <div className="space-y-2">
              <Label>{t('esp32.scanDevices')}</Label>
              <Button onClick={handleScan} disabled={scanning} className="w-full">
                {scanning ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('esp32.scanning')}
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" /> {t('esp32.scanDevices')}
                  </>
                )}
              </Button>
            </div>

            {/* Lista de Dispositivos Encontrados */}
            {devices.length > 0 && (
              <div className="space-y-2">
                <Label>
                  {t('esp32.devicesFound')} ({devices.length})
                </Label>
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                  {devices.map((device) => (
                    <div
                      key={device.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        {getConnectionIcon(device.type)}
                        <div>
                          <p className="font-medium text-sm">{device.name}</p>
                          <p className="text-xs text-gray-500">
                            {device.type === 'wifi'
                              ? device.ipAddress
                              : device.id}
                          </p>
                        </div>
                        {device.rssi && getSignalIcon(device.rssi)}
                      </div>

                      <Button
                        size="sm"
                        onClick={() => handleConnect(device)}
                        disabled={connecting}
                      >
                        {connecting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          t('uart.connect')
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Conexão Manual (WiFi) */}
            <div className="space-y-2 pt-4 border-t">
              <Label>{t('esp32.manualWifi')}</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="192.168.1.100"
                  value={manualIp}
                  onChange={(e) => setManualIp(e.target.value)}
                />
                <Button
                  onClick={handleManualConnect}
                  disabled={connecting || !manualIp}
                >
                  {connecting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Wifi className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                {t('esp32.enterIp')}
              </p>
            </div>
          </>
        )}

        {/* Informações */}
        <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
          <p className="font-semibold mb-1">💡 {t('esp32.tips')}:</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>
              <strong>WiFi:</strong> {t('esp32.tipWifi')}
            </li>
            <li>
              <strong>Bluetooth:</strong> {t('esp32.tipBluetooth')}
            </li>
            <li>
              <strong>USB:</strong> {t('esp32.tipUsb')}
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default ESP32ConnectionPanel;
