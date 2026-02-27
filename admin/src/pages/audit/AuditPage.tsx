/**
 * ============================================================================
 * AuditPage - Log de Auditoria
 * ============================================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  startAfter,
  type DocumentSnapshot,
  type FirestoreError,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { auditLogsPath } from '@/lib/pathResolver';
import { downloadCSV } from '@/utils/csvExport';
import { useFranchise } from '@/context/FranchiseContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/layout/PageHeader';
import { FilterBar } from '@/components/layout/FilterBar';
import { SystemLogsCard } from '@/components/SystemLogsCard';
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
  CheckCircle,
  Beer,
  Wrench,
  Tv,
  CreditCard,
  Users,
  CalendarDays,
  FileText,
  DollarSign,
  Package,
  Handshake,
} from 'lucide-react';
import { NoFranchiseSelected } from '@/components/common/NoFranchiseSelected';
import { LoadingState } from '@/components/common/LoadingState';
import { getActionLabel as getServiceActionLabel } from '@/services/auditService';

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
  'user.role_change': Shield,
  'user.remove': Trash2,
  'user.profile_update': User,
  'user.password_change': Shield,
  'store.create': Store,
  'store.update': Edit,
  'store.delete': Trash2,
  'store.settings_update': Settings,
  'store.member_add': UserPlus,
  'store.member_remove': Users,
  'product.create': Package,
  'product.update': Package,
  'product.delete': Package,
  'settings.update': Settings,
  'franchise.delete': Trash2,
  'keg.create': Beer,
  'keg.status_update': Beer,
  'tap.connect': Beer,
  'tap.disconnect': Beer,
  'wastage.create': AlertCircle,
  'maintenance.schedule': Wrench,
  'maintenance.complete': Wrench,
  'maintenance.cancel': Wrench,
  'tv.config_update': Tv,
  'event.mode_toggle': Tv,
  'challenge.create': Activity,
  'billing.checkout': CreditCard,
  'billing.portal_open': CreditCard,
  'customer.create': Users,
  'customer.update': Users,
  'customer.delete': Users,
  'deal.create': Handshake,
  'deal.update': Handshake,
  'deal.delete': Handshake,
  'deal.stage_change': Handshake,
  'commercial_event.create': CalendarDays,
  'commercial_event.update': CalendarDays,
  'commercial_event.delete': CalendarDays,
  'quote.create': FileText,
  'quote.update': FileText,
  'quote.delete': FileText,
  'bill.create': DollarSign,
  'bill.update': DollarSign,
  'bill.delete': DollarSign,
  'ledger.create': DollarSign,
  'ledger.update': DollarSign,
  'ledger.delete': DollarSign,
  'invoice.create': FileText,
  'invoice.update': FileText,
  'invoice.delete': FileText,
  'payment.create': CreditCard,
  'payment.delete': CreditCard,
  'calendar.create': CalendarDays,
  'calendar.update': CalendarDays,
  'calendar.delete': CalendarDays,
  'party.create': Users,
  'party.update': Users,
  'party.delete': Users,
  'default': Activity,
};

/** Category groups for the filter dropdown */
const filterGroups = [
  { label: 'Autenticação', actions: ['user.login', 'user.logout'] },
  { label: 'Equipe', actions: ['user.invite', 'user.role_change', 'user.remove', 'user.invite_revoke'] },
  { label: 'Perfil', actions: ['user.profile_update', 'user.password_change'] },
  { label: 'Lojas', actions: ['store.create', 'store.update', 'store.delete', 'store.settings_update', 'store.member_add', 'store.member_remove'] },
  { label: 'Produtos', actions: ['product.create', 'product.update', 'product.delete'] },
  { label: 'Barris/Torneiras', actions: ['keg.create', 'keg.status_update', 'tap.connect', 'tap.disconnect'] },
  { label: 'Perdas/Manutenção', actions: ['wastage.create', 'maintenance.schedule', 'maintenance.complete', 'maintenance.cancel'] },
  { label: 'TV/Eventos/Ranking', actions: ['tv.config_update', 'event.mode_toggle', 'event.goal_set', 'event.goal_disable', 'challenge.create', 'challenge.activate', 'challenge.delete', 'prize.add', 'prize.redeem', 'golden_serve.update'] },
  { label: 'Cobrança', actions: ['billing.checkout', 'billing.portal_open'] },
  { label: 'CRM', actions: ['customer.create', 'customer.update', 'customer.delete', 'deal.create', 'deal.update', 'deal.stage_change', 'deal.delete'] },
  { label: 'Comercial', actions: ['commercial_event.create', 'commercial_event.update', 'commercial_event.delete', 'quote.create', 'quote.update', 'quote.delete'] },
  { label: 'Financeiro', actions: ['bill.create', 'bill.update', 'bill.delete', 'ledger.create', 'ledger.update', 'ledger.delete', 'invoice.create', 'invoice.update', 'invoice.delete', 'payment.create', 'payment.delete', 'fin_category.create', 'fin_category.update', 'fin_category.delete', 'fin_account.create', 'fin_account.update', 'fin_account.delete', 'cost_center.create', 'cost_center.update', 'cost_center.delete'] },
  { label: 'Agenda/Partes', actions: ['calendar.create', 'calendar.update', 'calendar.delete', 'party.create', 'party.update', 'party.delete'] },
  { label: 'Configurações', actions: ['settings.update', 'franchise.delete'] },
];

