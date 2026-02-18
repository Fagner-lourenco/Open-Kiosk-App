/**
 * ============================================================================
 * SystemLogsCard - Logs de Sistema (ESP32, pagamentos, etc.)
 * ============================================================================
 * 
 * Card para visualizar logs de sistema do kiosk em tempo real.
 * Usado como tab na AuditPage.
 * Dados vindos de: franchises/{fid}/stores/{sid}/systemLogs
 */

import { useState, useEffect } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  where,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { systemLogsPath } from '@/lib/pathResolver';
import { useFranchise } from '@/context/FranchiseContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Terminal,
  Clock,
  Loader2,
  AlertCircle,
  Info,
  AlertTriangle,
  XCircle,
  Bug,
  Cpu,
  Wifi,
  CreditCard,
  Usb,
  Droplets,
  Cpu as Microchip,
  Store,
} from 'lucide-react';
import { LoadingState } from '@/components/common/LoadingState';

interface SystemLogEntry {
  id: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  message: string;
  details?: Record<string, unknown>;
  deviceId?: string;
  storeId: string;
  timestamp: Date;
}

const levelConfig: Record<string, { icon: typeof Info; color: string; label: string }> = {
  info:  { icon: Info,          color: 'text-blue-600 bg-blue-50 border-blue-200',   label: 'Info' },
  warn:  { icon: AlertTriangle, color: 'text-amber-600 bg-amber-50 border-amber-200', label: 'Alerta' },
  error: { icon: XCircle,       color: 'text-red-600 bg-red-50 border-red-200',       label: 'Erro' },
  debug: { icon: Bug,           color: 'text-gray-500 bg-gray-50 border-gray-200',    label: 'Debug' },
};

const sourceConfig: Record<string, { icon: typeof Cpu; label: string }> = {
  esp32:    { icon: Cpu,        label: 'ESP32' },
  kiosk:    { icon: Terminal,   label: 'Kiosk' },
  payment:  { icon: CreditCard, label: 'Pagamento' },
  serial:   { icon: Usb,        label: 'Serial' },
  dispense: { icon: Droplets,   label: 'Dispense' },
  firmware: { icon: Microchip,  label: 'Firmware' },
};

