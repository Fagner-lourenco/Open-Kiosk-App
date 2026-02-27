/**
 * ============================================================================
 * CommercialCustomerDetailTab — Customer 360° View
 * ============================================================================
 *
 * Página de detalhe de um cliente agregando dados de múltiplas coleções:
 * - Informações básicas (Customer)
 * - Negociações (Deals)
 * - Orçamentos (Quotes)
 * - Eventos (CommercialEvents)
 * - Atividades (Activities, via deals do cliente)
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  ArrowLeft,
  Building2,
  User2,
  Phone,
  Mail,
  MapPin,
  Tag,
  Edit,
  Archive,
  ArchiveRestore,
  Trash2,
  Loader2,
  AlertTriangle,
  DollarSign,
  FileText,
  CalendarDays,
  CheckCircle,
  ExternalLink,
  TrendingUp,
  Clock,
  Activity,
} from 'lucide-react';
import { useCustomers, type UpdateCustomerInput } from '@/hooks/useCustomers';
import { useDeals } from '@/hooks/useDeals';
import { useQuotes } from '@/hooks/useQuotes';
import { useCommercialEvents } from '@/hooks/useCommercialEvents';
import { useActivities } from '@/hooks/useActivities';
import type {
  Customer,
  CustomerType,
  CustomerSource,
  DealStage,
} from '@/types/commercial';
import type { Activity as ActivityType } from '@/types/commercial';
import { DEAL_STAGE_LABELS } from '@/types/commercial';
import { Timestamp } from 'firebase/firestore';

// ============================================================================
// CONSTANTS
// ============================================================================

const TYPE_LABELS: Record<CustomerType, string> = {
  company: 'Empresa',
  person: 'Pessoa Física',
};

const SOURCE_LABELS: Record<CustomerSource, string> = {
  instagram: 'Instagram',
  indicacao: 'Indicação',
  inbound: 'Inbound',
  outbound: 'Outbound',
  evento_passado: 'Evento Passado',
};

const STAGE_BADGE_COLORS: Record<DealStage, string> = {
  lead: 'bg-blue-100 text-blue-700',
  qualify: 'bg-cyan-100 text-cyan-700',
  proposal: 'bg-yellow-100 text-yellow-700',
  negotiation: 'bg-orange-100 text-orange-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
};

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(ts?: Timestamp | null): string {
  if (!ts) return '—';
  const d = ts instanceof Timestamp ? ts.toDate() : new Date();
  return d.toLocaleDateString('pt-BR');
}

function formatDateTime(ts?: Timestamp | null): string {
  if (!ts) return '—';
  const d = ts instanceof Timestamp ? ts.toDate() : new Date();
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  franchiseId: string;
  storeId: string;
  customerId: string;
}

// ============================================================================
// QUICK EDIT DIALOG — inline customer field editing
// ============================================================================

function QuickEditDialog({
  open,
  onOpenChange,
  customer,
  onSave,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: Customer;
  onSave: (input: UpdateCustomerInput) => Promise<void>;
  isPending: boolean;
}) {
  const [name, setName] = useState(customer.name);
  const [type, setType] = useState<CustomerType>(customer.type);
  const [doc, setDoc] = useState(customer.doc || '');
  const [phone, setPhone] = useState(customer.phones?.[0] || '');
  const [email, setEmail] = useState(customer.emails?.[0] || '');
  const [source, setSource] = useState<CustomerSource | ''>(customer.source || '');
  const [street, setStreet] = useState(customer.address?.street || '');
  const [city, setCity] = useState(customer.address?.city || '');
  const [state, setState] = useState(customer.address?.state || '');
  const [zip, setZip] = useState(customer.address?.zip || '');

  const handleSubmit = async () => {
    if (!name.trim() || !customer.id) return;
    const input: UpdateCustomerInput = {
      customerId: customer.id,
      name: name.trim(),
      type,
      doc: doc || undefined,
      phones: phone ? [phone] : [],
      emails: email ? [email] : [],
      source: source || undefined,
      address: { street, city, state, zip },
    };
    await onSave(input);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Cliente</DialogTitle>
          <DialogDescription>Atualize as informações do cliente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as CustomerType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="person">Pessoa Física</SelectItem>
                  <SelectItem value="company">Empresa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>CPF/CNPJ</Label>
            <Input value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="00.000.000/0000-00" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-0000" />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="exemplo@email.com" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Origem</Label>
            <Select value={source} onValueChange={(v) => setSource(v as CustomerSource)}>
              <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                {Object.entries(SOURCE_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Endereço</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Rua" className="col-span-2" />
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cidade" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="UF" />
                <Input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="CEP" />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CommercialCustomerDetailTab({ franchiseId, storeId, customerId }: Props) {
  const navigate = useNavigate();

  // ── Data hooks ──────────────────────────────────────────────────────────
  const {
    customers,
    loadingCustomers,
    customersError,
    updateCustomer,
    isUpdatingCustomer,
    deleteCustomer,
    isDeletingCustomer,
  } = useCustomers(franchiseId, storeId);

  const { deals, loadingDeals } = useDeals(franchiseId, storeId);
  const { quotes, loadingQuotes } = useQuotes(franchiseId, storeId);
  const { events: commercialEvents, loadingEvents } = useCommercialEvents(franchiseId, storeId);
  const { activities, loadingActivities } = useActivities(franchiseId, storeId);

  // ── Find this customer ──────────────────────────────────────────────────
  const customer = useMemo(
    () => customers.find((c) => c.id === customerId) || null,
    [customers, customerId],
  );

  // ── Filter related data ─────────────────────────────────────────────────
  const customerDeals = useMemo(
    () => deals.filter((d) => d.customerId === customerId),
    [deals, customerId],
  );

  const customerQuotes = useMemo(
    () => quotes.filter((q) => q.customerId === customerId),
    [quotes, customerId],
  );

  const customerEvents = useMemo(
    () => commercialEvents.filter((e) => e.customerId === customerId),
    [commercialEvents, customerId],
  );

  const customerDealIds = useMemo(
    () => new Set(customerDeals.map((d) => d.id).filter(Boolean)),
    [customerDeals],
  );

  const customerActivities = useMemo(
    () => activities.filter((a) => {
      const dealId = (a as ActivityType & { dealId?: string }).dealId;
      return dealId && customerDealIds.has(dealId);
    }),
    [activities, customerDealIds],
  );

  // ── Computed stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const activeDeals = customerDeals.filter((d) => d.stage !== 'won' && d.stage !== 'lost');
    const wonDeals = customerDeals.filter((d) => d.stage === 'won');
    const totalValue = customerDeals.reduce((s, d) => s + d.valueEstimate, 0);
    const wonValue = wonDeals.reduce((s, d) => s + d.valueEstimate, 0);
    const acceptedQuoteValue = customerQuotes
      .filter((q) => q.status === 'accepted')
      .reduce((s, q) => s + q.total, 0);
    const openActivities = customerActivities.filter(
      (a) => a.status === 'open'
    ).length;

    return {
      totalDeals: customerDeals.length,
      activeDeals: activeDeals.length,
      wonDeals: wonDeals.length,
      totalValue,
      wonValue,
      totalQuotes: customerQuotes.length,
      acceptedQuoteValue,
      totalEvents: customerEvents.length,
      openActivities,
    };
  }, [customerDeals, customerQuotes, customerEvents, customerActivities]);

  // ── Local state ─────────────────────────────────────────────────────────
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleArchiveToggle = useCallback(async () => {
    if (!customer?.id) return;
    const newStatus = customer.status === 'active' ? 'archived' : 'active';
    await updateCustomer({ customerId: customer.id, status: newStatus });
  }, [customer, updateCustomer]);

  const handleDelete = useCallback(async () => {
    if (!customer?.id) return;
    try {
      await deleteCustomer(customer.id);
      navigate(-1);
    } catch {
      // toast handled by hook
    }
    setShowDeleteConfirm(false);
  }, [customer, deleteCustomer, navigate]);

  const goBack = () => navigate(-1);

  // ── Loading & Error states ──────────────────────────────────────────────
  const isLoading = loadingCustomers || loadingDeals || loadingQuotes || loadingEvents || loadingActivities;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (customersError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
        <h4 className="text-lg font-medium mb-2">Erro ao carregar cliente</h4>
        <p className="text-sm text-muted-foreground">
          {customersError instanceof Error ? customersError.message : 'Verifique permissões.'}
        </p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
        <h4 className="text-lg font-medium mb-2">Cliente não encontrado</h4>
        <p className="text-sm text-muted-foreground mb-4">
          O cliente com ID &quot;{customerId}&quot; não existe ou foi removido.
        </p>
        <Button variant="outline" onClick={goBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" aria-label="Voltar" onClick={goBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              {customer.type === 'company' ? (
                <Building2 className="h-6 w-6 text-primary" />
              ) : (
                <User2 className="h-6 w-6 text-primary" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold">{customer.name}</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{TYPE_LABELS[customer.type]}</span>
                {customer.source && (
                  <>
                    <span>·</span>
                    <span>{SOURCE_LABELS[customer.source] || customer.source}</span>
                  </>
                )}
                <span>·</span>
                <Badge
                  variant={customer.status === 'active' ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {customer.status === 'active' ? 'Ativo' : 'Arquivado'}
                </Badge>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowEditDialog(true)}>
            <Edit className="h-4 w-4 mr-1" />
            Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleArchiveToggle}
            disabled={isUpdatingCustomer}
          >
            {customer.status === 'active' ? (
              <Archive className="h-4 w-4 mr-1" />
            ) : (
              <ArchiveRestore className="h-4 w-4 mr-1" />
            )}
            {customer.status === 'active' ? 'Arquivar' : 'Reativar'}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Excluir
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{stats.totalDeals}</p>
                <p className="text-xs text-muted-foreground">Negociações</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{formatCurrency(stats.wonValue)}</p>
                <p className="text-xs text-muted-foreground">Valor Ganho</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{stats.totalQuotes}</p>
                <p className="text-xs text-muted-foreground">Orçamentos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-pink-500" />
              <div>
                <p className="text-2xl font-bold">{stats.totalEvents}</p>
                <p className="text-xs text-muted-foreground">Eventos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{stats.openActivities}</p>
                <p className="text-xs text-muted-foreground">Atividades Pendentes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Contact Info + Tags ─────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informações de Contato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {customer.phones.length > 0 && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {customer.phones.map((p, i) => (
                  <span key={i}>{p}</span>
                ))}
              </div>
            )}
            {customer.emails.length > 0 && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                {customer.emails.map((e, i) => (
                  <span key={i}>{e}</span>
                ))}
              </div>
            )}
            {customer.address &&
              (customer.address.street || customer.address.city) && (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span>
                  {[customer.address.street, customer.address.city, customer.address.state, customer.address.zip]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </div>
            )}
            {customer.doc && (
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>{customer.doc}</span>
              </div>
            )}
            {!customer.phones.length && !customer.emails.length && !customer.doc && (
              <p className="text-muted-foreground text-xs italic">
                Nenhuma informação de contato cadastrada.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tags & Detalhes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {customer.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {customer.tags.map((t) => (
                  <Badge key={t} variant="outline" className="text-xs">
                    <Tag className="h-3 w-3 mr-1" />
                    {t}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs italic">Nenhuma tag</p>
            )}
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground pt-2">
              <div>
                <span className="font-medium text-foreground">Criado em:</span>{' '}
                {formatDate(customer.createdAt)}
              </div>
              <div>
                <span className="font-medium text-foreground">Atualizado:</span>{' '}
                {formatDate(customer.updatedAt)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Tabbed Sections ─────────────────────────────────────────── */}
      <Tabs defaultValue="deals" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="deals">
            Negociações ({stats.totalDeals})
          </TabsTrigger>
          <TabsTrigger value="quotes">
            Orçamentos ({stats.totalQuotes})
          </TabsTrigger>
          <TabsTrigger value="events">
            Eventos ({stats.totalEvents})
          </TabsTrigger>
          <TabsTrigger value="activities">
            Atividades ({customerActivities.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Deals ────────────────────────────────────────────── */}
        <TabsContent value="deals">
          {customerDeals.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhuma negociação encontrada para este cliente.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {customerDeals.map((deal) => (
                <Card key={deal.id} className="hover:bg-muted/50 transition-colors">
                  <CardContent className="py-3 px-4 flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{deal.title}</span>
                        <Badge className={`text-xs ${STAGE_BADGE_COLORS[deal.stage]}`}>
                          {DEAL_STAGE_LABELS[deal.stage]}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{formatCurrency(deal.valueEstimate)}</span>
                        {deal.probability > 0 && <span>{deal.probability}% chance</span>}
                        {deal.expectedCloseAt && (
                          <span>Fech. {formatDate(deal.expectedCloseAt)}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        navigate(`/stores/${storeId}/commercial/pipeline`)
                      }
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Quotes ───────────────────────────────────────────── */}
        <TabsContent value="quotes">
          {customerQuotes.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum orçamento encontrado para este cliente.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {customerQuotes.map((quote) => (
                <Card key={quote.id} className="hover:bg-muted/50 transition-colors">
                  <CardContent className="py-3 px-4 flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          Orçamento #{quote.id?.slice(-6)}
                        </span>
                        <QuoteStatusBadge status={quote.status} />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{formatCurrency(quote.total)}</span>
                        {quote.validUntil && (
                          <span>Válido até {formatDate(quote.validUntil)}</span>
                        )}
                        <span>Criado {formatDate(quote.createdAt)}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/stores/${storeId}/commercial/quotes`)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Events ───────────────────────────────────────────── */}
        <TabsContent value="events">
          {customerEvents.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum evento encontrado para este cliente.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {customerEvents.map((ev) => (
                <Card key={ev.id} className="hover:bg-muted/50 transition-colors">
                  <CardContent className="py-3 px-4 flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{ev.title}</span>
                        <EventStatusBadge status={ev.status} />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{formatDateTime(ev.startAt)}</span>
                        {ev.attendeesEstimate && (
                          <span>{ev.attendeesEstimate} convidados</span>
                        )}
                        {ev.locationType && (
                          <span className="capitalize">{ev.locationType}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/stores/${storeId}/commercial/events`)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Activities ───────────────────────────────────────── */}
        <TabsContent value="activities">
          {customerActivities.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhuma atividade encontrada para este cliente.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {customerActivities.map((act) => {
                const dealId = (act as ActivityType & { dealId?: string }).dealId;
                const relatedDeal = customerDeals.find((d) => d.id === dealId);
                return (
                  <Card key={act.id} className="hover:bg-muted/50 transition-colors">
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {act.status === 'done' ? (
                          <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                        ) : (
                          <Clock className="h-5 w-5 text-orange-500 shrink-0" />
                        )}
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{act.summary}</span>
                            <Badge variant="outline" className="text-xs capitalize">
                              {act.type}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {act.dueAt && <span>Vence: {formatDate(act.dueAt)}</span>}
                            {relatedDeal && (
                              <span>Deal: {relatedDeal.title}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Dialogs ────────────────────────────────────────────────── */}
      {showEditDialog && customer && (
        <QuickEditDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          customer={customer}
          onSave={updateCustomer}
          isPending={isUpdatingCustomer}
        />
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{customer.name}</strong>?
              Clientes com negociações, eventos ou orçamentos vinculados precisam ser
              arquivados em vez de excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={isDeletingCustomer}
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

// ============================================================================
// HELPER BADGES
// ============================================================================

function QuoteStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: 'Rascunho', cls: 'bg-gray-100 text-gray-700' },
    sent: { label: 'Enviado', cls: 'bg-blue-100 text-blue-700' },
    accepted: { label: 'Aceito', cls: 'bg-green-100 text-green-700' },
    rejected: { label: 'Rejeitado', cls: 'bg-red-100 text-red-700' },
    expired: { label: 'Expirado', cls: 'bg-yellow-100 text-yellow-700' },
  };
  const info = map[status] || { label: status, cls: 'bg-gray-100 text-gray-700' };
  return <Badge className={`text-xs ${info.cls}`}>{info.label}</Badge>;
}

function EventStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: 'Rascunho', cls: 'bg-gray-100 text-gray-700' },
    confirmed: { label: 'Confirmado', cls: 'bg-green-100 text-green-700' },
    done: { label: 'Realizado', cls: 'bg-blue-100 text-blue-700' },
    canceled: { label: 'Cancelado', cls: 'bg-red-100 text-red-700' },
  };
  const info = map[status] || { label: status, cls: 'bg-gray-100 text-gray-700' };
  return <Badge className={`text-xs ${info.cls}`}>{info.label}</Badge>;
}
