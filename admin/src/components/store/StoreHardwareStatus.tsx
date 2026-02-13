/**
 * ============================================================================
 * StoreHardwareStatus - Componente de Status de Hardware
 * ============================================================================
 * 
 * Exibe o status de hardware de uma loja (ESP32, Dispensers, Impressora)
 * em tempo real usando listener do Firestore.
 * 
 * NOTA: Este componente é SOMENTE LEITURA. O controle de hardware
 * permanece exclusivo do Kiosk.
 */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Wifi, 
  WifiOff, 
  Usb, 
  Printer, 
  Droplets,
  Clock,
  AlertTriangle,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TapStatusInfo {
  id: number;
  isDispensing: boolean;
  orderId?: string;
  progress?: number;
}

interface HardwareStatus {
  esp32Connected: boolean;
  esp32Type?: 'usb' | 'wifi' | 'bluetooth';
  esp32Port?: string;
  esp32Ip?: string;
  firmwareVersion?: string;
  dispensersTotal: number;
  dispensersOnline: number;
  printerConnected: boolean;
  printerPort?: string;
  lastHeartbeat: Date | null;
  updatedAt: Date | null;
  kioskVersion?: string;
  // 🆕 Multi-Tap Support
  numTaps?: number;
  taps?: TapStatusInfo[];
  hardwareId?: string;
}

interface StoreHardwareStatusProps {
  franchiseId: string;
  storeId: string;
  compact?: boolean;
}