function parseTimestamp(value: unknown): Date {
  if (!value) return new Date();
  if (typeof (value as { toDate?: () => Date })?.toDate === 'function') {
    return (value as Timestamp).toDate();
  }
  const parsed = new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function SystemLogsCard() {
  const { currentFranchise, stores } = useFranchise();
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 30;

  // Auto-selecionar primeira loja
  useEffect(() => {
    if (stores.length > 0 && !selectedStoreId) {
      setSelectedStoreId(stores[0].id);
    }
  }, [stores, selectedStoreId]);

  // Subscription em tempo real dos system logs
  useEffect(() => {
    if (!currentFranchise || !selectedStoreId) {
      setLogs([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const colPath = systemLogsPath(currentFranchise.id, selectedStoreId);

    // Logs dos últimos 5 dias
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    let constraints = [
      where('timestamp', '>=', Timestamp.fromDate(fiveDaysAgo)),
      orderBy('timestamp', 'desc'),
      limit(pageSize * page),
    ];

    if (levelFilter !== 'all') {
      constraints = [
        where('level', '==', levelFilter),
        where('timestamp', '>=', Timestamp.fromDate(fiveDaysAgo)),
        orderBy('timestamp', 'desc'),
        limit(pageSize * page),
      ];
    }

    if (sourceFilter !== 'all') {
      constraints = [
        where('source', '==', sourceFilter),
        where('timestamp', '>=', Timestamp.fromDate(fiveDaysAgo)),
        orderBy('timestamp', 'desc'),
        limit(pageSize * page),
      ];
    }

    // Ambos filtros ativos
    if (levelFilter !== 'all' && sourceFilter !== 'all') {
      constraints = [
        where('level', '==', levelFilter),
        where('source', '==', sourceFilter),
        where('timestamp', '>=', Timestamp.fromDate(fiveDaysAgo)),
        orderBy('timestamp', 'desc'),
        limit(pageSize * page),
      ];
    }

    const q = query(collection(db, colPath), ...constraints);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const entries: SystemLogEntry[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            level: data.level || 'info',
            source: data.source || 'kiosk',
            message: data.message || '',
            details: data.details || undefined,
            deviceId: data.deviceId,
            storeId: data.storeId || selectedStoreId,
            timestamp: parseTimestamp(data.timestamp),
          };
        });
        setLogs(entries);
        setIsLoading(false);
      },
      (err) => {
        console.error('[SystemLogsCard] Error:', err);
        // Fallback: tentar sem orderBy (índice pode estar ausente)
        const fallbackQ = query(
          collection(db, colPath),
          where('timestamp', '>=', Timestamp.fromDate(fiveDaysAgo)),
          limit(pageSize * page)
        );
        onSnapshot(fallbackQ, (snap) => {
          const entries: SystemLogEntry[] = snap.docs
            .map((doc) => {
              const data = doc.data();
              return {
                id: doc.id,
                level: data.level || 'info',
                source: data.source || 'kiosk',
                message: data.message || '',
                details: data.details || undefined,
                deviceId: data.deviceId,
                storeId: data.storeId || selectedStoreId,
                timestamp: parseTimestamp(data.timestamp),
              };
            })
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
          setLogs(entries);
          setIsLoading(false);
        }, () => {
          setError('Erro ao carregar logs do sistema. Verifique as permissões.');
          setIsLoading(false);
        });
      }
    );

    return () => unsubscribe();
  }, [currentFranchise?.id, selectedStoreId, levelFilter, sourceFilter, page]);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <Select value={selectedStoreId} onValueChange={(v) => { setSelectedStoreId(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <Store className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Selecionar loja" />
          </SelectTrigger>
          <SelectContent>
            {stores.map((store) => (
              <SelectItem key={store.id} value={store.id}>
                {store.name || store.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={levelFilter} onValueChange={(v) => { setLevelFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Nível" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os níveis</SelectItem>
            <SelectItem value="error">🔴 Erro</SelectItem>
            <SelectItem value="warn">🟡 Alerta</SelectItem>
            <SelectItem value="info">🔵 Info</SelectItem>
            <SelectItem value="debug">⚪ Debug</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Fonte" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as fontes</SelectItem>
            <SelectItem value="esp32">ESP32</SelectItem>
            <SelectItem value="serial">Serial (USB)</SelectItem>
            <SelectItem value="payment">Pagamento</SelectItem>
            <SelectItem value="dispense">Dispense</SelectItem>
            <SelectItem value="firmware">Firmware</SelectItem>
            <SelectItem value="kiosk">Kiosk</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Card de logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Logs do Sistema
          </CardTitle>
          <CardDescription>
            Últimos 5 dias de logs do kiosk e ESP32
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          ) : !selectedStoreId ? (
            <div className="text-center py-12">
              <Store className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">
                Selecione uma loja
              </h3>
              <p className="text-muted-foreground">
                Escolha uma loja para visualizar os logs do sistema
              </p>
            </div>
          ) : isLoading ? (
            <LoadingState />
          ) : logs.length === 0 ? (
            <div className="text-center py-12">
              <Terminal className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">
                Nenhum log encontrado
              </h3>
              <p className="text-muted-foreground">
                Os logs aparecerão aqui quando o kiosk gerar eventos
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {logs.map((log) => {
                const level = levelConfig[log.level] || levelConfig.info;
                const source = sourceConfig[log.source] || { icon: Terminal, label: log.source };
                const LevelIcon = level.icon;
                const SourceIcon = source.icon;

                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-3 hover:bg-muted text-sm"
                  >
                    {/* Ícone de nível */}
                    <div className={`p-1.5 rounded-md border ${level.color} shrink-0 mt-0.5`}>
                      <LevelIcon className="h-3.5 w-3.5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Badges + Mensagem */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs font-normal gap-1">
                          <SourceIcon className="h-3 w-3" />
                          {source.label}
                        </Badge>
                        <span className="text-foreground">{log.message}</span>
                      </div>

                      {/* Details */}
                      {log.details && Object.keys(log.details).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {Object.entries(log.details)
                            .slice(0, 5)
                            .map(([key, val]) => (
                              <Badge key={key} variant="secondary" className="text-xs font-normal font-mono">
                                {key}: {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                              </Badge>
                            ))}
                        </div>
                      )}

                      {/* Timestamp + Device */}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {log.timestamp.toLocaleString('pt-BR')}
                        </span>
                        {log.deviceId && (
                          <span className="flex items-center gap-1">
                            <Wifi className="h-3 w-3" />
                            {log.deviceId}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {logs.length >= pageSize && (
            <div className="p-4 border-t text-center">
              <Button
                variant="outline"
                onClick={() => setPage((p) => p + 1)}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Carregar mais
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
