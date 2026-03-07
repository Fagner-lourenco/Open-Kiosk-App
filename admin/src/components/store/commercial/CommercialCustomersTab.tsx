/**
 * ============================================================================
 * CommercialCustomersTab — Cadastro e listagem de clientes CRM
 * ============================================================================
 *
 * CRUD completo de clientes B2B/B2C vinculados a uma loja.
 * Segue o padrão StoreKegsTab: Summary Cards → Filtros → Tabela → Dialogs.
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Contact,
  Users,
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Loader2,
  Archive,
  RotateCcw,
  Building2,
  User,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import { useCustomers, type CreateCustomerInput, type UpdateCustomerInput } from '@/hooks/useCustomers';
import type { Customer, CustomerType, CustomerSource, CustomerStatus } from '@/types/commercial';

// ============================================================================
// CONSTANTS
// ============================================================================

const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  company: 'Empresa',
  person: 'Pessoa Física',
};

const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  active: 'Ativo',
  archived: 'Arquivado',
};

const CUSTOMER_STATUS_COLORS: Record<CustomerStatus, string> = {
  active: 'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-500',
};

const SOURCE_LABELS: Record<CustomerSource, string> = {
  instagram: 'Instagram',
  indicacao: 'Indicação',
  inbound: 'Inbound',
  outbound: 'Outbound',
  evento_passado: 'Evento passado',
};

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  franchiseId: string;
  storeId: string;
}

// ============================================================================
// CREATE / EDIT DIALOG
// ============================================================================

function CustomerDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateCustomerInput) => Promise<unknown>;
  isPending: boolean;
  initialData?: Customer | null;
}) {
  const [name, setName] = useState(initialData?.name || '');
  const [type, setType] = useState<CustomerType>(initialData?.type || 'person');
  const [docField, setDocField] = useState(initialData?.doc || '');
  const [phone, setPhone] = useState(initialData?.phones?.[0] || '');
  const [email, setEmail] = useState(initialData?.emails?.[0] || '');
  const [source, setSource] = useState<CustomerSource | ''>(initialData?.source || '');
  const [tags, setTags] = useState(initialData?.tags?.join(', ') || '');

  // [FIX COM-09] Sincronizar state quando initialData mudar
  useEffect(() => {
    setName(initialData?.name || '');
    setType(initialData?.type || 'person');
    setDocField(initialData?.doc || '');
    setPhone(initialData?.phones?.[0] || '');
    setEmail(initialData?.emails?.[0] || '');
    setSource(initialData?.source || '');
    setTags(initialData?.tags?.join(', ') || '');
  }, [initialData]);

  const isEditing = !!initialData;

  const reset = () => {
    setName('');
    setType('person');
    setDocField('');
    setPhone('');
    setEmail('');
    setSource('');
    setTags('');
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    await onSubmit({
      type,
      name: name.trim(),
      doc: docField.trim() || undefined,
      phones: phone.trim() ? [phone.trim()] : [],
      emails: email.trim() ? [email.trim()] : [],
      source: source || undefined,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Atualize as informações do cliente.'
              : 'Preencha os dados para cadastrar um novo cliente.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Tipo */}
          <div className="space-y-2">
            <Label>Tipo *</Label>
            <Select value={type} onValueChange={(v) => setType(v as CustomerType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="person">Pessoa Física</SelectItem>
                <SelectItem value="company">Empresa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Nome */}
          <div className="space-y-2">
            <Label>{type === 'company' ? 'Razão Social *' : 'Nome *'}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === 'company' ? 'Nome da empresa' : 'Nome completo'}
            />
          </div>

          {/* CPF / CNPJ */}
          <div className="space-y-2">
            <Label>{type === 'company' ? 'CNPJ' : 'CPF'}</Label>
            <Input
              value={docField}
              onChange={(e) => setDocField(e.target.value)}
              placeholder={type === 'company' ? '00.000.000/0000-00' : '000.000.000-00'}
            />
          </div>

          {/* Telefone + Email */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
                type="email"
              />
            </div>
          </div>

          {/* Origem */}
          <div className="space-y-2">
            <Label>Origem</Label>
            <Select value={source} onValueChange={(v) => setSource(v as CustomerSource)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Ex: vip, evento, recorrente (separadas por vírgula)"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || isPending}>
            {isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            {isEditing ? 'Salvar' : 'Cadastrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CommercialCustomersTab({ franchiseId, storeId }: Props) {
  const {
    customers,
    loadingCustomers,
    customersError,
    activeCustomers,
    archivedCustomers,
    createCustomer,
    isCreatingCustomer,
    updateCustomer,
    isUpdatingCustomer,
    deleteCustomer,
    isDeletingCustomer,
  } = useCustomers(franchiseId, storeId);

  const navigate = useNavigate();

  // ── Estado local ────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<CustomerType | 'all'>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);

  // ── Filtragem ───────────────────────────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    let result = customers;
    if (statusFilter !== 'all') {
      result = result.filter((c) => c.status === statusFilter);
    }
    if (typeFilter !== 'all') {
      result = result.filter((c) => c.type === typeFilter);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          c.doc?.toLowerCase().includes(term) ||
          c.emails?.some((e) => e.toLowerCase().includes(term)) ||
          c.phones?.some((p) => p.includes(term)) ||
          c.tags?.some((t) => t.toLowerCase().includes(term))
      );
    }
    return result;
  }, [customers, statusFilter, typeFilter, searchTerm]);

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loadingCustomers) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // [FIX COM-06] Exibir erro quando query falha
  if (customersError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
        <h4 className="text-lg font-medium mb-2">Erro ao carregar clientes</h4>
        <p className="text-sm text-muted-foreground">{customersError instanceof Error ? customersError.message : 'Verifique permissões e conexão.'}</p>
      </div>
    );
  }

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleCreate = async (data: CreateCustomerInput) => {
    await createCustomer(data);
  };

  const handleEdit = async (data: CreateCustomerInput) => {
    if (!editingCustomer?.id) return;
    const input: UpdateCustomerInput = {
      customerId: editingCustomer.id,
      ...data,
    };
    await updateCustomer(input);
    setEditingCustomer(null);
  };

  const handleDelete = async () => {
    if (!deletingCustomer?.id) return;
    await deleteCustomer(deletingCustomer.id);
    setDeletingCustomer(null);
  };

  const handleToggleArchive = async (customer: Customer) => {
    if (!customer.id) return;
    await updateCustomer({
      customerId: customer.id,
      status: customer.status === 'active' ? 'archived' : 'active',
    });
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setTypeFilter('all');
  };

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{customers.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{activeCustomers.length}</p>
                <p className="text-xs text-muted-foreground">Ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">
                  {customers.filter((c) => c.type === 'company').length}
                </p>
                <p className="text-xs text-muted-foreground">Empresas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-2xl font-bold">{archivedCustomers.length}</p>
                <p className="text-xs text-muted-foreground">Arquivados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Main List Card ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Clientes</CardTitle>
              <CardDescription>
                Cadastro de clientes vinculados à loja
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Cliente
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ── Filtros ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome, doc, email..."
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as CustomerStatus | 'all')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="archived">Arquivados</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as CustomerType | 'all')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Tipos</SelectItem>
                <SelectItem value="person">Pessoa Física</SelectItem>
                <SelectItem value="company">Empresa</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={clearFilters}>
              Limpar Filtros
            </Button>
          </div>

          {/* ── Tabela ou Empty ───────────────────────────────────────── */}
          {filteredCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Contact className="h-12 w-12 mb-4" />
              <p className="text-lg font-medium">Nenhum cliente encontrado</p>
              <p className="text-sm">
                {customers.length === 0
                  ? 'Cadastre seu primeiro cliente para começar.'
                  : 'Tente ajustar os filtros de busca.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">
                      <div>
                        <p
                          className="cursor-pointer hover:underline text-primary"
                          onClick={() => customer.id && navigate(`/stores/${storeId}/commercial/customers/${customer.id}`)}
                        >
                          {customer.name}
                        </p>
                        {customer.doc && (
                          <p className="text-xs text-muted-foreground">{customer.doc}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {CUSTOMER_TYPE_LABELS[customer.type]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {customer.phones?.[0] && <p>{customer.phones[0]}</p>}
                        {customer.emails?.[0] && (
                          <p className="text-muted-foreground">{customer.emails[0]}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {customer.source ? (
                        <span className="text-sm">
                          {SOURCE_LABELS[customer.source] || customer.source}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {customer.tags?.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {(customer.tags?.length || 0) > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{customer.tags!.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${CUSTOMER_STATUS_COLORS[customer.status]}`}
                      >
                        {CUSTOMER_STATUS_LABELS[customer.status]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => customer.id && navigate(`/stores/${storeId}/commercial/customers/${customer.id}`)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditingCustomer(customer)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleArchive(customer)}>
                            {customer.status === 'active' ? (
                              <>
                                <Archive className="h-4 w-4 mr-2" />
                                Arquivar
                              </>
                            ) : (
                              <>
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Reativar
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeletingCustomer(customer)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create Dialog ──────────────────────────────────────────────── */}
      <CustomerDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={handleCreate}
        isPending={isCreatingCustomer}
      />

      {/* ── Edit Dialog ────────────────────────────────────────────────── */}
      <CustomerDialog
        open={!!editingCustomer}
        onOpenChange={(v) => {
          if (!v) setEditingCustomer(null);
        }}
        onSubmit={handleEdit}
        isPending={isUpdatingCustomer}
        initialData={editingCustomer}
      />

      {/* ── Delete Confirmation ────────────────────────────────────────── */}
      <AlertDialog
        open={!!deletingCustomer}
        onOpenChange={(v) => {
          if (!v) setDeletingCustomer(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o cliente{' '}
              <strong>{deletingCustomer?.name}</strong>? Esta ação não pode ser
              desfeita. Negociações vinculadas a este cliente não serão excluídas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeletingCustomer}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingCustomer && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