export function StoreHardwareStatus({ franchiseId, storeId, compact = false }: StoreHardwareStatusProps) {
  const [status, setStatus] = useState<HardwareStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    if (!franchiseId || !storeId) {
      setLoading(false);
      return;
    }

    const statusRef = doc(db, `franchises/${franchiseId}/stores/${storeId}/hardware/status`);
    
    const unsubscribe = onSnapshot(statusRef, (snapshot) => {
      setLoading(false);
      if (snapshot.exists()) {
        const data = snapshot.data();
        const hardwareStatus: HardwareStatus = {
          esp32Connected: data.esp32Connected ?? false,
          esp32Type: data.esp32Type,
          esp32Port: data.esp32Port,
          esp32Ip: data.esp32Ip,
          firmwareVersion: data.firmwareVersion,
          dispensersTotal: data.dispensersTotal ?? 0,
          dispensersOnline: data.dispensersOnline ?? 0,
          printerConnected: data.printerConnected ?? false,
          printerPort: data.printerPort,
          lastHeartbeat: data.lastHeartbeat?.toDate?.() || null,
          updatedAt: data.updatedAt?.toDate?.() || null,
          kioskVersion: data.kioskVersion,
          // 🆕 Multi-Tap
          numTaps: data.numTaps,
          taps: data.taps,
          hardwareId: data.hardwareId,
        };
        setStatus(hardwareStatus);
        
        // Verificar se o status está desatualizado (mais de 2 minutos)
        if (hardwareStatus.lastHeartbeat) {
          const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
          setIsStale(hardwareStatus.lastHeartbeat < twoMinutesAgo);
        }
      } else {
        setStatus(null);
      }
    }, (error) => {
      console.error('[StoreHardwareStatus] Erro:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [franchiseId, storeId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center text-muted-foreground">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          <p>Nenhum status de hardware disponível</p>
          <p className="text-xs mt-1">O Kiosk precisa estar online para reportar o status</p>
        </CardContent>
      </Card>
    );
  }

  // Modo compacto - apenas badges inline
  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <Badge 
          variant={status.esp32Connected && !isStale ? 'default' : 'secondary'}
          className={status.esp32Connected && !isStale ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'}
        >
          {status.esp32Connected ? (
            status.esp32Type === 'usb' ? <Usb className="h-3 w-3 mr-1" /> : <Wifi className="h-3 w-3 mr-1" />
          ) : (
            <WifiOff className="h-3 w-3 mr-1" />
          )}
          ESP32 {status.esp32Connected ? 'Online' : 'Offline'}
        </Badge>
        
        <Badge 
          variant="secondary"
          className={status.dispensersOnline > 0 ? 'bg-blue-100 text-blue-800' : 'bg-muted text-muted-foreground'}
        >
          <Droplets className="h-3 w-3 mr-1" />
          {status.dispensersOnline}/{status.dispensersTotal} Dispensers
        </Badge>
        
        {status.printerConnected && (
          <Badge variant="secondary" className="bg-purple-100 text-purple-800">
            <Printer className="h-3 w-3 mr-1" />
            Impressora
          </Badge>
        )}
        
        {isStale && (
          <Badge variant="destructive">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Desatualizado
          </Badge>
        )}
      </div>
    );
  }

  // Modo completo - Card com detalhes
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Status de Hardware</CardTitle>
          {isStale && (
            <Badge variant="destructive" className="animate-pulse">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Desatualizado
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ESP32 Status */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
          <div className="flex items-center gap-3">
            {status.esp32Connected ? (
              status.esp32Type === 'usb' ? (
                <div className="p-2 rounded-full bg-green-100">
                  <Usb className="h-5 w-5 text-green-600" />
                </div>
              ) : (
                <div className="p-2 rounded-full bg-green-100">
                  <Wifi className="h-5 w-5 text-green-600" />
                </div>
              )
            ) : (
              <div className="p-2 rounded-full bg-muted">
                <WifiOff className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div>
              <p className="font-medium">ESP32</p>
              <p className="text-sm text-muted-foreground">
                {status.esp32Connected 
                  ? `Conectado via ${status.esp32Type?.toUpperCase() || 'USB'}`
                  : 'Desconectado'
                }
              </p>
            </div>
          </div>
          <div className="text-right">
            {status.esp32Connected ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-muted-foreground/50" />
            )}
          </div>
        </div>

        {/* Dispensers / Multi-Tap Status */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${status.dispensersOnline > 0 || status.numTaps ? 'bg-blue-100' : 'bg-muted'}`}>
              <Droplets className={`h-5 w-5 ${status.dispensersOnline > 0 || status.numTaps ? 'text-blue-600' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="font-medium">
                {status.numTaps ? `Torneiras (${status.numTaps})` : 'Dispensadores'}
              </p>
              <p className="text-sm text-muted-foreground">
                {status.numTaps 
                  ? `${status.taps?.filter(t => t.isDispensing).length || 0} em uso`
                  : `${status.dispensersOnline} de ${status.dispensersTotal} online`
                }
              </p>
            </div>
          </div>
          <div className="text-right">
            {status.numTaps ? (
              <div className="flex items-center gap-1">
                {status.taps?.map((tap) => (
                  <div 
                    key={tap.id}
                    className={`w-3 h-3 rounded-full ${tap.isDispensing ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`}
                    title={`Torneira ${tap.id + 1}${tap.isDispensing ? ` - Dispensando (${tap.progress}%)` : ' - Livre'}`}
                  />
                ))}
              </div>
            ) : (
              <>
                <span className="text-2xl font-bold text-blue-600">{status.dispensersOnline}</span>
                <span className="text-muted-foreground">/{status.dispensersTotal}</span>
              </>
            )}
          </div>
        </div>

        {/* Printer Status */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${status.printerConnected ? 'bg-purple-100' : 'bg-muted'}`}>
              <Printer className={`h-5 w-5 ${status.printerConnected ? 'text-purple-600' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="font-medium">Impressora Térmica</p>
              <p className="text-sm text-muted-foreground">
                {status.printerConnected 
                  ? `Porta ${status.printerPort || 'configurada'}`
                  : 'Não conectada'
                }
              </p>
            </div>
          </div>
          <div className="text-right">
            {status.printerConnected ? (
              <CheckCircle className="h-5 w-5 text-purple-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-muted-foreground/50" />
            )}
          </div>
        </div>

        {/* Metadados */}
        <div className="pt-3 border-t text-sm text-muted-foreground space-y-1">
          {status.lastHeartbeat && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>
                Último heartbeat: {formatDistanceToNow(status.lastHeartbeat, { addSuffix: true, locale: ptBR })}
              </span>
            </div>
          )}
          {status.firmwareVersion && (
            <p>Firmware: v{status.firmwareVersion}</p>
          )}
          {status.kioskVersion && (
            <p>Kiosk: v{status.kioskVersion}</p>
          )}
          {status.hardwareId && (
            <p className="font-mono text-xs">ID: {status.hardwareId}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default StoreHardwareStatus;