export function AuditPage() {
  const { currentFranchise } = useFranchise();
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const pageSize = 20;

  const exportToCSV = () => {
    if (!filteredLogs || filteredLogs.length === 0 || !currentFranchise) return;
    
    setIsExporting(true);
    
    const headers = ['Data/Hora', 'Ação', 'Usuário', 'Email', 'Alvo', 'IP'];
    const rows = filteredLogs.map(log => [
      log.timestamp.toLocaleString('pt-BR'),
      getServiceActionLabel(log.action),
      log.actor.name || '-',
      log.actor.email,
      log.target?.name || log.target?.id || '-',
      log.ip || '-'
    ]);
    
    downloadCSV(
      `auditoria-${currentFranchise.name}-${new Date().toISOString().split('T')[0]}.csv`,
      headers,
      rows,
    );
    
    setIsExporting(false);
    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 3000);
  };

  // Real-time audit logs subscription (first page) + cursor-based load more
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [extraLogs, setExtraLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [queryError, setQueryError] = useState<string | null>(null);
  const lastDocRef = useRef<DocumentSnapshot | null>(null);

  // Reset extra logs when filter changes
  useEffect(() => {
    setExtraLogs([]);
    lastDocRef.current = null;
    setHasMore(true);
  }, [currentFranchise?.id, actionFilter]);

  // Real-time subscription for first page only
  useEffect(() => {
    if (!currentFranchise) {
      setLogs([]);
      setIsLoading(false);
      return;
    }

    // Flag para ignorar resultados stale de subscriptions substituídas (race condition fix)
    let cancelled = false;

    setIsLoading(true);
    setQueryError(null);
    const logsCollectionPath = auditLogsPath(currentFranchise.id);
    
    let q = query(
      collection(db, logsCollectionPath),
      orderBy('timestamp', 'desc'),
      limit(pageSize)
    );
    
    if (actionFilter !== 'all') {
      q = query(
        collection(db, logsCollectionPath),
        where('action', '==', actionFilter),
        orderBy('timestamp', 'desc'),
        limit(pageSize)
      );
    }
    
    let rawUnsubscribe: (() => void) | null = null;

    const cleanupRaw = () => {
      if (rawUnsubscribe) {
        rawUnsubscribe();
        rawUnsubscribe = null;
      }
    };

    const subscribeRawFranchiseLogs = () => {
      if (rawUnsubscribe || cancelled) return;

      const rawQuery = query(
        collection(db, logsCollectionPath),
        limit(pageSize)
      );

      rawUnsubscribe = onSnapshot(
        rawQuery,
        (rawSnapshot) => {
          if (cancelled) return;

          const rawLogs = rawSnapshot.docs
            .map((doc) => normalizeAuditLog(doc.data(), doc.id))
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

          // Store last doc for cursor pagination
          if (rawSnapshot.docs.length > 0) {
            lastDocRef.current = rawSnapshot.docs[rawSnapshot.docs.length - 1];
          }
          setHasMore(rawSnapshot.docs.length >= pageSize);
          setLogs(rawLogs);
          setIsLoading(false);
        },
        (rawError) => {
          if (cancelled) return;
          console.error('Error fetching fallback franchise audit logs:', rawError);
          setLogs([]);
          setQueryError(getAuditErrorMessage(rawError));
          setIsLoading(false);
        }
      );
    };

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (cancelled) return;

      const auditLogs = snapshot.docs.map(doc => normalizeAuditLog(doc.data(), doc.id));

      if (auditLogs.length > 0) {
        cleanupRaw();
        // Store last doc for cursor pagination
        if (snapshot.docs.length > 0) {
          lastDocRef.current = snapshot.docs[snapshot.docs.length - 1];
        }
        setHasMore(snapshot.docs.length >= pageSize);
        setLogs(auditLogs);
        setIsLoading(false);
        return;
      }

      subscribeRawFranchiseLogs();
    }, (error) => {
      if (cancelled) return;
      console.error('Error fetching audit logs:', error);
      cleanupRaw();
      setLogs([]);
      setQueryError(getAuditErrorMessage(error));
      setIsLoading(false);
    });

    // Cleanup subscription on unmount — marca cancelled ANTES de unsubscribe
    return () => {
      cancelled = true;
      unsubscribe();
      cleanupRaw();
    };
  }, [currentFranchise?.id, actionFilter]);

  // Load more using cursor-based pagination (getDocs, not real-time)
  const loadMore = useCallback(async () => {
    if (!currentFranchise || !lastDocRef.current || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const logsCollectionPath = auditLogsPath(currentFranchise.id);

      let q = query(
        collection(db, logsCollectionPath),
        orderBy('timestamp', 'desc'),
        startAfter(lastDocRef.current),
        limit(pageSize)
      );

      if (actionFilter !== 'all') {
        q = query(
          collection(db, logsCollectionPath),
          where('action', '==', actionFilter),
          orderBy('timestamp', 'desc'),
          startAfter(lastDocRef.current),
          limit(pageSize)
        );
      }

      const snapshot = await getDocs(q);
      const newLogs = snapshot.docs.map(doc => normalizeAuditLog(doc.data(), doc.id));

      if (snapshot.docs.length > 0) {
        lastDocRef.current = snapshot.docs[snapshot.docs.length - 1];
      }
      setHasMore(snapshot.docs.length >= pageSize);
      setExtraLogs(prev => [...prev, ...newLogs]);
    } catch (err) {
      console.error('Error loading more audit logs:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentFranchise, actionFilter, isLoadingMore]);

  // Combined logs: real-time first page + cursor-loaded extras
  const allLogs = [...logs, ...extraLogs];

  const filteredLogs = allLogs.filter(log =>
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
    return getServiceActionLabel(action);
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
          <div className="flex flex-wrap items-center gap-3">
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

      <Tabs defaultValue="audit" className="space-y-4">
        <TabsList>
          <TabsTrigger value="audit">Auditoria</TabsTrigger>
          <TabsTrigger value="system">Logs do Sistema</TabsTrigger>
        </TabsList>

        <TabsContent value="audit" className="space-y-4">
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
          <SelectTrigger className="w-full md:w-[280px]">
            <SelectValue placeholder="Filtrar por ação" />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value="all">Todas as ações</SelectItem>
            {filterGroups.map((group) => (
              <div key={group.label}>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                  {group.label}
                </div>
                {group.actions.map((action) => (
                  <SelectItem key={action} value={action}>
                    {getServiceActionLabel(action)}
                  </SelectItem>
                ))}
              </div>
            ))}
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

                      {log.details && Object.keys(log.details).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {Object.entries(log.details)
                            .filter(([key]) => !['claims'].includes(key))
                            .slice(0, 6)
                            .map(([key, val]) => (
                              <Badge key={key} variant="outline" className="text-xs font-normal">
                                {key}: {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                              </Badge>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {hasMore && filteredLogs.length >= pageSize && (
            <div className="p-4 border-t text-center">
              <Button 
                variant="outline" 
                onClick={loadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Carregando...
                  </>
                ) : (
                  'Carregar mais'
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="system">
          <SystemLogsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
