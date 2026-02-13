/**
 * ============================================================================
 * AuditPage - Log de Auditoria
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  type FirestoreError,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { auditLogsPath } from '@/lib/pathResolver';
import { useFranchise } from '@/context/FranchiseContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader } from '@/components/layout/PageHeader';
import { FilterBar } from '@/components/layout/FilterBar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Search,
  Clock,
  User,
  Activity,
  Shield,
  Download,
  Loader2,
  Store,
  Settings,
  UserPlus,
  Edit,
  Trash2,
  AlertCircle,
  LogIn,
  LogOut,
  CheckCircle
} from 'lucide-react';
import { NoFranchiseSelected } from '@/components/common/NoFranchiseSelected';
import { LoadingState } from '@/components/common/LoadingState';

interface AuditLog {
  id: string;
  action: string;
  actor: {
    id: string;
    email: string;
    name?: string;
  };
  target?: {
    type: string;
    id: string;
    name?: string;
  };
  details?: Record<string, any>;
  timestamp: Date;
  ip?: string;
}

function parseAuditTimestamp(value: any): Date {
  if (!value) return new Date();

  if (typeof value?.toDate === 'function') {
    return value.toDate();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function normalizeAuditLog(data: Record<string, any>, id: string): AuditLog {
  const actor = data.actor || {
    id: data.performedBy || data.userId || 'system',
    email: data.actorEmail || data.email || 'system@local',
    name: data.actorName || data.userName,
  };

  const target = data.target ||
    (data.targetUserId
      ? {
          type: 'user',
          id: data.targetUserId,
          name: data.targetUserId,
        }
      : undefined);

  const details = data.details ||
    (data.claims
      ? {
          claims: data.claims,
        }
      : undefined);

  return {
    id,
    action: data.action || data.type || 'unknown.action',
    actor,
    target,
    details,
    timestamp: parseAuditTimestamp(data.timestamp || data.createdAt || data.updatedAt),
    ip: data.ip,
  };
}

function getAuditErrorMessage(error: FirestoreError): string {
  if (error.code === 'permission-denied') {
    return 'Sem permissao para ler os logs de auditoria desta franquia.';
  }
  if (error.code === 'failed-precondition') {
    return 'Indice do Firestore ausente para a consulta de auditoria.';
  }
  return 'Erro ao carregar logs de auditoria.';
}

const actionIcons: Record<string, any> = {
  'user.login': LogIn,
  'user.logout': LogOut,
  'user.invite': UserPlus,
  'store.create': Store,
  'store.update': Edit,
  'store.delete': Trash2,
  'settings.update': Settings,
  'default': Activity,
};

const actionLabels: Record<string, string> = {
  'user.login': 'Login',
  'user.logout': 'Logout',
  'user.invite': 'Convite enviado',
  'user.accept_invite': 'Convite aceito',
  'store.create': 'Loja criada',
  'store.update': 'Loja atualizada',
  'store.delete': 'Loja excluída',
  'settings.update': 'Configurações alteradas',
  'product.create': 'Produto criado',
  'product.update': 'Produto atualizado',
  'product.delete': 'Produto excluído',
  'order.create': 'Pedido criado',
  'order.update': 'Pedido atualizado',
};

export function AuditPage() {
  const { currentFranchise } = useFranchise();
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const pageSize = 20;

  const exportToCSV = () => {
    if (!filteredLogs || filteredLogs.length === 0 || !currentFranchise) return;
    
    setIsExporting(true);
    
    // Create CSV content
    const headers = ['Data/Hora', 'Ação', 'Usuário', 'Email', 'Alvo', 'IP'];
    const rows = filteredLogs.map(log => [
      log.timestamp.toLocaleString('pt-BR'),
      actionLabels[log.action] || log.action,
      log.actor.name || '-',
      log.actor.email,
      log.target?.name || log.target?.id || '-',
      log.ip || '-'
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `auditoria-${currentFranchise.name}-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setIsExporting(false);
    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 3000);
  };

  // Real-time audit logs subscription
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [queryError, setQueryError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentFranchise) {
      setLogs([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setQueryError(null);
    const logsCollectionPath = auditLogsPath(currentFranchise.id);
    
    let q = query(
      collection(db, logsCollectionPath),
      orderBy('timestamp', 'desc'),
      limit(pageSize * page)
    );
    
    if (actionFilter !== 'all') {
      q = query(
        collection(db, logsCollectionPath),
        where('action', '==', actionFilter),
        orderBy('timestamp', 'desc'),
        limit(pageSize * page)
      );
    }
    
    let rawUnsubscribe: (() => void) | null = null;
    let legacyUnsubscribe: (() => void) | null = null;

    const cleanupRaw = () => {
      if (rawUnsubscribe) {
        rawUnsubscribe();
        rawUnsubscribe = null;
      }
    };

    const cleanupLegacy = () => {
      if (legacyUnsubscribe) {
        legacyUnsubscribe();
        legacyUnsubscribe = null;
      }
    };

    const subscribeLegacyLogs = () => {
      if (legacyUnsubscribe) return;

      const legacyQuery = query(
        collection(db, 'audit_logs'),
        where('franchiseId', '==', currentFranchise.id),
        limit(pageSize * page)
      );

      legacyUnsubscribe = onSnapshot(
        legacyQuery,
        (legacySnapshot) => {
          const legacyLogs = legacySnapshot.docs
            .map((doc) => normalizeAuditLog(doc.data(), doc.id))
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

          setLogs(legacyLogs);
          setIsLoading(false);
        },
        (legacyError) => {
          console.error('Error fetching legacy audit logs:', legacyError);
          setLogs([]);
          setQueryError(getAuditErrorMessage(legacyError));
          setIsLoading(false);
        }
      );
    };

    const subscribeRawFranchiseLogs = () => {
      if (rawUnsubscribe) return;

      const rawQuery = query(
        collection(db, logsCollectionPath),
        limit(pageSize * page)
      );

      rawUnsubscribe = onSnapshot(
        rawQuery,
        (rawSnapshot) => {
          const rawLogs = rawSnapshot.docs
            .map((doc) => normalizeAuditLog(doc.data(), doc.id))
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

          if (rawLogs.length > 0) {
            cleanupLegacy();
            setLogs(rawLogs);
            setIsLoading(false);
            return;
          }

          subscribeLegacyLogs();
        },
        (rawError) => {
          console.error('Error fetching fallback franchise audit logs:', rawError);
          subscribeLegacyLogs();
        }
      );
    };

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const auditLogs = snapshot.docs.map(doc => normalizeAuditLog(doc.data(), doc.id));

      if (auditLogs.length > 0) {
        cleanupRaw();
        cleanupLegacy();
        setLogs(auditLogs);
        setIsLoading(false);
        return;
      }

      subscribeRawFranchiseLogs();
    }, (error) => {
      console.error('Error fetching audit logs:', error);
      cleanupRaw();
      cleanupLegacy();
      setLogs([]);
      setQueryError(getAuditErrorMessage(error));
      setIsLoading(false);
    });

    // Cleanup subscription on unmount
    return () => {
      unsubscribe();
      cleanupRaw();
      cleanupLegacy();
    };
  }, [currentFranchise?.id, actionFilter, page]);

  const filteredLogs = logs.filter(log =>
    (actionFilter === 'all' || log.action === actionFilter) &&
    (
      (log.actor.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.action || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.target?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const getActionIcon = (action: string) => {
    const Icon = actionIcons[action] || actionIcons['default'];
    return Icon;
  };

  const getActionLabel = (action: string) => {
    return actionLabels[action] || action;
  };

  const getActionBadgeVariant = (action: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (action.includes('delete')) return 'destructive';
    if (action.includes('create')) return 'default';
    if (action.includes('update')) return 'secondary';
    return 'outline';
  };

  if (!currentFranchise) {
    return <NoFranchiseSelected description="Selecione uma franquia no menu lateral para ver o log de auditoria" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoria"
        meta={
          <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
            <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-green-500" />
            Tempo real
          </Badge>
        }
        description={`Histórico de atividades em ${currentFranchise.name}`}
        actions={
          <div className="flex items-center gap-4">
            {exportSuccess && (
              <Alert className="border-green-200 bg-green-50 py-2 text-green-800">
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>Exportado com sucesso!</AlertDescription>
              </Alert>
            )}

            <Button
              variant="outline"
              onClick={exportToCSV}
              disabled={isExporting || isLoading || filteredLogs.length === 0}
            >
              {isExporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Exportar
            </Button>
          </div>
        }
      />

      <FilterBar className="md:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por usuário, ação..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filtrar por ação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            <SelectItem value="user.login">Login</SelectItem>
            <SelectItem value="user.invite">Convites</SelectItem>
            <SelectItem value="store.create">Lojas criadas</SelectItem>
            <SelectItem value="store.update">Lojas atualizadas</SelectItem>
            <SelectItem value="settings.update">Configurações</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {/* Audit Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Log de Atividades
          </CardTitle>
          <CardDescription>
            Registro de todas as ações realizadas na franquia
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {queryError ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{queryError}</AlertDescription>
              </Alert>
            </div>
          ) : isLoading ? (
            <LoadingState />
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              {searchQuery || actionFilter !== 'all' ? (
                <>
                  <h3 className="text-lg font-medium text-foreground mb-1">
                    Nenhum registro encontrado
                  </h3>
                  <p className="text-muted-foreground">
                    Tente ajustar os filtros de busca
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-medium text-foreground mb-1">
                    Nenhuma atividade registrada
                  </h3>
                  <p className="text-muted-foreground">
                    As atividades aparecerão aqui quando ocorrerem
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {filteredLogs.map((log) => {
                const Icon = getActionIcon(log.action);
                
                return (
                  <div 
                    key={log.id}
                    className="flex items-start gap-4 p-4 hover:bg-muted"
                  >
                    <div className="p-2 rounded-full bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={getActionBadgeVariant(log.action)}>
                          {getActionLabel(log.action)}
                        </Badge>
                      </div>
                      
                      <p className="text-sm text-foreground mt-1">
                        <span className="font-medium">
                          {log.actor.name || log.actor.email}
                        </span>
                        {log.target && (
                          <>
                            {' em '}
                            <span className="font-medium">{log.target.name || log.target.id}</span>
                          </>
                        )}
                      </p>
                      
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {log.timestamp.toLocaleString('pt-BR')}
                        </div>
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {log.actor.email}
                        </div>
                        {log.ip && (
                          <span>IP: {log.ip}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {filteredLogs.length >= pageSize && (
            <div className="p-4 border-t text-center">
              <Button 
                variant="outline" 
                onClick={() => setPage(p => p + 1)}
                disabled={isLoading}
              >
                Carregar mais
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
