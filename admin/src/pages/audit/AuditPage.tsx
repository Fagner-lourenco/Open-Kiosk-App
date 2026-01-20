/**
 * ============================================================================
 * AuditPage - Log de Auditoria
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFranchise } from '@/context/FranchiseContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Search,
  Clock,
  User,
  Activity,
  Shield,
  Download,
  Building2,
  Loader2,
  Store,
  Settings,
  UserPlus,
  Edit,
  Trash2,
  LogIn,
  LogOut,
  CheckCircle
} from 'lucide-react';

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

  useEffect(() => {
    if (!currentFranchise) {
      setLogs([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    
    let q = query(
      collection(db, `franchises/${currentFranchise.id}/auditLogs`),
      orderBy('timestamp', 'desc'),
      limit(pageSize * page)
    );
    
    if (actionFilter !== 'all') {
      q = query(
        collection(db, `franchises/${currentFranchise.id}/auditLogs`),
        where('action', '==', actionFilter),
        orderBy('timestamp', 'desc'),
        limit(pageSize * page)
      );
    }
    
    // Subscribe to real-time updates
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const auditLogs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          action: data.action,
          actor: data.actor,
          target: data.target,
          details: data.details,
          timestamp: data.timestamp?.toDate() || new Date(),
          ip: data.ip,
        };
      });
      
      setLogs(auditLogs);
      setIsLoading(false);
    }, (error) => {
      console.error('Error fetching audit logs:', error);
      setIsLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [currentFranchise?.id, actionFilter, page]);

  const filteredLogs = logs.filter(log =>
    log.actor.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.target?.name?.toLowerCase().includes(searchQuery.toLowerCase())
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
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Building2 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <CardTitle>Nenhuma franquia selecionada</CardTitle>
            <CardDescription>
              Selecione uma franquia no menu lateral para ver o log de auditoria
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Auditoria</h1>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
              Tempo real
            </Badge>
          </div>
          <p className="text-gray-500">
            Histórico de atividades em {currentFranchise.name}
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {exportSuccess && (
            <Alert className="border-green-200 bg-green-50 text-green-800 py-2">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Exportado com sucesso!
              </AlertDescription>
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
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
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
      </div>

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
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="h-12 w-12 mx-auto text-gray-300 mb-4" />
              {searchQuery || actionFilter !== 'all' ? (
                <>
                  <h3 className="text-lg font-medium text-gray-900 mb-1">
                    Nenhum registro encontrado
                  </h3>
                  <p className="text-gray-500">
                    Tente ajustar os filtros de busca
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-medium text-gray-900 mb-1">
                    Nenhuma atividade registrada
                  </h3>
                  <p className="text-gray-500">
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
                    className="flex items-start gap-4 p-4 hover:bg-gray-50"
                  >
                    <div className="p-2 rounded-full bg-gray-100">
                      <Icon className="h-4 w-4 text-gray-600" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={getActionBadgeVariant(log.action)}>
                          {getActionLabel(log.action)}
                        </Badge>
                      </div>
                      
                      <p className="text-sm text-gray-900 mt-1">
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
                      
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
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
